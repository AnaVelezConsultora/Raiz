import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException
} from '@aws-sdk/client-cognito-identity-provider';
import { Injectable, Logger } from '@nestjs/common';
import {
  AdministradorIdentidadPort,
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
  ): Promise<string> {
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
      return sub;
    } catch (e) {
      if (e instanceof UsernameExistsException) {
        throw new ErrorRechazo('Ya hay un voluntario con ese correo.');
      }
      if (e instanceof ErrorTransporte || e instanceof ErrorRechazo) throw e;

      const nombreError = e instanceof Error ? e.name : 'desconocido';
      const detalle = e instanceof Error ? e.message : '';

      // InvalidPasswordException es lo que el custodio puede corregir; el resto no.
      if (nombreError === 'InvalidPasswordException') {
        throw new ErrorRechazo(`La clave no cumple la politica del pool. ${detalle}`);
      }

      this.log.error(`Cognito rechazo el alta (${nombreError}): ${detalle}`);
      throw new ErrorTransporte('No se pudo dar de alta al voluntario. Reintente.');
    }
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
