import { TipoFoto } from './enums';

/**
 * Contrato de la subida de fotografias: lo que cruza la red entre la PWA y la API.
 *
 * Son TRES PASOS y el tercero no es opcional. Ver ADR 003 seccion 5.
 *
 *   1. Dispositivo -> API             declara la foto y pide autorizacion
 *   2. Dispositivo -> almacenamiento  sube la imagen POR BLOQUES, cada uno aparte
 *   3. Dispositivo -> API             confirma; la API une los bloques y verifica
 *
 * -----------------------------------------------------------------------------------
 * POR QUE TODA FOTOGRAFIA VA POR BLOQUES, INCLUSO UNA DE 200 KB
 * -----------------------------------------------------------------------------------
 *
 * Porque la red de una vereda no se cae cuando el archivo es grande: se cae cuando se
 * cae. Un envio de 200 KB que se corta al 80 % no deja nada, y el siguiente intento
 * vuelve a transmitir —y a cobrarle al voluntario— los mismos 160 KB que ya viajaron.
 * Repetido tres veces, la fotografia consumio 800 KB del plan de datos de alguien y
 * sigue sin llegar.
 *
 * Partida en bloques, cada pedazo que llega SE QUEDA. La API sabe cuales llegaron
 * porque se lo pregunta al almacenamiento, no al celular, de modo que un telefono que
 * se quedo sin bateria o al que le reinstalaron la aplicacion retoma donde iba.
 *
 * NO se usa la subida multiparte de S3, y no es una preferencia: exige que toda parte
 * salvo la ultima pese al menos 5 MiB, asi que con ella una foto de 200 KB no se puede
 * partir. Aqui cada bloque es su propio objeto y la API los une al confirmar.
 *
 * -----------------------------------------------------------------------------------
 * QUE NO VIVE AQUI
 * -----------------------------------------------------------------------------------
 *
 * El `Blob`, el estado de la cola y el numero de intentos son del dispositivo: no
 * cruzan la red, asi que no son contrato.
 *
 * @version 0.2.0
 */

/**
 * El bloque mas pequeno que se emite.
 *
 * Por debajo de esto, el costo de pedir permiso y de una peticion mas pesa mas que lo
 * que se ahorra al reanudar. En una conexion rural de unos 20 KB/s, 64 KiB son unos
 * tres segundos: una ventana de senal corta alcanza para varios.
 */
export const BLOQUE_MINIMO = 64 * 1024;

/**
 * El bloque mas grande que se emite.
 *
 * Un bloque es todo o nada: si se corta, se repite entero. Un techo de 1 MiB acota lo
 * que se puede perder de una vez, que es exactamente lo que se esta comprando aqui.
 */
export const BLOQUE_MAXIMO = 1024 * 1024;

/**
 * A cuantos bloques se apunta.
 *
 * Es un equilibrio entre dos costos: pocos bloques dejan mucho que repetir cuando uno
 * falla; muchos bloques gastan peticiones y hacen la respuesta de autorizacion mas
 * pesada, justo sobre la red que ya esta mal.
 */
export const BLOQUES_OBJETIVO = 8;

/** Techo por fotografia. Lo que pase de aqui no es la foto de una vivienda. */
export const MAXIMO_BYTES_FOTO = 25 * 1024 * 1024;

/** Formatos que se aceptan, con la extension que le corresponde al objeto. */
export const TIPOS_MIME_FOTO: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/png': 'png'
};

/**
 * De que tamano van los bloques de una imagen de este peso.
 *
 * Vive en el contrato porque los dos lados tienen que calcular igual: la API para
 * firmar y el dispositivo para partir el `Blob`. Calculado en dos sitios, el dia que
 * cambie uno de los dos se queda viejo y el ultimo pedazo de la imagen no sube.
 *
 * Ejemplos, para que se vea que hace:
 *
 *   200 KB  -> bloques de  64 KiB, cuatro pedazos
 *     4 MB  -> bloques de 512 KiB, ocho pedazos
 *    25 MB  -> bloques de   1 MiB, veinticinco pedazos
 */
export function tamanoBloquePara(bytes: number): number {
  const ideal = Math.ceil(bytes / BLOQUES_OBJETIVO);
  return Math.min(BLOQUE_MAXIMO, Math.max(BLOQUE_MINIMO, ideal));
}

/** Cuantos bloques ocupa. Con cero bytes no hay nada que subir, pero nunca es cero. */
export function bloquesQueOcupa(bytes: number, tamanoBloque: number): number {
  return Math.max(1, Math.ceil(bytes / tamanoBloque));
}

/** Paso 1. Lo que el dispositivo declara antes de subir un solo byte. */
export interface SolicitudSubidaFoto {
  /** UUID de la fotografia, generado en el dispositivo. Es la clave de idempotencia. */
  fotoId: string;
  /** UUID del caso al que pertenece. Es `origen_id`, no el consecutivo institucional. */
  casoOrigenId: string;
  tipo: TipoFoto;
  /**
   * Cuanto pesa lo que esta por subir.
   *
   * Lo calcula el dispositivo porque esos bytes todavia no existen en ninguna otra
   * parte, y viaja aqui porque es lo que la autorizacion va a exigir: el permiso para
   * subir 200 KB no debe servir para subir un archivo de cualquier tamano. Quien paga
   * esa factura es el proyecto.
   */
  bytes: number;
  tipoMime: string;
  /**
   * SHA-256 de la imagen COMPLETA, en hexadecimal, calculado en el dispositivo.
   *
   * Es lo que convierte «llegaron todos los bloques y suman lo que debian» en «la
   * imagen que hay guardada es exactamente la que el voluntario tomo». El tamano no
   * distingue una foto buena de una corrupta, ni de unos bloques pegados en el orden
   * equivocado: los tres pesan igual.
   *
   * La API la vuelve a calcular sobre lo que unio y compara. Si no coinciden, no se
   * confirma nada: la fotografia se descarta y se vuelve a subir.
   */
  suma: string;
}

/** Un bloque que falta por subir, con su permiso y el trozo de archivo que le toca. */
export interface BloquePendiente {
  /** Numero de bloque, desde 1. Es el orden en que se vuelven a unir. */
  numero: number;
  /** Primer byte del archivo que va en este bloque. */
  desde: number;
  /** Primer byte que YA NO va en este bloque. Es `Blob.slice(desde, hasta)`. */
  hasta: number;
  /**
   * Permiso de vida corta para escribir ESTE bloque, con ESTE tamano exacto.
   *
   * El tamano va dentro de la firma, asi que el permiso no sirve para subir mas de lo
   * declarado. Sin eso, una autorizacion filtrada seria espacio ilimitado a cargo del
   * proyecto.
   */
  url: string;
}

/** Un bloque que el almacenamiento ya tiene. No se vuelve a subir. */
export interface BloqueRecibido {
  numero: number;
  bytes: number;
}

/**
 * Paso 1, respuesta normal: suba estos bloques.
 *
 * `recibidos` es la razon de ser de todo esto y no sale de la memoria del dispositivo:
 * la API se lo pregunta al almacenamiento en cada autorizacion.
 */
export interface SubidaPorBloques {
  modo: 'bloques';
  /** Ruta definitiva de la imagen ya unida. Vuelve en el paso 3. */
  ruta: string;
  tamanoBloque: number;
  /** Cuantos bloques tiene la fotografia completa. */
  total: number;
  pendientes: BloquePendiente[];
  recibidos: BloqueRecibido[];
  expiraEn: string;
}

/**
 * No hay nada que subir: la fotografia ya esta verificada en el almacenamiento.
 *
 * Ocurre cuando el dispositivo perdio la respuesta de la confirmacion y vuelve a
 * empezar. Sin este modo, el reintento subiria otra vez una imagen que ya llego.
 */
export interface SubidaYaConfirmada {
  modo: 'confirmada';
  ruta: string;
  bytes: number;
}

/** Paso 1, respuesta. */
export type AutorizacionSubida = SubidaPorBloques | SubidaYaConfirmada;

/**
 * Paso 3. El dispositivo dice que termino; la API es quien comprueba.
 *
 * No viaja ninguna lista de bloques, a proposito: la API le pregunta al almacenamiento
 * cuales estan. Asi una version defectuosa de la aplicacion no puede dar por completa
 * una imagen a la que le falta un pedazo — y a una fotografia del dano de una vivienda
 * a la que le falta un pedazo no se le toma otra: el voluntario ya bajo de la vereda.
 */
export interface ConfirmacionFoto {
  ruta: string;
}

/**
 * Paso 3, respuesta. La unica afirmacion que vale sobre si la fotografia llego.
 *
 * Que el almacenamiento haya aceptado los bloques no es que la imagen este completa.
 * Sin este paso el dispositivo podria liberarla de su memoria creyendo que ya viajo.
 */
export interface FotoConfirmada {
  fotoId: string;
  /** Ruta definitiva. Es lo que el dispositivo guarda como `urlRemota`. */
  ruta: string;
  /** Tamano que reporta el almacenamiento, no el que el dispositivo declaro. */
  bytes: number;
  /**
   * SHA-256 de lo que quedo guardado, calculado por la API al unir los bloques.
   *
   * Vuelve al dispositivo para que pueda compararlo con el suyo antes de dar la
   * fotografia por entregada. Son dos comprobaciones de la misma igualdad, en los dos
   * extremos, y la segunda no cuesta nada.
   */
  suma: string;
  /** True si ya estaba confirmada: confirmar es idempotente y se puede reintentar. */
  yaEstaba: boolean;
}

/**
 * Como va una fotografia, preguntado sin efectos.
 *
 * Existe para que la aplicacion muestre el avance —«bloque 3 de 4»— sin pedir permisos
 * nuevos ni mover un byte. Lo que responde no sale de la memoria del celular.
 */
export interface EstadoFoto {
  fotoId: string;
  ruta: string;
  /** Lo que se espera que pese, segun lo declarado. */
  bytes: number;
  confirmada: boolean;
  tamanoBloque: number;
  total: number;
  recibidos: BloqueRecibido[];
  /** Entre 0 y 1. Es lo que dibuja la barra de avance. */
  progreso: number;
}
