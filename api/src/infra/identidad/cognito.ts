import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  Credenciales,
  ErrorRechazo,
  ErrorSesion,
  ErrorTransporte,
  ProveedorIdentidadPort,
  TokenEmitido
} from '../../dominio/puertos';

/** Lo que responde InitiateAuth cuando las credenciales sirven. */
interface RespuestaAuth {
  AuthenticationResult?: {
    AccessToken?: string;
    IdToken?: string;
    ExpiresIn?: number;
  };
  ChallengeName?: string;
  __type?: string;
  message?: string;
}

/**
 * Autenticacion contra Cognito.
 *
 * POR QUE NO SE USA EL SDK DE AWS
 *
 * `InitiateAuth` con el flujo de usuario y clave es una API NO firmada: no requiere
 * SigV4 ni credenciales de cuenta, porque quien se autentica es el usuario final. Es
 * una peticion JSON con dos cabeceras. Traer el SDK completo por eso son varios
 * megabytes en la imagen del contenedor y una dependencia mas que mantener.
 *
 * QUE HACE QUE ESTO FUNCIONE IGUAL EN PRODUCCION Y EN LA MAQUINA DE QUIEN PROGRAMA
 *
 * Lo unico que cambia es la direccion: en local apunta a cognito-local, en la nube al
 * servicio real. El protocolo es el mismo. Pero hay cuatro cosas que el entorno local
 * NO ejercita y que en produccion aparecen, asi que estan resueltas aqui a proposito:
 *
 *  1. SECRETO DEL CLIENTE. Si el cliente de la nube se crea con secreto, Cognito exige
 *     `SECRET_HASH` y sin el rechaza TODO inicio de sesion. El entorno local crea el
 *     cliente sin secreto, de modo que sin esto la primera autenticacion en produccion
 *     fallaria y nadie sabria por que.
 *  2. DESAFIOS. Cognito real puede responder con un desafio en vez de un token:
 *     cambio de clave obligatorio, segundo factor. cognito-local casi nunca lo hace.
 *  3. CODIGOS DE ERROR REALES. Usuario sin confirmar, clave por restablecer, demasiados
 *     intentos. Cada uno necesita un mensaje distinto para que el voluntario sepa que
 *     hacer.
 *  4. LIMITE DE PETICIONES. Cognito responde 429 y eso es transporte, no rechazo: hay
 *     que reintentar, no mandar al voluntario a revisar su clave.
 *
 * @version 0.1.0
 */
@Injectable()
export class CognitoIdentidad implements ProveedorIdentidadPort {
  private readonly log = new Logger(CognitoIdentidad.name);
  private static readonly ESPERA_MS = 10_000;

  async autenticar({ correo, clave }: Credenciales): Promise<TokenEmitido> {
    const clienteId = this.exigir('COGNITO_CLIENT_ID');
    const usuario = correo.trim().toLowerCase();

    const parametros: Record<string, string> = { USERNAME: usuario, PASSWORD: clave };

    // Solo si el cliente tiene secreto. Un cliente publico no lo lleva, y mandarlo
    // cuando no toca tambien hace fallar la peticion.
    const secreto = process.env['COGNITO_CLIENT_SECRET'];
    if (secreto) {
      parametros['SECRET_HASH'] = createHmac('sha256', secreto)
        .update(usuario + clienteId)
        .digest('base64');
    }

    const respuesta = await this.llamar('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clienteId,
      AuthParameters: parametros
    });

    // Cognito respondio, pero pide algo mas antes de dar el token.
    if (respuesta.ChallengeName) {
      throw new ErrorRechazo(this.mensajeDeDesafio(respuesta.ChallengeName));
    }

    const token = respuesta.AuthenticationResult?.AccessToken;
    if (!token) {
      throw new ErrorTransporte('El proveedor de identidad no devolvio un token.');
    }

    const segundos = respuesta.AuthenticationResult?.ExpiresIn;

    return {
      token,
      expiraEn: segundos ? new Date(Date.now() + segundos * 1000).toISOString() : null,
      sub: this.subDelToken(token)
    };
  }

  // ---------------------------------------------------------------------------

  /**
   * Direccion del servicio.
   *
   * `COGNITO_ENDPOINT` la fija el entorno local; en la nube se arma con la region, que
   * es lo que hace que el mismo codigo sirva en los dos lados sin ramas.
   */
  private direccion(): string {
    const explicita = process.env['COGNITO_ENDPOINT'];
    if (explicita) return explicita.replace(/\/+$/, '');
    return `https://cognito-idp.${this.exigir('AWS_REGION')}.amazonaws.com`;
  }

  private async llamar(operacion: string, cuerpo: unknown): Promise<RespuestaAuth> {
    let respuesta: Response;

    try {
      respuesta = await fetch(this.direccion(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${operacion}`
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(CognitoIdentidad.ESPERA_MS)
      });
    } catch (e) {
      // No hubo respuesta: el proveedor no se alcanzo. Es temporal.
      const detalle = e instanceof Error ? e.message : 'desconocido';
      this.log.error(`No se alcanzo el proveedor de identidad: ${detalle}`);
      throw new ErrorTransporte('No se pudo contactar al proveedor de identidad.');
    }

    const datos = (await respuesta.json().catch(() => ({}))) as RespuestaAuth;
    if (respuesta.ok) return datos;

    throw this.traducir(respuesta.status, datos.__type ?? '');
  }

  /**
   * Traduce el fallo de Cognito a la taxonomia del dominio.
   *
   * La regla de fondo: lo que el voluntario puede corregir es rechazo, lo que no
   * depende de el es transporte. Confundirlas hace que la aplicacion le pida revisar su
   * clave cuando el problema es que el servicio esta saturado.
   */
  private traducir(estado: number, tipo: string): Error {
    const nombre = tipo.split('#').pop() ?? '';

    switch (nombre) {
      case 'NotAuthorizedException':
      case 'UserNotFoundException':
        // A proposito el mismo mensaje para los dos: decir "ese correo no existe"
        // le confirma a quien prueba correos cuales estan registrados, y aqui el
        // padron son familias afectadas.
        return new ErrorSesion('Correo o clave incorrectos.');

      case 'UserNotConfirmedException':
        return new ErrorRechazo(
          'La cuenta existe pero no esta confirmada. Pida al coordinador que la active.'
        );

      case 'PasswordResetRequiredException':
        return new ErrorRechazo('Debe cambiar su clave antes de entrar.');

      case 'TooManyRequestsException':
      case 'LimitExceededException':
        return new ErrorTransporte('Demasiados intentos. Espere un momento y reintente.');

      case 'InvalidParameterException':
        return new ErrorRechazo('El correo o la clave no tienen un formato valido.');

      default:
        this.log.error(`Cognito respondio ${estado} ${nombre || '(sin tipo)'}`);
        return estado >= 500
          ? new ErrorTransporte('El proveedor de identidad fallo. Reintente.')
          : new ErrorSesion('No fue posible iniciar sesion.');
    }
  }

  private mensajeDeDesafio(desafio: string): string {
    switch (desafio) {
      case 'NEW_PASSWORD_REQUIRED':
        return 'Su cuenta exige cambiar la clave antes del primer ingreso. Pida al coordinador que se la asigne definitiva.';
      case 'SMS_MFA':
      case 'SOFTWARE_TOKEN_MFA':
        return 'Su cuenta pide segundo factor y Raiz todavia no lo soporta. Avise al coordinador.';
      default:
        return `Su cuenta requiere un paso adicional (${desafio}) que Raiz todavia no soporta.`;
    }
  }

  /**
   * Lee el `sub` del token sin verificar la firma.
   *
   * Aqui NO hace falta verificarla: el token acaba de salir del proveedor por una
   * conexion cifrada y no paso por manos de nadie. La verificacion de firma es para los
   * tokens que LLEGAN del dispositivo, y de eso se encarga VerificadorToken.
   */
  private subDelToken(token: string): string {
    const partes = token.split('.');
    if (partes.length !== 3) throw new ErrorTransporte('El proveedor devolvio un token ilegible.');

    try {
      const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
      const sub = carga?.sub;
      if (typeof sub !== 'string' || !sub) throw new Error('sin sub');
      return sub;
    } catch {
      throw new ErrorTransporte('El proveedor devolvio un token sin identificador de usuario.');
    }
  }

  private exigir(variable: string): string {
    const valor = process.env[variable];
    if (!valor) {
      // Se cae al arrancar la peticion y no en silencio: una API que "funciona" pero
      // rechaza todo inicio de sesion es peor que una que dice que le falta config.
      throw new ErrorTransporte(`Falta la variable de entorno ${variable}.`);
    }
    return valor;
  }
}
