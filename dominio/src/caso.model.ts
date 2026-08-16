import {
  FuenteCoordenada,
  FuenteDato,
  LugarPernocta,
  NivelAfectacion,
  Prioridad,
  Tenencia,
  Zona
} from './enums';

/**
 * Contrato del caso: lo que cruza la red entre la PWA y la API.
 *
 * La unidad de registro es el HOGAR, no la vivienda: un mismo inmueble puede alojar
 * varias familias y cada una genera un caso independiente.
 *
 * QUE VIVE AQUI Y QUE NO
 *
 * Aqui viven los bloques que ambos lados tienen que entender igual. Lo que solo
 * existe en el dispositivo se queda en el dispositivo: el estado de la cola de
 * sincronizacion, el numero de intentos, el `Blob` de la fotografia, el codigo local
 * provisional y el paso del formulario en el que se quedo el voluntario. Nada de eso
 * viaja, asi que no es contrato.
 *
 * La razon de compartir esto en lugar de duplicarlo: hay 145 columnas y el adaptador
 * las mapea una por una. Con dos copias, la primera vez que alguien agrega un campo
 * de un solo lado el error aparece en produccion, en forma de dato que se pierde en
 * silencio. Compartido, deja de compilar.
 *
 * @version 0.1.0
 */

/** Bloque 0. Quien registra, por que canal y con que autorizacion. */
export interface Control {
  registradorNombre: string;
  registradorOrg: string | null;
  registradorTel: string | null;
  fuenteDato: FuenteDato;
  /**
   * Autorizacion de tratamiento de datos, Ley 1581 de 2012.
   * En false la identidad NO viaja. La regla se aplica con {@link aplicarConsentimiento}.
   */
  /**
   * Autorizacion de la familia. null es SIN RESPONDER, y no es lo mismo que un no.
   *
   * Con un booleano de dos estados, un formulario que nadie lleno se veia igual que
   * una familia que dijo que no. De esta respuesta depende si el nombre y el documento
   * de una persona se guardan, asi que la diferencia importa.
   *
   * Al escribir en la base, cualquier cosa distinta de true es un no: la regla de
   * identidad no cambia.
   */
  consentimiento: boolean | null;
  fechaRegistro: string;
}

/** Bloque 1. Ubicacion. La coordenada se captura por satelite y no requiere internet. */
export interface Ubicacion {
  departamento: string;
  municipio: string;
  zona: Zona;
  vereda: string | null;
  corregimiento: string | null;
  barrio: string | null;
  comuna: string | null;
  direccionRef: string | null;
  lat: number | null;
  lon: number | null;
  /** Precision reportada por el GPS, en metros. Util para decidir si se repite la toma. */
  precisionM: number | null;
  gpsFuente: FuenteCoordenada;
}

/**
 * Desagregado por sexo y rango etario.
 * Las entidades y la cooperacion internacional exigen este corte para asignar ayuda.
 */
export interface ComposicionHogar {
  h0a5: number;
  m0a5: number;
  h6a11: number;
  m6a11: number;
  h12a17: number;
  m12a17: number;
  h18a59: number;
  m18a59: number;
  h60mas: number;
  m60mas: number;
}

/** Condiciones que elevan la vulnerabilidad del hogar. */
export interface Vulnerabilidad {
  gestantes: number;
  lactantes: number;
  discapacidadN: number;
  discapacidadTipo: string[];
  enfCronicaN: number;
  requiereMedicamento: boolean | null;
  medicamentoCual: string | null;
  etnia: string | null;
  victimaConflicto: boolean | null;
}

/**
 * Bloque 2. Identidad del hogar.
 *
 * Los cuatro campos nominales quedan nulos sin consentimiento. El telefono NO esta
 * hoy en esa regla y esa es una decision pendiente del frente de datos: ver
 * docs/hallazgos-revision.md H7. Cuando se resuelva, se cambia en
 * {@link aplicarConsentimiento} y surte efecto en los dos lados a la vez.
 */
export interface Hogar {
  jefeNombres: string | null;
  jefeApellidos: string | null;
  tipoDoc: string | null;
  numDoc: string | null;
  tel1: string;
  tel1Whatsapp: boolean | null;
  tel2: string | null;
  personasTotal: number;
  composicion: ComposicionHogar;
  vulnerabilidad: Vulnerabilidad;
  /** Incluye la opcion 'no_afiliada'. Las familias sin organizacion tambien se registran. */
  afiliacion: string[];
  afiliacionCual: string | null;
}

/** Bloque 3. Vivienda y dano. */
export interface Vivienda {
  tenencia: Tenencia;
  arrendadorContacto: string | null;
  /** Cuantos hogares vivian en la misma estructura. Contar viviendas subestima la emergencia. */
  hogaresEnEstructura: number;
  tipoVivienda: string | null;
  materialParedes: string | null;
  materialTecho: string | null;
  afectacion: NivelAfectacion;
  habitable: boolean;
  riesgoColapso: boolean;
  riesgoColapsoDesc: string | null;
  dondeDuerme: LugarPernocta;
  requiereVivienda: string[];
  serviciosAfectados: string[];
}

/** Bloque 5. Anexo urbano. */
export interface AnexoUrbano {
  estrato: string | null;
  tipoUnidad: string | null;
  perdioMedioVida: boolean | null;
  medioVidaDesc: string | null;
  requiereUrbano: string[];
}

/** Bloque 4. Anexo rural: predio, cultivos, animales e infraestructura productiva. */
export interface AnexoRural {
  predioNombre: string | null;
  areaHa: number | null;
  tenenciaPredio: string | null;
  tieneTitulo: boolean | null;
  /** Dato operativo: define si puede entrar ayuda en vehiculo. */
  viaAcceso: string | null;
  cultivos: string[];
  cultivosOtro: string | null;
  areaCultivoAfectadaHa: number | null;
  perdidaPct: number | null;
  /** Dinero SIEMPRE en centavos. Nunca punto flotante para montos. */
  perdidaEstimadaCopMinor: number | null;
  bovinosPerdidos: number;
  porcinosPerdidos: number;
  avesPerdidas: number;
  otrosAnimales: string | null;
  infraProductiva: string[];
  requiereAgro: string[];
}

/** Bloque 6. Anexo convenio de la federacion. */
export interface AnexoConvenio {
  afiliadaFederacion: boolean | null;
  aplicaConvenio: boolean;
  convenioLinea: string[];
  convenioObs: string | null;
}

/** Bloque 7. Triaje y necesidad inmediata. */
export interface Triaje {
  prioridad: Prioridad;
  necesidadesInmediatas: string[];
  yaRecibioAyuda: boolean | null;
  ayudaCual: string | null;
  ayudaQuien: string | null;
  observaciones: string | null;
}

/**
 * El caso tal como viaja del dispositivo al servidor.
 *
 * `origenId` es el UUID generado en el dispositivo y es la CLAVE DE IDEMPOTENCIA: si
 * el envio llega al servidor pero la respuesta se pierde por corte de senal, el
 * reintento actualiza la misma fila en lugar de crear un duplicado. En un censo, un
 * duplicado silencioso es peor que un fallo visible, porque infla los totales que
 * sustentan la peticion ante la entidad.
 *
 * El consecutivo institucional RZ-AAAA-NNNNNN NO viaja en esta direccion: lo asigna
 * el servidor y vuelve en la respuesta. Dos voluntarios sin senal generarian el mismo
 * numero.
 */
export interface CasoParaSincronizar {
  origenId: string;
  control: Control;
  ubicacion: Ubicacion;
  hogar: Hogar;
  vivienda: Vivienda | null;
  anexoRural: AnexoRural | null;
  anexoUrbano: AnexoUrbano | null;
  anexoConvenio: AnexoConvenio | null;
  triaje: Triaje | null;
}

/** Lo que el servidor devuelve cuando acepta un caso. */
export interface CasoSincronizado {
  origenId: string;
  /** Consecutivo institucional RZ-AAAA-NNNNNN asignado por el servidor. */
  codigo: string;
  /** True si el caso ya existia y este envio lo actualizo. */
  yaExistia: boolean;
}
