import {
  CasoParaSincronizar,
  CasoSincronizado,
  PuntoEnTablero,
  PuntoRegistrado,
  PuntoServicio,
  ResumenTablero,
  Rol
} from '@raiz/dominio';

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
   * Los casos que quien pide puede ver, resumidos.
   *
   * QUIEN VE QUE NO SE DECIDE AQUI. La consulta corre con la identidad de quien pide
   * sobre `v_familias_tablero`, que lleva `security_invoker`: la mesa recibe todo y un
   * lider recibe lo suyo, sin que este puerto sepa de roles. Por eso la misma ruta
   * sirve al tablero de la mesa y a la vista del lider.
   */
  listar(identidad: Identidad): Promise<ResumenTablero[]>;

  /**
   * Registra el caso a nombre de quien lo envia.
   *
   * Es idempotente por `origenId`: el reintento tras un corte de senal actualiza la
   * misma fila y devuelve el mismo codigo.
   */
  registrar(caso: CasoParaSincronizar, identidad: Identidad): Promise<CasoSincronizado>;
}

/**
 * Persistencia de puntos de servicio.
 *
 * Separado de {@link CasoRepositorioPort} y no una operacion mas dentro de el: son dos
 * unidades distintas del dominio, con politicas de acceso distintas —un punto lo ve
 * todo el mundo, un caso no— y no comparten ni una consulta.
 */
export type { PuntoRegistrado };

export interface PuntoRepositorioPort {
  /** Todos los puntos, con las dos cifras de hogares ya resueltas por la vista. */
  listar(identidad: Identidad): Promise<PuntoEnTablero[]>;

  /** Idempotente por el `id` que genero el dispositivo. */
  registrar(punto: PuntoServicio, identidad: Identidad): Promise<PuntoRegistrado>;
}

/** Comprueba que la base responde. Se usa en la ruta de disponibilidad. */
export interface SaludPort {
  baseAlcanzable(): Promise<boolean>;
}

// =============================================================================
// Fotografias
// =============================================================================

/** Lo que la base sabe de una fotografia mientras viaja. */
export interface FotoRegistrada {
  /** UUID que genero el dispositivo. */
  origenId: string;
  /** Ruta del objeto ya completo. */
  ruta: string;
  bytes: number;
  tipoMime: string;
  /** SHA-256 que declaro el dispositivo. Es contra esto que se verifica lo unido. */
  suma: string;
  /** Donde viven los bloques mientras la imagen esta a medias. Nulo si ya se unieron. */
  partesPrefijo: string | null;
  tamanoBloque: number;
  confirmada: boolean;
}

/** Datos con los que se autoriza una fotografia nueva. */
export interface FotoParaAutorizar {
  origenId: string;
  casoOrigenId: string;
  tipo: string;
  bytes: number;
  tipoMime: string;
  suma: string;
  tamanoBloque: number;
}

/** Lo que hace falta saber del caso para decidir donde va la fotografia. */
export interface CasoDeLaFoto {
  /** Consecutivo institucional. Es el prefijo bajo el que se guarda. */
  codigo: string;
}

/**
 * Persistencia de fotografias.
 *
 * Todo pasa por las politicas de acceso por fila: la fotografia cuelga de la familia y
 * hereda su permiso, de modo que un lider no puede colgarle una imagen al caso de otro
 * ni siquiera con un cliente modificado.
 */
export interface FotoRepositorioPort {
  /**
   * Reserva el lugar de la fotografia y devuelve donde va.
   *
   * Es idempotente por `origenId`. Falla con {@link ErrorRechazo} si el caso no existe,
   * no es visible para quien pide, o la familia no autorizo el tratamiento.
   *
   * `rutas` recibe el consecutivo del caso y devuelve las dos rutas, porque quien sabe
   * como se nombran los objetos es la capa de aplicacion, no el repositorio.
   */
  autorizar(
    foto: FotoParaAutorizar,
    identidad: Identidad,
    rutas: (caso: CasoDeLaFoto) => { ruta: string; partesPrefijo: string }
  ): Promise<FotoRegistrada>;

  buscar(origenId: string, identidad: Identidad): Promise<FotoRegistrada | null>;

  /** Marca la fotografia como verificada y olvida los bloques. Idempotente. */
  confirmar(origenId: string, bytes: number, identidad: Identidad): Promise<void>;

  /** Borra la fila de una subida que nunca se completo. No toca las confirmadas. */
  descartar(origenId: string, identidad: Identidad): Promise<void>;
}

/**
 * Almacenamiento de objetos.
 *
 * LA IMAGEN NO VIAJA POR LA API. El celular escribe cada bloque directo contra el
 * almacenamiento con un permiso firmado; lo unico que la API mueve es la union final,
 * que ocurre dentro de la nube y no sobre la red del voluntario.
 */
export interface AlmacenamientoObjetosPort {
  /**
   * Permiso de vida corta para escribir UN objeto de UN tamano exacto.
   *
   * El tamano va dentro de la firma: un permiso emitido para 64 KiB no sirve para
   * escribir un archivo de un giga. Sin eso, una autorizacion filtrada seria espacio
   * ilimitado a cargo del proyecto.
   */
  firmarEscritura(params: {
    clave: string;
    bytes: number;
  }): Promise<{ url: string; expiraEn: string }>;

  /**
   * Tamano del objeto, o null si no esta.
   *
   * Consulta el objeto CONCRETO. No se lista un prefijo, y no es un detalle: el listado
   * es de consistencia eventual, de modo que preguntando asi la respuesta puede omitir
   * un bloque que si llego. Lo dice el ADR 003.
   */
  tamano(clave: string): Promise<number | null>;

  /**
   * Une los objetos, en el orden dado, en uno solo, y devuelve la suma de lo unido.
   *
   * Es lo unico que hace pasar bytes por la API, y ocurre dentro de la nube, una vez
   * por fotografia y sobre unos cientos de kilobytes. Lo que nunca pasa por la API es
   * la subida desde el celular, que es la parte lenta y la que costaria de verdad.
   *
   * La suma se calcula EN LA MISMA PASADA en que se transmite. Volver a leer el objeto
   * despues para verificarlo costaria el doble de trafico y de tiempo, y ademas
   * verificaria una lectura distinta de la que se escribio.
   */
  unir(params: {
    claves: string[];
    destino: string;
    tipoMime: string;
    bytes: number;
  }): Promise<{ suma: string }>;

  /** Borra el objeto. Borrar lo que no existe no es un error. */
  borrar(clave: string): Promise<void>;
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
  /** Cedula. Puede faltar en las cuentas creadas antes de que se exigiera. */
  documento: string | null;
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

  /** Todos los perfiles que quien pide tenga permiso de ver. Lo decide la base. */
  listar(identidad: Identidad, soloInactivos: boolean): Promise<Perfil[]>;

  /**
   * Cambia el rol o el acceso de alguien, A NOMBRE DE QUIEN LO PIDE.
   *
   * Corre con la identidad de quien pide, no con la de la API, para que las
   * politicas de acceso decidan. Si la base no deja tocar esa fila, la operacion no
   * afecta ninguna y se responde que no se pudo — que es lo correcto: la regla de
   * quien administra a quien no puede vivir solo en el codigo de la API.
   */
  cambiar(
    id: string,
    cambio: { rol?: Rol; activo?: boolean },
    identidad: Identidad
  ): Promise<Perfil | null>;

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
  /**
   * Cedula de quien registra.
   *
   * No es un dato administrativo: cuando una entidad devuelva un caso preguntando
   * quien lo levanto, la respuesta tiene que ser una persona identificable y no un
   * correo electronico.
   */
  documento: string;
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
export const PUNTO_REPOSITORIO = Symbol('PUNTO_REPOSITORIO');
export const FOTO_REPOSITORIO = Symbol('FOTO_REPOSITORIO');
export const ALMACENAMIENTO = Symbol('ALMACENAMIENTO');
export const VERIFICADOR_TOKEN = Symbol('VERIFICADOR_TOKEN');
export const SALUD = Symbol('SALUD');
export const PROVEEDOR_IDENTIDAD = Symbol('PROVEEDOR_IDENTIDAD');
export const PERFIL_REPOSITORIO = Symbol('PERFIL_REPOSITORIO');
export const ADMINISTRADOR_IDENTIDAD = Symbol('ADMINISTRADOR_IDENTIDAD');
