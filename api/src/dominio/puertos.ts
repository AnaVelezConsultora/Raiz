import { CasoParaSincronizar, CasoSincronizado, Rol } from '@raiz/dominio';

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

/** Credenciales que el voluntario escribe en la pantalla de acceso. */
export interface Credenciales {
  correo: string;
  clave: string;
}

/** Lo que devuelve el proveedor de identidad cuando las credenciales sirven. */
export interface TokenEmitido {
  /** El token que el dispositivo mandara en cada peticion. */
  token: string;
  /** Momento de expiracion en ISO, o null si el proveedor no lo dice. */
  expiraEn: string | null;
  /** Identificador del usuario en el proveedor. */
  sub: string;
}

/**
 * Autentica contra el proveedor de identidad.
 *
 * El navegador NUNCA habla con el proveedor: le habla a la API y la API decide. Asi la
 * pantalla de acceso es nuestra, los mensajes de error estan en el idioma y el tono del
 * proyecto, y cambiar de proveedor no obliga a tocar la PWA.
 */
export interface ProveedorIdentidadPort {
  autenticar(credenciales: Credenciales): Promise<TokenEmitido>;
}

/** Perfil de aplicacion del voluntario. Vive en la tabla `perfiles`. */
export interface Perfil {
  id: string;
  nombre: string;
  /**
   * Se usa el enum compartido y no una lista repetida aqui: los cinco roles ya estan
   * definidos una sola vez en @raiz/dominio, con los mismos valores que el tipo rol_t
   * de PostgreSQL. Repetirlos seria invitar a que un dia sean cuatro en un lado y
   * cinco en el otro.
   */
  rol: Rol;
  organizacionId: number | null;
  telefono: string | null;
  activo: boolean;
}

/**
 * Lee el perfil desde la base.
 *
 * EL ROL NO VIVE EN EL TOKEN, Y ESA ES LA DECISION IMPORTANTE
 *
 * Si el rol viajara dentro del token, ascender a un validador o retirar a alguien no
 * surtiria efecto hasta que su token caducara. En una emergencia ese retraso es
 * justamente el que no se puede tener: el custodio necesita poder desactivar a alguien
 * y que deje de escribir en el mismo minuto.
 */
export interface PerfilRepositorioPort {
  porSub(sub: string): Promise<Perfil | null>;

  /**
   * Refleja en la base un usuario que acaba de crearse en el proveedor.
   *
   * Escribe en `auth.users`, el espejo local de Cognito, y de ahi el disparador
   * `tr_crear_perfil` crea la fila de `perfiles` con el rol menos privilegiado. Es la
   * misma cadena que el ADR 002 proponia resolver con una Lambda de post-confirmacion.
   * No se construyo y no hace falta: como no hay registro abierto, el alta siempre pasa
   * por la API, y entonces la API puede escribir aqui directamente.
   *
   * Es idempotente: repetirlo con el mismo `sub` no duplica ni pisa lo que haya.
   */
  reflejarDelProveedor(usuario: UsuarioNuevo): Promise<void>;
}

/** Datos con los que nace un voluntario. */
export interface UsuarioNuevo {
  sub: string;
  correo: string;
  nombre: string;
  telefono: string | null;
}

/**
 * Alta de voluntarios en el proveedor de identidad.
 *
 * Separado de {@link ProveedorIdentidadPort} a proposito: autenticarse lo hace el
 * voluntario con sus propias credenciales, mientras que dar de alta lo hace la
 * organizacion con credenciales de cuenta. Son dos poderes muy distintos y conviene
 * que se vean distintos tambien en el codigo.
 */
/** Lo que devuelve un alta en el proveedor de identidad. */
export interface AltaEnProveedor {
  /** Identificador que el proveedor asigno a la persona. */
  sub: string;

  /**
   * La cuenta ya estaba en el proveedor y esta llamada no la creo.
   *
   * No es un error: puede ser un alta repetida por descuido —y entonces hay que
   * rechazarla— o el segundo intento de un alta que quedo a medias, y entonces hay
   * que dejarla terminar. Quien puede distinguir los dos casos no es el proveedor
   * de identidad sino quien sabe si la persona tiene perfil, asi que el dato sube
   * y la decision se toma arriba.
   */
  yaExistia: boolean;
}

export interface AdministradorIdentidadPort {
  /**
   * Crea la cuenta y le fija clave definitiva.
   *
   * Es IDEMPOTENTE: si la cuenta ya existe no falla, la busca y devuelve su `sub`
   * con `yaExistia`. Es lo que permite reparar un alta interrumpida repitiendola.
   */
  crearVoluntario(
    correo: string,
    nombre: string,
    telefono: string | null,
    clave: string
  ): Promise<AltaEnProveedor>;
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
export const PROVEEDOR_IDENTIDAD = Symbol('PROVEEDOR_IDENTIDAD');
export const PERFIL_REPOSITORIO = Symbol('PERFIL_REPOSITORIO');
export const ADMINISTRADOR_IDENTIDAD = Symbol('ADMINISTRADOR_IDENTIDAD');
