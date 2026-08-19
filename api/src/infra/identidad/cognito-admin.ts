import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException
} from '@aws-sdk/client-cognito-identity-provider';
import { Injectable, Logger } from '@nestjs/common';
import {
  AdministradorIdentidadPort,
  AltaEnProveedor,
  ErrorRechazo,
  ErrorTransporte
} from '../../dominio/puertos';

/**
 * Alta de voluntarios en Cognito.
 *
 * POR QUE AQUI SI SE USA EL SDK Y EN EL INICIO DE SESION NO
 *
 * No es incoherencia: son dos APIs distintas de Cognito.
 *
 * `InitiateAuth`, la del inicio de sesion, NO va firmada — quien se autentica es el
 * voluntario con sus propias credenciales, y por eso alcanza con una peticion HTTPS
 * corriente. `AdminCreateUser`, en cambio, la ejecuta la organizacion con credenciales
 * de cuenta y EXIGE firma SigV4.
 *
 * Firmar SigV4 a mano son unas cien lineas de derivacion de llaves, orden canonico de
 * cabeceras y sumas SHA-256. Se puede, y es exactamente el sitio donde un error no da
 * la cara: la firma sale mal, AWS responde 403 y el mensaje no dice cual de los quince
 * pasos fue. Aqui el SDK vale sus megabytes.
 *
 * El SDK toma las credenciales de la cadena estandar: variables de entorno, perfil
 * compartido, o el rol de la tarea cuando corra en Fargate. En ningun caso van escritas
 * en el codigo.
 *
 * @version 0.1.0
 */
@Injectable()
export class CognitoAdministrador implements AdministradorIdentidadPort {
  private readonly log = new Logger(CognitoAdministrador.name);
  private cliente: CognitoIdentityProviderClient | null = null;

  async crearVoluntario(
    correo: string,
    nombre: string,
    telefono: string | null,
    clave: string
  ): Promise<AltaEnProveedor> {
    const poolId = this.exigir('COGNITO_USER_POOL_ID');
    const usuario = correo.trim().toLowerCase();

    const atributos = [
      { Name: 'email', Value: usuario },
      // Se marca verificado porque la organizacion ya sabe quien es: lo dio de alta el
      // custodio, no se registro solo. Pedirle ademas que confirme un correo que
      // probablemente cae en spam es una jornada perdida.
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: nombre }
    ];
    if (telefono) atributos.push({ Name: 'phone_number', Value: telefono });

    // Se recuerda si la cuenta la creo ESTA llamada, para poder deshacerla si el
    // segundo paso falla. Sin esto, un fallo al fijar la clave deja en el proveedor
    // una cuenta que existe, no puede entrar y no tiene perfil — que es exactamente
    // lo que paso con la clave que no cumplia la politica.
    let creadaAqui = false;

    try {
      const creado = await this.conectar().send(
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: usuario,
          UserAttributes: atributos,
          // Cognito no manda correo. Sin dominio propio el suyo cae en spam, y una
          // clave que el voluntario no recibe no sirve de nada. La entrega la
          // coordinacion por el canal que ya usan.
          MessageAction: 'SUPPRESS'
        })
      );

      const sub = creado.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) throw new ErrorTransporte('Cognito creo el usuario pero no devolvio su identificador.');
      creadaAqui = true;

      // Clave DEFINITIVA y no temporal. Una temporal obliga a cambiarla en el primer
      // ingreso, y ese cambio es un desafio de Cognito que la API todavia no resuelve:
      // el voluntario quedaria creado y sin poder entrar.
      await this.conectar().send(
        new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: usuario,
          Password: clave,
          Permanent: true
        })
      );

      this.log.log(`Voluntario dado de alta en Cognito: ${sub}`);
      return { sub, yaExistia: false };
    } catch (e) {
      if (e instanceof UsernameExistsException) {
        // La recuperacion va DENTRO del traductor y no en su lugar. Antes se
        // devolvia aqui mismo, asi que un fallo suyo —fijar la clave de una cuenta a
        // medias— salia crudo y llegaba al custodio como «el servidor no pudo
        // atender la peticion, reintente». Reintentar con la misma clave invalida
        // falla igual, para siempre.
        try {
          return await this.recuperarExistente(poolId, usuario, clave);
        } catch (fallo) {
          throw this.traducir(fallo, usuario);
        }
      }

      // Si la cuenta se creo en esta llamada y lo que fallo fue el segundo paso, se
      // deshace. Un alta a medias es recuperable —el flujo de arriba la repara— pero
      // dejarla ahi obliga a que alguien repita el alta a ciegas, sin saber que
      // existe una cuenta suya en el proveedor.
      if (creadaAqui) await this.deshacer(poolId, usuario);

      throw this.traducir(e, usuario);
    }
  }

  /**
   * Un error de Cognito, dicho de forma que se pueda actuar.
   *
   * La distincion que importa es entre lo que el custodio puede corregir —la clave,
   * el telefono, el correo— y lo que no. Lo primero se rechaza con el detalle a la
   * vista; lo segundo se registra y se pide reintentar, que ahi si es un consejo
   * util.
   */
  private traducir(e: unknown, usuario: string): Error {
    if (e instanceof ErrorTransporte || e instanceof ErrorRechazo) return e;

    const nombreError = e instanceof Error ? e.name : 'desconocido';
    const detalle = e instanceof Error ? e.message : '';

    const corregibles: Record<string, string> = {
      InvalidPasswordException: 'La clave no cumple la politica del proveedor.',
      InvalidParameterException: 'Alguno de los datos no tiene el formato que exige el proveedor.',
      UsernameExistsException: 'Ese correo ya tiene cuenta.'
    };

    if (corregibles[nombreError]) {
      this.log.warn(`Alta de ${usuario} rechazada (${nombreError}): ${detalle}`);
      return new ErrorRechazo(`${corregibles[nombreError]} ${detalle}`.trim());
    }

    this.log.error(`Cognito rechazo el alta de ${usuario} (${nombreError}): ${detalle}`);
    return new ErrorTransporte('No se pudo dar de alta al voluntario. Reintente.');
  }

  /** Retira una cuenta que se acaba de crear y no llego a quedar utilizable. */
  private async deshacer(poolId: string, usuario: string): Promise<void> {
    try {
      await this.conectar().send(
        new AdminDeleteUserCommand({ UserPoolId: poolId, Username: usuario })
      );
      this.log.warn(`Alta de ${usuario} deshecha: la cuenta no llego a quedar utilizable.`);
    } catch (e) {
      // Que no se pueda deshacer no cambia lo que hay que decirle al custodio, y el
      // flujo de recuperacion arregla la cuenta si vuelve a intentarlo. Se anota.
      const detalle = e instanceof Error ? e.message : 'desconocido';
      this.log.error(`No se pudo deshacer el alta de ${usuario}: ${detalle}`);
    }
  }

  /**
   * La cuenta ya estaba en Cognito. Se averigua su `sub` en vez de rendirse.
   *
   * ESTO ES EL HALLAZGO H16. Antes, un correo repetido terminaba aqui en un
   * rechazo seco, y eso rompia la promesa que el propio servicio hacia: que
   * repetir un alta interrumpida la arregla. No la arreglaba — la primera
   * escritura era la que se negaba, asi que la segunda no llegaba a intentarse
   * nunca y quedaba una cuenta capaz de autenticarse e incapaz de entrar.
   *
   * POR QUE LA CLAVE SOLO SE TOCA A VECES, Y ESTO ES LO IMPORTANTE
   *
   * Reponer la clave siempre convertiria «dar de alta» en «restablecer la clave de
   * quien sea» sin decirlo: el custodio que da de alta por descuido a alguien que
   * ya existe le cambiaria la clave a esa persona, que al dia siguiente no puede
   * entrar y no sabe por que.
   *
   * El estado de la cuenta distingue los dos casos sin ambiguedad, porque lo
   * escribe el propio Cognito:
   *
   *   FORCE_CHANGE_PASSWORD  AdminCreateUser corrio y AdminSetUserPassword no.
   *                          El alta quedo a medias: hay que terminarla.
   *   CONFIRMED              las dos corrieron. La cuenta esta completa y su clave
   *                          es de su dueno. No se toca.
   *
   * Si la cuenta esta completa, esto devuelve `yaExistia` y no hace nada mas.
   * Decidir si eso es un duplicado que hay que rechazar o un perfil que falta por
   * reflejar le toca a quien sabe si la persona tiene perfil, que no es este
   * adaptador.
   */
  private async recuperarExistente(
    poolId: string,
    usuario: string,
    clave: string
  ): Promise<AltaEnProveedor> {
    let existente;
    try {
      existente = await this.conectar().send(
        new AdminGetUserCommand({ UserPoolId: poolId, Username: usuario })
      );
    } catch (e) {
      // Cognito dijo que existe y acto seguido no lo encuentra. Es temporal o es
      // una carrera; en ninguno de los dos casos es culpa del dato que mandaron,
      // asi que se clasifica como transporte y el custodio reintenta.
      const detalle = e instanceof Error ? e.message : 'desconocido';
      this.log.error(`Cognito dice que ${usuario} existe pero no se pudo leer: ${detalle}`);
      throw new ErrorTransporte('No se pudo consultar la cuenta existente. Reintente.');
    }

    const sub = existente.UserAttributes?.find((a) => a.Name === 'sub')?.Value;
    if (!sub) {
      throw new ErrorTransporte('Cognito no devolvio el identificador de la cuenta existente.');
    }

    if (existente.UserStatus === 'FORCE_CHANGE_PASSWORD') {
      this.log.warn(`Alta a medias de ${sub}: se le fija la clave definitiva y se continua.`);
      await this.conectar().send(
        new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: usuario,
          Password: clave,
          Permanent: true
        })
      );
    }

    return { sub, yaExistia: true };
  }

  private conectar(): CognitoIdentityProviderClient {
    if (!this.cliente) {
      this.cliente = new CognitoIdentityProviderClient({
        region: this.exigir('AWS_REGION'),
        // Permite apuntar a cognito-local sin cambiar codigo, igual que el inicio de
        // sesion. Vacio en la nube, donde el SDK arma la direccion con la region.
        ...(process.env['COGNITO_ENDPOINT']
          ? { endpoint: process.env['COGNITO_ENDPOINT'] }
          : {})
      });
    }
    return this.cliente;
  }

  private exigir(variable: string): string {
    const valor = process.env[variable];
    if (!valor) throw new ErrorTransporte(`Falta la variable de entorno ${variable}.`);
    return valor;
  }
}
