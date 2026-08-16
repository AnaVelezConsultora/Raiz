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
 * Necesidad inmediata del hogar, en las proximas 72 horas.
 *
 * Vocabulario cerrado, no texto libre. La razon es practica: estos valores se agregan
 * para decirle a una entidad "37 hogares requieren agua potable". Con texto libre,
 * "agua", "agua potable" y "Agua Potable" son tres necesidades distintas y el
 * consolidado deja de ser sumable justo cuando hace falta.
 *
 * Los codigos replican los del XLSForm, igual que el resto del dominio.
 */
export enum Necesidad {
  Alimentos = 'alimentos',
  AguaPotable = 'agua_potable',
  Aseo = 'aseo',
  Cocina = 'cocina',
  Dormir = 'dormir',
  Carpa = 'carpa',
  Ropa = 'ropa',
  Medicamentos = 'medicamentos',
  Panales = 'panales',
  Psicosocial = 'psicosocial',
  Transporte = 'transporte',
  Documentos = 'documentos'
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

/**
 * Que roles puede CREAR cada rol.
 *
 * Vive en el contrato porque lo usan los dos lados: la API para decidir y la
 * aplicacion para no ofrecer lo que va a ser rechazado. Escrito dos veces, el dia
 * que cambie uno la pantalla ofrecera algo que el servidor niega, y quien lo
 * sufre es el coordinador que esta dando de alta a su equipo.
 *
 * NADIE CREA CUSTODIOS. El primero se siembra desde la infraestructura, y que la
 * cima de la cadena quede fuera del alcance de la aplicacion es deliberado: el
 * custodio responde por la proteccion de datos personales, y ese nombramiento no
 * puede ser el efecto secundario de un formulario.
 *
 * La misma regla esta en la base, como politica de acceso. Aqui es para dar un
 * mensaje decente; alli es para que sea cierta.
 */
export const ROLES_QUE_PUEDE_CREAR: Readonly<Record<Rol, readonly Rol[]>> = {
  [Rol.Custodio]: [Rol.Coordinador, Rol.Validador, Rol.Digitador, Rol.Lider],
  /** El coordinador arma su equipo de registro, y no puede ascender a nadie a su nivel. */
  [Rol.Coordinador]: [Rol.Lider, Rol.Digitador],
  [Rol.Validador]: [],
  [Rol.Digitador]: [],
  [Rol.Lider]: []
};

/** True si quien tiene `rol` puede dar de alta a alguien con `rolNuevo`. */
export function puedeCrear(rol: Rol, rolNuevo: Rol): boolean {
  return ROLES_QUE_PUEDE_CREAR[rol]?.includes(rolNuevo) ?? false;
}

/** Tipo de fotografia asociada al caso. */
export enum TipoFoto {
  Fachada = 'fachada',
  Dano = 'dano',
  Cultivo = 'cultivo'
}
