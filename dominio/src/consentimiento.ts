import { Control, Hogar, Vulnerabilidad } from './caso.model';

/**
 * La regla de consentimiento, como funcion pura.
 *
 * POR QUE ESTA AQUI Y NO EN CADA LADO
 *
 * La documentacion del proyecto afirma que "la regla de consentimiento se aplica en
 * el borde de salida hacia el servidor, no en la interfaz: sin autorizacion de la
 * familia, la identidad no viaja, y ninguna ruta de la aplicacion puede saltarse esa
 * validacion".
 *
 * Con la regla escrita dos veces —una en el cliente y otra en el servidor— esa frase
 * es una intencion. Escrita una sola vez y llamada por ambos, es una propiedad: no
 * existe camino que la evite porque no existe otra implementacion.
 *
 * Esto NO reemplaza la restriccion en el esquema de la base. Son tres capas y las
 * tres hacen falta: el cliente no persiste lo que no debe, el servidor no escribe lo
 * que no debe, y la base rechaza lo que no debe llegarle. Ver
 * docs/hallazgos-revision.md H8 y H9.
 *
 * @version 0.1.0
 */

/**
 * Campos que NO se conservan cuando la familia no autorizo el tratamiento.
 *
 * El telefono NO esta en esta lista, y es una decision pendiente, no un olvido: sin
 * telefono no se puede verificar el caso ni avisarle a la familia que la ayuda va en
 * camino, pero un numero de celular es dato personal identificante y de contacto
 * directo. La decision es del frente de datos y cumplimiento: docs/hallazgos-revision.md H7.
 *
 * Cuando se resuelva, se agrega aqui y surte efecto en el cliente y en el servidor a
 * la vez, sin que haya que acordarse de cambiar dos archivos.
 */
export const CAMPOS_NOMINALES = [
  'jefeNombres',
  'jefeApellidos',
  'tipoDoc',
  'numDoc'
] as const satisfies readonly (keyof Hogar)[];

export type CampoNominal = (typeof CAMPOS_NOMINALES)[number];

/**
 * Campos SENSIBLES en el sentido de la Ley 1581: salud, discapacidad, gestacion y
 * origen etnico. No se conservan sin autorizacion especifica.
 *
 * POR QUE ESTA LISTA NACE EL 19 DE AGOSTO Y NO ANTES
 *
 * Porque no existia. La regla del proyecto protegia cuatro campos —nombres,
 * apellidos, tipo y numero de documento— y todo lo demas viajaba siempre. Eso incluia
 * gestantes, discapacidad y enfermedad cronica desde el primer dia, y desde el 16 de
 * agosto tambien fallecidos y heridos, que agregamos nosotros sin tocar esta regla.
 *
 * La ley los trata aparte por una razon concreta: son los datos con los que se puede
 * discriminar a alguien. Que una familia tenga una persona con discapacidad, o una
 * gestante, o un muerto, no puede quedar registrado porque si.
 *
 * QUE PASA CON LOS NUMEROS AGREGADOS
 *
 * Un conteo por vereda —«31 gestantes en El Venado»— no identifica a nadie y sigue
 * siendo util para pedir atencion. Esta regla protege el dato de CADA HOGAR, no la
 * cifra del municipio: lo que se retira es la fila, no la estadistica.
 */
export const CAMPOS_SENSIBLES = [
  'gestantes',
  'lactantes',
  'discapacidadN',
  // Revela una condicion protegida aunque no pida diagnostico: quien no puede salir
  // solo es, casi siempre, una persona mayor dependiente, lesionada o con movilidad
  // reducida. Se protege igual que la discapacidad. Ver la nota de abajo: hay una
  // tension real entre esto y que un organismo de socorro sepa a quien sacar primero.
  'requiereApoyoEvacuar',
  'discapacidadTipo',
  'enfCronicaN',
  'fallecidos',
  'heridosLeves',
  'heridosGraves',
  'requiereMedicamento',
  'medicamentoCual',
  'etnia',
  'victimaConflicto'
] as const satisfies readonly (keyof Vulnerabilidad)[];

export type CampoSensible = (typeof CAMPOS_SENSIBLES)[number];

/** Valor neutro de cada campo sensible cuando no hay autorizacion para conservarlo. */
const VACIO_SENSIBLE: Vulnerabilidad = {
  gestantes: 0,
  lactantes: 0,
  discapacidadN: 0,
  requiereApoyoEvacuar: 0,
  discapacidadTipo: [],
  enfCronicaN: 0,
  fallecidos: 0,
  heridosLeves: 0,
  heridosGraves: 0,
  requiereMedicamento: null,
  medicamentoCual: null,
  etnia: null,
  victimaConflicto: null
};

/** Resultado de aplicar la regla. */
export interface ResultadoConsentimiento {
  hogar: Hogar;
  /**
   * Campos que traian valor y se retiraron.
   *
   * Vacio en el caso normal: el cliente ya no deberia haberlos enviado. Si llega algo
   * aqui, el dato queda protegido igual, pero indica un defecto en el cliente que
   * conviene registrar en lugar de silenciar.
   */
  camposRetirados: CampoNominal[];
}

/** True si la identidad de la familia puede persistirse y viajar. */
export function identidadPuedeViajar(control: Pick<Control, 'consentimiento'>): boolean {
  return control.consentimiento === true;
}

/**
 * Devuelve el hogar con la identidad retirada si no hay autorizacion.
 *
 * No lanza excepcion a proposito. En una emergencia, perder un caso completo por un
 * defecto del cliente es peor que registrarlo sin identidad: el hogar queda contado y
 * la familia no desaparece del total que sustenta la peticion ante la entidad. El
 * defecto se reporta por `camposRetirados`, no tirando el trabajo del voluntario.
 */
export function aplicarConsentimiento(
  hogar: Hogar,
  control: Pick<Control, 'consentimiento'>
): ResultadoConsentimiento {
  if (identidadPuedeViajar(control)) {
    return { hogar, camposRetirados: [] };
  }

  const camposRetirados: CampoNominal[] = [];
  const limpio: Hogar = { ...hogar };

  for (const campo of CAMPOS_NOMINALES) {
    if (limpio[campo] !== null && limpio[campo] !== undefined && limpio[campo] !== '') {
      camposRetirados.push(campo);
    }
    limpio[campo] = null;
  }

  return { hogar: limpio, camposRetirados };
}

/** True si los datos sensibles de la familia pueden persistirse y viajar. */
export function sensiblesPuedenViajar(
  control: Pick<Control, 'autorizaDatosSensibles'>
): boolean {
  return control.autorizaDatosSensibles === true;
}

/** Resultado de aplicar la regla de datos sensibles. */
export interface ResultadoSensibles {
  vulnerabilidad: Vulnerabilidad;
  camposRetirados: CampoSensible[];
}

/**
 * Devuelve la vulnerabilidad sin datos sensibles cuando no hay autorizacion.
 *
 * Misma decision que con la identidad y por la misma razon: no se rechaza el caso. La
 * familia queda contada —cuantas personas, donde, que dano— y lo que se pierde es el
 * detalle que la ley protege. Perder el caso entero seria peor para esa familia.
 *
 * Los conteos vuelven a cero en vez de a nulo porque el esquema los declara no nulos:
 * cero significa «no consta», que es exactamente lo que hay cuando nadie autorizo a
 * preguntar.
 */
export function aplicarAutorizacionSensibles(
  vulnerabilidad: Vulnerabilidad,
  control: Pick<Control, 'autorizaDatosSensibles'>
): ResultadoSensibles {
  if (sensiblesPuedenViajar(control)) {
    return { vulnerabilidad, camposRetirados: [] };
  }

  const camposRetirados = sensiblesResiduales(vulnerabilidad, control);

  // Se parte del molde vacio y se le devuelven los campos que NO son sensibles, en
  // vez de recorrer la lista borrando. La diferencia importa: escrito asi, el dia que
  // alguien agregue un campo sensible al contrato y olvide ponerlo en la lista, ese
  // campo queda FUERA por omision en vez de colarse por omision.
  const limpia: Vulnerabilidad = { ...VACIO_SENSIBLE };

  for (const clave of Object.keys(vulnerabilidad) as (keyof Vulnerabilidad)[]) {
    if (!CAMPOS_SENSIBLES.includes(clave as CampoSensible)) {
      Object.assign(limpia, { [clave]: vulnerabilidad[clave] });
    }
  }

  return { vulnerabilidad: limpia, camposRetirados };
}

/** Igual que {@link identidadResidual}, para los campos sensibles. */
export function sensiblesResiduales(
  vulnerabilidad: Vulnerabilidad,
  control: Pick<Control, 'autorizaDatosSensibles'>
): CampoSensible[] {
  if (sensiblesPuedenViajar(control)) return [];

  return CAMPOS_SENSIBLES.filter((campo) => {
    const valor = vulnerabilidad[campo];
    return Array.isArray(valor)
      ? valor.length > 0
      : valor !== null && valor !== undefined && valor !== 0 && valor !== '';
  });
}

/**
 * Comprueba que un hogar ya limpio no conserve identidad.
 *
 * Es el aserto que usan las pruebas y la ultima verificacion antes de escribir. Si
 * esto devuelve algo distinto de vacio con consentimiento en false, hay una ruta que
 * se salto la regla y eso es exactamente lo que la documentacion promete que no puede
 * pasar.
 */
export function identidadResidual(
  hogar: Hogar,
  control: Pick<Control, 'consentimiento'>
): CampoNominal[] {
  if (identidadPuedeViajar(control)) return [];
  return CAMPOS_NOMINALES.filter((campo) => {
    const valor = hogar[campo];
    return valor !== null && valor !== undefined && valor !== '';
  });
}

// =============================================================================
// QUITAR EL NOMBRE NO VUELVE ANONIMO A NADIE
// =============================================================================
//
// Es la observacion mas fina que ha recibido este proyecto y es correcta: la Ley 1581
// llama dato personal a cualquier informacion que pueda ASOCIARSE a una persona
// determinable, y en una vereda
//
//     coordenada exacta + siete personas + vivienda destruida
//
// senala una sola casa. Quitar el nombre y creer que con eso el registro quedo anonimo
// es el error clasico de anonimizacion, y es peor que no anonimizar, porque produce la
// confianza de haberlo hecho.
//
// QUE SE HACE. Cuando la persona no autoriza el tratamiento de sus datos, la
// coordenada NO se guarda como se tomo: se redondea a dos decimales, algo mas de un
// kilometro. Eso conserva lo unico que el registro necesita sin identidad —saber que
// la afectacion esta en esta vereda y no en la de al lado, para contarla y ubicarla en
// un mapa de veredas— y deja de senalar una casa.
//
// Tambien se retira el punto de referencia. «La casa azul frente a la escuela» no
// tiene nombre y aun asi identifica mejor que una cedula.
//
// LO QUE ESTO NO ES. No convierte el registro en anonimo en sentido estricto: un
// hogar de doce personas en una vereda de treinta casas sigue siendo singular. Es
// reduccion de identificabilidad, no anonimizacion, y conviene llamarlo por su nombre
// para que nadie prometa lo segundo. La separacion real entre una base identificable y
// una estadistica es un trabajo mayor y esta anotado como tal.

/** Cuanto se degrada la coordenada. Dos decimales es algo mas de un kilometro. */
const DECIMALES_SIN_AUTORIZACION = 2;

/** La parte de la ubicacion que puede senalar una casa. */
export interface UbicacionDegradable {
  lat: number | null;
  lon: number | null;
  precisionM: number | null;
  direccionRef: string | null;
}

export interface ResultadoUbicacion<T extends UbicacionDegradable> {
  ubicacion: T;
  /** True si hubo que degradar algo. Sirve para dejarlo anotado en el registro. */
  degradada: boolean;
}

/**
 * Deja la ubicacion en lo que puede viajar segun lo que la persona autorizo.
 *
 * Con autorizacion no toca nada: la coordenada exacta es justamente lo que permite que
 * un organismo de socorro llegue a la casa.
 */
export function aplicarConsentimientoUbicacion<T extends UbicacionDegradable>(
  ubicacion: T,
  control: Pick<Control, 'consentimiento'>
): ResultadoUbicacion<T> {
  if (identidadPuedeViajar(control)) {
    return { ubicacion, degradada: false };
  }

  const teniaPunto = ubicacion.lat !== null || ubicacion.lon !== null;
  const teniaReferencia = Boolean(ubicacion.direccionRef);

  return {
    ubicacion: {
      ...ubicacion,
      lat: redondear(ubicacion.lat),
      lon: redondear(ubicacion.lon),
      // La precision medida dejaria de ser cierta —y una precision de doce metros
      // sobre un punto redondeado a un kilometro invita a confiar en el punto.
      precisionM: null,
      direccionRef: null
    },
    degradada: teniaPunto || teniaReferencia
  };
}

function redondear(valor: number | null): number | null {
  if (valor === null) return null;
  const factor = 10 ** DECIMALES_SIN_AUTORIZACION;
  return Math.round(valor * factor) / factor;
}
