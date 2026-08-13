/**
 * Enumeraciones del dominio de Raíz.
 *
 * Los valores literales replican EXACTAMENTE los codigos del XLSForm de KoboToolbox
 * y de los tipos enumerados de PostgreSQL (supabase/schema.sql). Ese contrato es lo
 * que permite mover datos entre Kobo, la PWA y la base sin traducciones intermedias.
 *
 * @version 0.1.0
 */

/** Zona geografica del hogar. Determina que anexo del formulario aplica. */
export enum Zona {
  Rural = 'rural',
  Urbana = 'urbana'
}

/**
 * Nivel de triaje. Determina el orden de verificacion y de entrega de ayuda.
 * P0 no espera al censo: se escala el mismo dia al organismo de socorro.
 */
export enum Prioridad {
  /** Riesgo de vida o estructura a punto de caer sobre personas. */
  P0 = 'p0',
  /** Sin techo: durmiendo a la intemperie, en carpa o en casa ajena. */
  P1 = 'p1',
  /** Vivienda severamente danada pero la familia tiene donde estar. */
  P2 = 'p2',
  /** Dano leve o moderado, vivienda habitable. */
  P3 = 'p3'
}

/**
 * Ciclo de vida del caso. Nunca se borra un registro: se marca Duplicado o
 * Descartado para conservar la trazabilidad de lo que se recibio.
 */
export enum EstadoCaso {
  Reportado = 'reportado',
  Contactado = 'contactado',
  Caracterizado = 'caracterizado',
  Verificado = 'verificado',
  Remitido = 'remitido',
  EnAtencion = 'en_atencion',
  Atendido = 'atendido',
  Cerrado = 'cerrado',
  Duplicado = 'duplicado',
  Descartado = 'descartado'
}

/** Estado del registro frente al servidor. Vive solo en el dispositivo. */
export enum EstadoSync {
  /** Guardado en el dispositivo, aun no enviado. */
  Pendiente = 'pendiente',
  /** Envio en curso. */
  EnProceso = 'en_proceso',
  /** Confirmado por el servidor. */
  Sincronizado = 'sincronizado',
  /** Fallo el envio. Conserva el numero de intentos y el ultimo error. */
  Error = 'error'
}

/** Canal por el que llego la informacion. Ninguno se descarta. */
export enum FuenteDato {
  Presencial = 'presencial',
  WhatsApp = 'whatsapp',
  Llamada = 'llamada',
  Lider = 'lider',
  OtraEntidad = 'otra_entidad'
}

/**
 * Relacion del hogar con la vivienda.
 * Los arrendatarios se registran: aplican a subsidio de arriendo aunque no sean duenos.
 */
export enum Tenencia {
  Propietario = 'propietario',
  Arrendatario = 'arrendatario',
  Poseedor = 'poseedor',
  Usufructo = 'usufructo',
  Familiar = 'familiar',
  Ocupante = 'ocupante',
  Mayordomo = 'mayordomo'
}

/** Nivel de afectacion de la estructura. */
export enum NivelAfectacion {
  SinDano = 'sin_dano',
  Leve = 'leve',
  Moderado = 'moderado',
  Severo = 'severo',
  Destruida = 'destruida',
  /** En pie pero con riesgo inminente de colapso. */
  Riesgo = 'riesgo'
}

/** Donde esta durmiendo la familia al momento del registro. */
export enum LugarPernocta {
  MismaVivienda = 'misma_vivienda',
  FamiliarVecino = 'familiar_vecino',
  Albergue = 'albergue',
  Carpa = 'carpa',
  Arriendo = 'arriendo',
  Otro = 'otro'
}

/** Origen de la coordenada. Distingue el dato medido del dato aproximado. */
export enum FuenteCoordenada {
  Sitio = 'sitio',
  Compartida = 'compartida',
  Aproximada = 'aprox',
  NoDisponible = 'no_disp'
}

/**
 * Rol del usuario. Define que puede ver y hacer.
 * Los mismos valores que el tipo `rol_t` de PostgreSQL, donde las politicas de
 * acceso por fila los aplican del lado del servidor.
 */
export enum Rol {
  /** Ve todo, firma los oficios, es el unico vocero ante las entidades. */
  Coordinador = 'coordinador',
  /** Administra accesos y responde por la proteccion de datos personales. */
  Custodio = 'custodio',
  /** Depura duplicados, verifica casos y marca su estado. */
  Validador = 'validador',
  /** Carga reportes que llegan por WhatsApp, llamada o papel. No exporta. */
  Digitador = 'digitador',
  /** Enlace territorial. Solo ve los casos que el mismo reporto. */
  Lider = 'lider'
}

/** Tipo de fotografia asociada al caso. */
export enum TipoFoto {
  Fachada = 'fachada',
  Dano = 'dano',
  Cultivo = 'cultivo'
}
