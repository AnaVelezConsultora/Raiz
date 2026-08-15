import { Injectable, Logger } from '@nestjs/common';
import { decode, verify } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { ErrorSesion, Identidad, VerificadorTokenPort } from '../../dominio/puertos';

/**
 * Verificacion del token de sesion.
 *
 * DOS MODOS, Y LA DIFERENCIA IMPORTA
 *
 * Con `COGNITO_JWKS_URI` configurado, verifica la firma contra el juego de llaves
 * publicas del proveedor. Es el modo de preproduccion y produccion.
 *
 * Sin esa variable, opera en modo local: lee el `sub` del token SIN verificar firma,
 * para que el entorno de `entorno/` funcione sin levantar un proveedor de identidad.
 *
 * El modo local se anuncia en el arranque con una advertencia visible. Un servidor que
 * acepta tokens sin firma y no lo dice es la clase de cosa que sobrevive hasta
 * produccion porque nadie la nota.
 *
 * @version 0.1.0
 */
@Injectable()
export class VerificadorToken implements VerificadorTokenPort {
  private readonly log = new Logger(VerificadorToken.name);
  private readonly jwks: JwksClient | null;

  constructor() {
    const uri = process.env['COGNITO_JWKS_URI'];
    this.jwks = uri ? new JwksClient({ jwksUri: uri, cache: true, rateLimit: true }) : null;

    if (!this.jwks) {
      this.log.warn(
        'MODO LOCAL: los tokens NO se verifican. Configure COGNITO_JWKS_URI antes de ' +
          'exponer esta API a una red que no sea la suya.'
      );
    }
  }

  async verificar(token: string): Promise<Identidad> {
    return this.jwks ? this.verificarFirma(token) : this.leerSinVerificar(token);
  }

  private async verificarFirma(token: string): Promise<Identidad> {
    try {
      const cabecera = decode(token, { complete: true })?.header;
      if (!cabecera?.kid) throw new Error('el token no indica que llave lo firmo');

      const llave = await this.jwks!.getSigningKey(cabecera.kid);
      const cargaUtil = verify(token, llave.getPublicKey(), {
        algorithms: ['RS256'],
        issuer: process.env['COGNITO_ISSUER']
      });

      return this.extraerSub(cargaUtil);
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'desconocido';
      this.log.warn(`Token rechazado: ${detalle}`);
      // No se devuelve el detalle al cliente: le diria a quien prueba tokens en que
      // se equivoco. El voluntario solo necesita saber que debe volver a entrar.
      throw new ErrorSesion();
    }
  }

  private leerSinVerificar(token: string): Identidad {
    const cargaUtil = decode(token);
    if (!cargaUtil) throw new ErrorSesion('El token no se pudo leer.');
    return this.extraerSub(cargaUtil);
  }

  private extraerSub(cargaUtil: unknown): Identidad {
    const sub = (cargaUtil as { sub?: unknown })?.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new ErrorSesion('El token no identifica a ningun usuario.');
    }
    return { sub };
  }
}
