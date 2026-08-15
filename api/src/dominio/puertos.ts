import { CasoParaSincronizar, CasoSincronizado } from '@raiz/dominio';

/**
 * Puertos del dominio del servidor.
 *
 * Mismo principio que en la PWA: los servicios dependen de estas abstracciones, no de
 * PostgreSQL ni del proveedor de identidad. Las implementaciones concretas se enlazan
 * en un solo archivo, composicion.module.ts, que es el app.config.ts del servidor.
 *
 * @version 0.1.0
 */

/** Quien hace la peticion. Sale del token, nunca del cuerpo del mensaje. */
export interface Identidad {
  /** Identificador del usuario en el proveedor de identidad. */
  sub: string;
}

/** Verifica un token y devuelve la identidad. Lo implementa el adaptador del proveedor. */
export interface VerificadorTokenPort {
  verificar(token: string): Promise<Identidad>;
}

/** Persistencia de casos. Lo implementa el adaptador de PostgreSQL. */
export interface CasoRepositorioPort {
  /**
   * Registra el caso a nombre de quien lo envia.
   *
   * Es idempotente por `origenId`: el reintento tras un corte de senal actualiza la
   * misma fila y devuelve el mismo codigo.
   */
  registrar(caso: CasoParaSincronizar, identidad: Identidad): Promise<CasoSincronizado>;
}

/** Comprueba que la base responde. Se usa en la ruta de disponibilidad. */
export interface SaludPort {
  baseAlcanzable(): Promise<boolean>;
}

// =============================================================================
// Taxonomia de error del ADR 003.
//
// Tres clases con tres respuestas distintas, porque el cliente hace cosas muy
// diferentes con cada una:
//
//   sesion      -> detiene la cola y pide reconectar. NO consume intentos.
//   rechazo     -> el dato no sirve; marcar para revision humana y seguir con el resto.
//   transporte  -> algo temporal; detener la pasada y reintentar mas tarde.
//
// Confundir sesion con rechazo es el defecto descrito en hallazgos-revision.md H10:
// con la sesion vencida el cliente quema el contador de intentos y deja los casos
// fuera del envio sin decirselo a nadie.
// =============================================================================

export class ErrorSesion extends Error {
  constructor(mensaje = 'La sesion no es valida o expiro.') {
    super(mensaje);
    this.name = 'ErrorSesion';
  }
}

export class ErrorRechazo extends Error {
  constructor(
    mensaje: string,
    /** Detalle por campo, para que la mesa sepa que corregir. */
    readonly detalles: string[] = []
  ) {
    super(mensaje);
    this.name = 'ErrorRechazo';
  }
}

export class ErrorTransporte extends Error {
  constructor(mensaje = 'El servidor no pudo atender la peticion. Reintente.') {
    super(mensaje);
    this.name = 'ErrorTransporte';
  }
}

/** Simbolos de inyeccion. El unico lugar que los asocia a una clase es composicion.module.ts. */
export const CASO_REPOSITORIO = Symbol('CASO_REPOSITORIO');
export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');
export const SALUD = Symbol('SALUD');
