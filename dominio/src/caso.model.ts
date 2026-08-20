import {
  FuenteCoordenada,
  FuenteDato,
  NivelVerificacion,
  OrigenDato,
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
   * Quien observo el hecho. Distinto del canal por el que llego.
   *
   * De aqui sale el nivel de verificacion con el que nace el caso, con
   * {@link nivelInicialDesde}. Lo que sigue arriba —documental, tecnico,
   * institucional— lo sube la mesa, no quien captura.
   */
  origenDato: OrigenDato | null;
  /**
   * Autorizacion para tratar los DATOS PERSONALES de la familia.
   *
   * null es SIN RESPONDER, y no es lo mismo que un no: un formulario que nadie lleno
   * no puede verse igual que una familia que dijo que no. De esta respuesta depende si
   * el nombre y el documento de una persona se guardan.
   *
   * Al escribir en la base, cualquier cosa distinta de true es un no.
   */
  consentimiento: boolean | null;

  /**
   * Autorizacion para tratar DATOS SENSIBLES: salud, discapacidad, gestacion, etnia.
   *
   * POR QUE VA SEPARADA Y NO DENTRO DE LA ANTERIOR
   *
   * La Ley 1581 trata los datos sensibles aparte y establece que nadie esta obligado a
   * autorizarlos. Si la unica forma de quedar caracterizado fuera aceptar en bloque
   * —incluidos salud, discapacidad y gestacion— esa autorizacion seria discutible por
   * no ser libre. Y en terreno hay familias que quieren quedar contadas y no quieren
   * que su informacion de salud salga hacia una entidad.
   *
   * Sin ella, esos campos no se conservan ni viajan. Ver {@link CAMPOS_SENSIBLES}.
   */
  autorizaDatosSensibles: boolean | null;

  /**
   * Autorizacion para remitir el caso NOMINALMENTE a las entidades competentes.
   *
   * Sin ella la familia sigue contando en el consolidado —un numero no identifica a
   * nadie— pero su nombre no sale en un listado dirigido a una entidad.
   */
  autorizaRemisionEntidades: boolean | null;

  /**
   * Version del texto de autorizacion que se le leyo a esta familia.
   *
   * La Ley 1581 exige poder consultar la autorizacion despues y conservar prueba de
   * haber informado. Guardar «autorizo: si» no alcanza: hay que poder decir QUE TEXTO
   * EXACTO se leyo ese dia. El texto vive versionado en
   * docs/cumplimiento/autorizacion.md y aqui queda la version que estaba vigente.
   */
  versionAutorizacion: string | null;

  /**
   * Momento en que la familia respondio, en ISO.
   *
   * Separado de `fechaRegistro` a proposito: se puede llenar la ficha un dia y obtener
   * la autorizacion en otro, o al reves. Confundirlos hace imposible reconstruir el
   * consentimiento.
   */
  autorizadoEn: string | null;

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
  /**
   * Fallecidos y heridos del hogar.
   *
   * Separados por gravedad porque asi se pueden sumar por vereda, y esa suma es lo
   * que una entidad de salud puede atender. Grave se define por el hecho —fue
   * remitido o atendido en un hospital— y no por criterio medico: quien llena la
   * ficha es un lider comunal.
   */
  fallecidos: number;
  heridosLeves: number;
  heridosGraves: number;
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

  /**
   * Si una entidad ya visito esta edificacion.
   *
   * Nulo es «no se pregunto», que no es un no. La distincion importa porque la
   * pregunta invertida —donde NO ha ido nadie— es la mas util de las tres que esto
   * responde, y confundir «no ha venido nadie» con «no preguntamos» la arruina.
   *
   * NO SUBE EL NIVEL DE VERIFICACION POR SI SOLA. Que la familia diga «aqui vino un
   * ingeniero» es, todavia, algo que dijo la familia. La constancia queda; la mesa
   * decide si con eso sube.
   */
  visitaOficial: boolean | null;
  /** Que entidad vino: alcaldia, bomberos, defensa civil, CMGRD. */
  visitaOficialEntidad: string | null;
  visitaOficialFecha: string | null;
  /** Que dijeron. Es la evidencia mas fuerte que puede traer un caso. */
  visitaOficialConcepto: string | null;
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
  infraProductivaOtro: string | null;
  requiereAgro: string[];
  requiereAgroOtro: string | null;
  /**
   * Maquinaria y vehiculos afectados o perdidos.
   *
   * Son insumo de la cadena productiva, y quedarse por fuera del listado es
   * exactamente como se pierden en el camino. El detalle va en texto: una guadana, un
   * tractor y una moto de trabajo no se parecen en nada, y agruparlos ahora seria
   * inventar un catalogo sin haber visto los datos.
   */
  maquinariaAfectada: boolean | null;
  maquinariaDetalle: string | null;
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
  /** Lo que la lista cerrada no alcanza a decir. La acompana, no la reemplaza. */
  necesidadesOtra: string | null;
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

/**
 * Una fila del tablero: lo que la mesa necesita ver de un caso, y nada mas.
 *
 * NO LLEVA IDENTIDAD, y esa ausencia es deliberada. `v_familias_tablero` si expone
 * nombre y telefono a quien tiene permiso, pero esta pantalla no los usa: sirve para
 * contar, ubicar y priorizar. Mandarlos al navegador «por si acaso» seria repartir
 * datos personales de familias damnificadas por una comodidad que nadie pidio.
 *
 * El dia que una pantalla necesite el nombre —el detalle de un caso, la remision— se
 * pide en su propia ruta, donde se puede mirar quien la llama y por que.
 *
 * @version 0.1.0
 */
export interface ResumenTablero {
  id: string;
  /** Consecutivo institucional RZ-AAAA-NNNNNN. */
  codigo: string;
  zona: Zona;
  municipio: string;
  /** Vereda o barrio, lo que aplique. */
  lugar: string | null;
  prioridad: Prioridad | null;
  personasTotal: number;
  menores: number;
  adultosMayores: number;
  estadoVerificacion: string;
  /** Nivel de afectacion de la vivienda principal, si se registro. */
  afectacion: string | null;
  habitable: boolean | null;
  lat: number | null;
  lon: number | null;
  /** De donde salio el dato. No cambia. */
  origenDato: OrigenDato | null;
  /** Hasta donde esta comprobado. Sube con el tiempo. */
  nivelVerificacion: NivelVerificacion;
  nFotos: number;
  remisionesSinRespuesta: number;
  fechaRegistro: string | null;
}
