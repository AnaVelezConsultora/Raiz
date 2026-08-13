import {
  EstadoCaso,
  EstadoSync,
  FuenteCoordenada,
  FuenteDato,
  LugarPernocta,
  NivelAfectacion,
  Prioridad,
  Tenencia,
  TipoFoto,
  Zona
} from './enums';

/**
 * Modelo de dominio del caso de Raíz.
 *
 * La unidad de registro es el HOGAR, no la vivienda: un mismo inmueble puede alojar
 * varias familias y cada una genera un caso independiente.
 *
 * Todos los bloques son interfaces separadas por responsabilidad, de modo que el
 * formulario por pasos pueda persistir un bloque a la vez sin construir el objeto
 * completo. En campo esto importa: el voluntario puede perder la aplicacion a mitad
 * del registro y no debe perder lo que ya escribio.
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
   * Autorizacion de tratamiento de datos (Ley 1581 de 2012).
   * En false, la capa de presentacion DEBE ocultar y no persistir identidad ni fotos.
   */
  consentimiento: boolean;
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

/** Bloque 2. Identidad del hogar. Los campos nominales quedan nulos sin consentimiento. */
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

/** Metadatos de sincronizacion. Viven solo en el dispositivo, no viajan al servidor. */
export interface MetaSync {
  estadoSync: EstadoSync;
  intentos: number;
  ultimoError: string | null;
  ultimoIntentoEn: string | null;
  sincronizadoEn: string | null;
}

/**
 * Fotografia asociada al caso.
 *
 * El binario se guarda como Blob en IndexedDB y se sube por separado del caso: una
 * conexion rural puede alcanzar para el registro de texto y no para tres imagenes.
 * Registro y fotos sincronizan de forma independiente.
 */
export interface FotoLocal {
  id: string;
  casoId: string;
  tipo: TipoFoto;
  blob: Blob;
  bytes: number;
  ancho: number;
  alto: number;
  capturadaEn: string;
  urlRemota: string | null;
  meta: MetaSync;
}

/**
 * Caso completo tal como vive en el dispositivo.
 *
 * `id` es un UUID generado localmente y es la clave con la que trabajan la PWA y la
 * cola de sincronizacion. `codigo` es el consecutivo institucional RZ-AAAA-NNNNNN y lo
 * asigna el SERVIDOR: dos voluntarios sin senal generarian el mismo numero, de modo
 * que en el dispositivo se muestra `codigoLocal` hasta que el servidor confirme.
 */
export interface Caso {
  id: string;
  codigo: string | null;
  codigoLocal: string;
  estado: EstadoCaso;
  control: Control;
  ubicacion: Ubicacion;
  hogar: Hogar;
  vivienda: Vivienda | null;
  anexoRural: AnexoRural | null;
  anexoUrbano: AnexoUrbano | null;
  anexoConvenio: AnexoConvenio | null;
  triaje: Triaje | null;
  /** Ultimo paso del formulario completado. Permite retomar un registro a medias. */
  pasoCompletado: number;
  creadoEn: string;
  actualizadoEn: string;
  dispositivoId: string;
  meta: MetaSync;
}

/** Criterios de consulta sobre el almacenamiento local. */
export interface FiltroCasos {
  zona?: Zona;
  prioridad?: Prioridad;
  estado?: EstadoCaso;
  estadoSync?: EstadoSync;
  texto?: string;
  limite?: number;
}

/** Resumen para las listas y el tablero, sin cargar el caso completo. */
export interface ResumenCaso {
  id: string;
  codigo: string;
  responsable: string;
  lugar: string;
  zona: Zona;
  personasTotal: number;
  prioridad: Prioridad | null;
  estado: EstadoCaso;
  estadoSync: EstadoSync;
  tieneCoordenada: boolean;
  nFotos: number;
  actualizadoEn: string;
}
