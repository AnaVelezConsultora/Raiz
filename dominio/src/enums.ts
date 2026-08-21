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
  Documentos = 'documentos',
  // Agregadas el 20 de agosto por el enlace institucional. Se separan de las que ya
  // habia en vez de refundirlas: «medicamentos» y «atencion medica urgente» son dos
  // rutas distintas —una farmacia y una ambulancia— y mezclarlas pierde la urgencia.
  AlojamientoTemporal = 'alojamiento_temporal',
  AtencionMedica = 'atencion_medica',
  ApoyoDependencia = 'apoyo_dependencia',
  AlimentacionEspecial = 'alimentacion_especial',
  /**
   * Personas solas, familias expuestas, riesgo de violencia.
   *
   * Se marca la necesidad y NO se piden detalles: lo que sigue es una ruta
   * especializada, no un campo de texto en una ficha que llena un vecino.
   */
  Proteccion = 'proteccion'
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
  OtraEntidad = 'otra_entidad',
  // Metodos de captura que el enlace institucional pidio distinguir, porque el
  // sistema nacional de gestion del riesgo los trata distinto. Se AGREGAN a los
  // cinco anteriores en vez de reemplazarlos: hay casos ya registrados con ellos y
  // reescribir el pasado para que encaje en una lista nueva es perder el pasado.
  Videollamada = 'videollamada',
  JuntaAccionComunal = 'jac',
  AutoridadLocal = 'autoridad_local',
  OrganismoSocorro = 'organismo_socorro',
  ProfesionalTecnico = 'profesional_tecnico',
  FuenteDocumental = 'fuente_documental',
  Otra = 'otra'
}

/**
 * Como se llama cada metodo de captura en pantalla.
 *
 * En palabras de todos los dias y no en las del formulario oficial: quien llena esto
 * es un lider comunal de pie en un patio, no un funcionario.
 */
export const NOMBRE_FUENTE_DATO: Readonly<Record<FuenteDato, string>> = {
  [FuenteDato.Presencial]: 'Visita presencial',
  [FuenteDato.Llamada]: 'Llamada',
  [FuenteDato.Videollamada]: 'Videollamada',
  [FuenteDato.WhatsApp]: 'WhatsApp',
  [FuenteDato.Lider]: 'Reporte de la comunidad',
  [FuenteDato.JuntaAccionComunal]: 'Junta de Accion Comunal',
  [FuenteDato.AutoridadLocal]: 'Autoridad local',
  [FuenteDato.OrganismoSocorro]: 'Organismo de socorro',
  [FuenteDato.ProfesionalTecnico]: 'Profesional tecnico',
  [FuenteDato.OtraEntidad]: 'Otra entidad',
  [FuenteDato.FuenteDocumental]: 'Fuente documental',
  [FuenteDato.Otra]: 'Otra'
};

/**
 * QUIEN OBSERVO el hecho. No es lo mismo que el canal por el que llego.
 *
 * Presencial y «lo dijo la familia» es una combinacion legitima y frecuente: el
 * voluntario estuvo ahi, pero lo que anoto sobre las grietas del muro trasero se lo
 * contaron. Confundir canal con observador es lo que hace que un tablero presente
 * junto lo visto y lo referido, y ahi se pierde en un minuto la confiabilidad que
 * costo meses construir.
 *
 * NO CAMBIA NUNCA: es una propiedad del momento en que se levanto el dato.
 */
export enum OrigenDato {
  /** Lo vio quien registra, estando ahi. */
  Observado = 'observado',
  /** Lo dijo la familia sobre si misma. */
  Familia = 'familia',
  /** Lo conto un vecino, un lider, alguien mas. */
  Tercero = 'tercero',
  /** Vino del listado de otra entidad u organizacion. */
  ListadoEntidad = 'listado_entidad'
}

/**
 * HASTA DONDE esta comprobado el caso. Sube con el tiempo, y esa es su gracia.
 *
 * Es el otro eje: un caso reportado por un tercero —origen que no cambia— puede
 * subir de R1 a R4 el dia que un ingeniero lo revise.
 *
 * R5 no lo damos nosotros: lo da una entidad al incorporarlo a sus registros.
 */
export enum NivelVerificacion {
  Autodeclarado = 'r0_autodeclarado',
  ReportadoTercero = 'r1_reportado_tercero',
  VerificadoPresencial = 'r2_verificado_presencial',
  VerificadoDocumental = 'r3_verificado_documental',
  VerificadoTecnico = 'r4_verificado_tecnico',
  ValidadoInstitucional = 'r5_validado_institucional'
}

/**
 * Nivel con el que NACE un caso segun quien observo.
 *
 * Se deriva y no se pregunta: el voluntario ya contesto quien observo, y pedirle
 * ademas que se autoevalue el nivel de verificacion seria pedirle dos veces lo mismo
 * con palabras de abogado.
 *
 * Lo que sigue arriba —documental, tecnico, institucional— no lo puede declarar quien
 * captura. Eso lo sube la mesa cuando hay un documento, un profesional o una entidad
 * detras, y por eso no aparece en el formulario.
 */
export function nivelInicialDesde(origen: OrigenDato | null): NivelVerificacion {
  switch (origen) {
    case OrigenDato.Observado:
      return NivelVerificacion.VerificadoPresencial;
    case OrigenDato.Tercero:
      return NivelVerificacion.ReportadoTercero;
    case OrigenDato.ListadoEntidad:
      return NivelVerificacion.VerificadoDocumental;
    // La familia hablando de si misma, y tambien el caso sin responder: ante la duda,
    // el nivel mas bajo. Sobrestimar la verificacion es lo unico que no se puede
    // corregir despues, porque nadie vuelve a revisar lo que ya figura como verificado.
    default:
      return NivelVerificacion.Autodeclarado;
  }
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
  /**
   * EN DESUSO desde el 20 de agosto de 2026.
   *
   * Describia el riesgo dentro de la escala del dano, que es justamente la mezcla que
   * habia que deshacer: el dano es del muro y el riesgo es de entrar hoy. Se conserva
   * por los registros que lo traen y ya no se ofrece.
   */
  Riesgo = 'riesgo',
  /** Nadie pudo verlo, o no se pudo determinar desde afuera. */
  NoDeterminado = 'no_determinado'
}

/**
 * Si se puede estar ahi. NO es el dano.
 *
 * Una casa con dano moderado puede ser inhabitable por el terreno, y una severa puede
 * estar apuntalada y habitable. Fundirlos pierde la diferencia justo donde decide algo:
 * si esta familia necesita techo esta noche.
 */
export enum Habitabilidad {
  Habitable = 'habitable',
  /** Se puede estar, pero no en toda la casa. */
  ConRestricciones = 'habitable_con_restricciones',
  NoHabitable = 'no_habitable',
  /** Ya salieron, la haya decidido quien la haya decidido. */
  Evacuada = 'evacuada',
  NoDeterminado = 'no_determinado'
}

/**
 * Si entrar es peligroso HOY. Es una alerta comunitaria, no un dictamen.
 *
 * El nivel mas alto NO dice «riesgo inminente de colapso», que es una afirmacion
 * tecnica que un lider comunal no puede firmar y que expone al proyecto entero. Dice
 * lo que se ve y lo que hay que hacer: hay peligro evidente, no ingresar.
 */
export enum RiesgoVisible {
  NoObservado = 'no_observado',
  /** Algo se ve, y tiene que ir alguien que sepa. */
  RequiereEvaluacion = 'requiere_evaluacion',
  PeligroEvidente = 'peligro_evidente'
}

export const NOMBRE_HABITABILIDAD: Readonly<Record<Habitabilidad, string>> = {
  [Habitabilidad.Habitable]: 'Se puede vivir ahí',
  [Habitabilidad.ConRestricciones]: 'Se puede, pero no en toda la casa',
  [Habitabilidad.NoHabitable]: 'No se puede vivir ahí',
  [Habitabilidad.Evacuada]: 'La familia ya salió',
  [Habitabilidad.NoDeterminado]: 'No se pudo determinar'
};

export const NOMBRE_RIESGO_VISIBLE: Readonly<Record<RiesgoVisible, string>> = {
  [RiesgoVisible.NoObservado]: 'No se observa peligro',
  [RiesgoVisible.RequiereEvaluacion]: 'Se ve algo que debe revisar un técnico',
  [RiesgoVisible.PeligroEvidente]: 'Hay peligro evidente: no ingresar'
};

/**
 * Lo que se ve, en una lista cerrada.
 *
 * Con texto libre, «grietas», «rajaduras» y «fisuras» son tres cosas distintas y el
 * consolidado por vereda deja de ser sumable justo cuando hace falta. Y describir no
 * es diagnosticar: la lista nombra lo que cualquiera puede ver desde afuera.
 */
export const DANOS_VISIBLES: readonly { v: string; t: string }[] = [
  { v: 'grietas_muros', t: 'Grietas en muros' },
  { v: 'grietas_estructura', t: 'Grietas en columnas o vigas' },
  { v: 'muros_inclinados', t: 'Muros desplazados o inclinados' },
  { v: 'cubierta', t: 'Techo o cubierta afectada' },
  { v: 'piso', t: 'Piso afectado' },
  { v: 'aberturas', t: 'Puertas o ventanas deformadas' },
  { v: 'desprendimientos', t: 'Elementos desprendidos' },
  { v: 'colapso_parcial', t: 'Colapso parcial' },
  { v: 'colapso_total', t: 'Colapso total' },
  { v: 'agua', t: 'Daños en instalaciones de agua' },
  { v: 'electricas', t: 'Daños eléctricos visibles' },
  { v: 'otras_estructuras', t: 'Daños en otras estructuras del predio' },
  { v: 'no_determinado', t: 'No se puede determinar' }
];

/**
 * QUE documento tiene la familia, no el documento.
 *
 * Caracterizar sin pedir papeles: si despues hay una ruta juridica o de
 * reconstruccion, ahi se solicita lo que haga falta. Recoger escrituras hoy seria
 * acumular documentos sensibles que nadie necesita todavia, en telefonos prestados.
 */
export const DOCUMENTOS_TENENCIA: readonly { v: string; t: string }[] = [
  { v: 'escritura', t: 'Escritura' },
  { v: 'tradicion', t: 'Certificado de tradición' },
  { v: 'arrendamiento', t: 'Contrato de arrendamiento' },
  { v: 'compraventa', t: 'Documento de compraventa' },
  { v: 'posesion', t: 'Documento de posesión' },
  { v: 'comunitario', t: 'Documento comunitario' },
  { v: 'ninguno', t: 'No tiene documentos' },
  { v: 'no_sabe', t: 'No sabe' }
];

/**
 * Con que se sostiene el caso.
 *
 * Cuando una alcaldia pregunte de donde salio un dato, la respuesta util no es «hay
 * una foto»: es «visita presencial, mas lo que reporto la familia, mas seis
 * fotografias». Registrar QUE CLASE de evidencia respalda vale mas que la evidencia
 * sola, porque es lo que permite decir con que fuerza se sostiene.
 */
export const TIPOS_EVIDENCIA: readonly { v: string; t: string }[] = [
  { v: 'observacion', t: 'Observación presencial' },
  { v: 'reporte_familia', t: 'Reporte de la familia' },
  { v: 'fotografia', t: 'Fotografía' },
  { v: 'video', t: 'Video' },
  { v: 'documento', t: 'Documento' },
  { v: 'otra', t: 'Otra' }
];

/** Donde esta durmiendo la familia al momento del registro. */
export enum LugarPernocta {
  MismaVivienda = 'misma_vivienda',
  FamiliarVecino = 'familiar_vecino',
  Albergue = 'albergue',
  Carpa = 'carpa',
  Arriendo = 'arriendo',
  /** En un carro, en un bus, en lo que haya. Es intemperie con techo de lata. */
  Vehiculo = 'vehiculo',
  /** Un parque, una cancha, la orilla de la via. */
  EspacioPublico = 'espacio_publico',
  Otro = 'otro'
}

export const NOMBRE_LUGAR_PERNOCTA: Readonly<Record<LugarPernocta, string>> = {
  [LugarPernocta.MismaVivienda]: 'En la misma vivienda afectada',
  [LugarPernocta.FamiliarVecino]: 'Donde un familiar o un vecino',
  [LugarPernocta.Albergue]: 'En un albergue',
  [LugarPernocta.Carpa]: 'En carpa o cambuche',
  [LugarPernocta.Arriendo]: 'En un arriendo',
  [LugarPernocta.Vehiculo]: 'En un vehículo',
  [LugarPernocta.EspacioPublico]: 'En un espacio público',
  [LugarPernocta.Otro]: 'En otro lugar'
};

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

/**
 * Que clase de infraestructura es.
 *
 * El orden no es alfabetico: es el que usa la mesa cuando prioriza. El acueducto va
 * primero porque es el que deja sin servicio a mas hogares de un solo golpe, y la via
 * va alto porque una via cerrada aisla veredas enteras y bloquea la ayuda de todas las
 * demas.
 */
export enum TipoPunto {
  Acueducto = 'acueducto',
  Via = 'via',
  Energia = 'energia',
  Puente = 'puente',
  Alcantarillado = 'alcantarillado',
  PuestoSalud = 'puesto_salud',
  Escuela = 'escuela',
  /** Caseta o salon comunal. Suele ser el albergue de la vereda. */
  CentroComunitario = 'centro_comunitario',
  Telecomunicaciones = 'telecomunicaciones',
  Otro = 'otro'
}

/** Como esta prestando el servicio hoy. Cambia con el tiempo: es lo que se repara. */
export enum EstadoServicio {
  /** Se dano algo pero sigue sirviendo. */
  Operativo = 'operativo',
  /** Funciona a ratos o a media capacidad. */
  Intermitente = 'intermitente',
  /** No presta servicio, pero se puede reparar. */
  FueraServicio = 'fuera_servicio',
  /** Hay que volverlo a construir. */
  Destruido = 'destruido'
}

/** Nombre legible del tipo de punto, para pantalla y para oficio. */
export const NOMBRE_TIPO_PUNTO: Readonly<Record<TipoPunto, string>> = {
  [TipoPunto.Acueducto]: 'Acueducto',
  [TipoPunto.Via]: 'Vía',
  [TipoPunto.Energia]: 'Energía',
  [TipoPunto.Puente]: 'Puente',
  [TipoPunto.Alcantarillado]: 'Alcantarillado',
  [TipoPunto.PuestoSalud]: 'Puesto de salud',
  [TipoPunto.Escuela]: 'Escuela',
  [TipoPunto.CentroComunitario]: 'Centro comunitario',
  [TipoPunto.Telecomunicaciones]: 'Telecomunicaciones',
  [TipoPunto.Otro]: 'Otro'
};

/** Nombre legible del estado del servicio. */
export const NOMBRE_ESTADO_SERVICIO: Readonly<Record<EstadoServicio, string>> = {
  [EstadoServicio.Operativo]: 'Funcionando',
  [EstadoServicio.Intermitente]: 'A medias',
  [EstadoServicio.FueraServicio]: 'Sin servicio',
  [EstadoServicio.Destruido]: 'Destruido'
};
