import type { Hogar, Triaje, Vivienda } from './caso.model';
import {
  Habitabilidad,
  LugarPernocta,
  Necesidad,
  NivelAfectacion,
  Prioridad,
  RiesgoVisible
} from './enums';

/**
 * La prioridad se calcula, y de eso se guarda el POR QUE.
 *
 * -----------------------------------------------------------------------------------
 * POR QUE NO LA ELIGE QUIEN REGISTRA
 * -----------------------------------------------------------------------------------
 *
 * Un caso que llega marcado P1 obliga a la entidad a confiar en el criterio de quien
 * lo marco, y ese criterio varia entre dos voluntarios de la misma vereda. Un caso que
 * llega «P1 porque la vivienda es inhabitable, la familia no tiene alojamiento seguro
 * y hay una persona que requiere medicacion permanente» se sostiene solo, y ademas se
 * puede discutir: si la entidad no esta de acuerdo, discute con un motivo, no con una
 * letra.
 *
 * -----------------------------------------------------------------------------------
 * LA PRIORIDAD ES MULTIVARIABLE, Y ESO CAMBIA LO QUE SIGNIFICABA
 * -----------------------------------------------------------------------------------
 *
 * Antes P2 queria decir «dano severo». Eso confunde el estado del muro con la urgencia
 * de la familia, y produce dos errores simetricos:
 *
 *   Una casa con dano MODERADO donde vive una persona mayor dependiente, sin agua y
 *   sin donde dormir, es mas urgente que muchas severas.
 *
 *   Una casa SEVERA, ya evacuada, con la familia donde un pariente y servicios en
 *   pie, puede esperar.
 *
 * Por eso lo que decide no es el dano sino la NECESIDAD: peligro para la vida, techo,
 * agua, salud. El dano entra como una senal mas.
 *
 * -----------------------------------------------------------------------------------
 * ES PRELIMINAR Y SE DICE
 * -----------------------------------------------------------------------------------
 *
 * No es una evaluacion tecnica ni una decision administrativa. Es una ordenacion para
 * saber a quien visitar primero, sujeta a lo que despues determine la autoridad
 * competente. Quien registra puede elevarla a mano cuando tenga enfrente una
 * emergencia que ninguna regla previo — bajarla no, porque para eso esta la regla.
 *
 * @version 0.1.0
 */

/** Lo que hace falta para calcular. Se pide lo minimo, para poder probarlo sin armar un caso entero. */
export interface EntradaPrioridad {
  vivienda: Pick<
    Vivienda,
    | 'afectacion'
    | 'habitabilidad'
    | 'riesgoVisible'
    | 'dondeDuerme'
    | 'serviciosAfectados'
    // Los dos viejos: los sigue mandando la aplicacion que esta hoy en los telefonos.
    | 'habitable'
    | 'riesgoColapso'
  > | null;
  hogar: Pick<Hogar, 'vulnerabilidad'>;
  triaje: Pick<Triaje, 'necesidadesInmediatas'> | null;
}

export interface PrioridadCalculada {
  prioridad: Prioridad;
  /** Las razones, en el orden en que pesan. Es lo que viaja al oficio. */
  motivos: string[];
}

/**
 * Traduce los campos viejos a los tres ejes, cuando los nuevos no vienen.
 *
 * NO ES CORTESIA CON EL CODIGO ANTIGUO: es que la aplicacion que hoy esta en los
 * telefonos de la vereda es la anterior, y va a seguir estandolo hasta que cada
 * voluntario abra la nueva. Si el calculo ignorara `riesgoColapso`, todos los casos
 * que lleguen de esos telefonos —los de esta semana— perderian la senal de peligro y
 * entrarian con prioridad baja. Un fallo asi no da error: solo deja de mandar a
 * alguien.
 *
 * «A simple vista, esta casa amenaza con caerse» se lee como PELIGRO EVIDENTE y no
 * como «requiere evaluacion». Ante la duda se sobreestima el riesgo: equivocarse hacia
 * arriba manda a alguien a mirar de mas; equivocarse hacia abajo deja a una familia
 * durmiendo bajo algo que se puede caer.
 */
function conEjesResueltos(v: EntradaPrioridad['vivienda']): EntradaPrioridad['vivienda'] {
  if (!v) return v;

  return {
    ...v,
    riesgoVisible:
      v.riesgoVisible ??
      (v.riesgoColapso === true ? RiesgoVisible.PeligroEvidente : RiesgoVisible.NoObservado),
    habitabilidad:
      v.habitabilidad ??
      (v.habitable === false ? Habitabilidad.NoHabitable : Habitabilidad.Habitable)
  };
}

/** Donde dormir NO es dormir seguro. Estas tres son intemperie con otro nombre. */
const SIN_TECHO: readonly LugarPernocta[] = [
  LugarPernocta.Carpa,
  LugarPernocta.MismaVivienda,
  LugarPernocta.Otro
];

/**
 * Calcula la prioridad preliminar y sus motivos.
 *
 * Las reglas se evaluan de la mas grave a la menos, y la primera que se cumple manda.
 * Los motivos se acumulan TODOS los que apliquen, no solo el que decidio: una entidad
 * que lee «P1» quiere ver las tres razones, no la primera.
 */
export function calcularPrioridad(entrada: EntradaPrioridad): PrioridadCalculada {
  const v = conEjesResueltos(entrada.vivienda);
  const vul = entrada.hogar.vulnerabilidad;
  const necesidades = entrada.triaje?.necesidadesInmediatas ?? [];
  const motivos: string[] = [];

  // --- P0: la vida esta en juego hoy -----------------------------------------
  // Se separa de todo lo demas porque no compite con nada: un caso P0 no espera al
  // censo, se escala el mismo dia al organismo de socorro.
  const critico: string[] = [];

  if (v?.riesgoVisible === RiesgoVisible.PeligroEvidente) {
    critico.push('Peligro evidente en la vivienda: no se puede ingresar');
  }
  if (vul.heridosGraves > 0) {
    critico.push(`${vul.heridosGraves} persona(s) herida(s) remitida(s) a un hospital`);
  }
  if (necesidades.includes(Necesidad.AtencionMedica)) {
    critico.push('Requiere atención médica urgente');
  }
  if (necesidades.includes(Necesidad.Proteccion)) {
    critico.push('Requiere protección');
  }

  if (critico.length > 0) {
    return { prioridad: Prioridad.P0, motivos: critico };
  }

  // --- P1: necesidad humanitaria urgente --------------------------------------
  // El eje es el techo, el agua y la medicación permanente. Aquí es donde la prioridad
  // deja de seguir al daño: una casa moderada sin agua y con un dependiente pesa más
  // que una severa ya resuelta.
  if (v?.habitabilidad === Habitabilidad.NoHabitable) {
    motivos.push('La vivienda no es habitable');
  }
  if (v?.dondeDuerme && SIN_TECHO.includes(v.dondeDuerme) && v.habitabilidad === Habitabilidad.NoHabitable) {
    motivos.push('La familia no tiene alojamiento seguro esta noche');
  }
  if (necesidades.includes(Necesidad.AguaPotable) || v?.serviciosAfectados?.includes('agua')) {
    motivos.push('Sin agua potable');
  }
  if (vul.requiereApoyoEvacuar > 0) {
    motivos.push(`${vul.requiereApoyoEvacuar} persona(s) no pueden evacuar solas`);
  }
  if (vul.enfCronicaN > 0 || necesidades.includes(Necesidad.Medicamentos)) {
    motivos.push('Hay quien requiere medicamentos o atención médica permanente');
  }
  if (vul.gestantes > 0) {
    motivos.push(`${vul.gestantes} persona(s) gestante(s)`);
  }

  const urgente =
    v?.habitabilidad === Habitabilidad.NoHabitable ||
    v?.habitabilidad === Habitabilidad.Evacuada ||
    necesidades.includes(Necesidad.AlojamientoTemporal) ||
    motivos.length >= 2;

  if (urgente) {
    if (v?.habitabilidad === Habitabilidad.Evacuada && !motivos.includes('La vivienda no es habitable')) {
      motivos.push('La vivienda fue evacuada');
    }
    return { prioridad: Prioridad.P1, motivos: sinRepetir(motivos) };
  }

  // --- P2: afectación significativa -------------------------------------------
  if (v?.afectacion === NivelAfectacion.Severo || v?.afectacion === NivelAfectacion.Destruida) {
    motivos.push('Daño severo o destrucción de la vivienda');
  }
  if (v?.riesgoVisible === RiesgoVisible.RequiereEvaluacion) {
    motivos.push('Se observa una condición que requiere evaluación técnica');
  }
  if ((v?.serviciosAfectados?.length ?? 0) > 0) {
    motivos.push('Servicios esenciales afectados');
  }

  if (motivos.length > 0) {
    return { prioridad: Prioridad.P2, motivos: sinRepetir(motivos) };
  }

  // --- P3: afectación menor ----------------------------------------------------
  return {
    prioridad: Prioridad.P3,
    motivos: ['Daño reparable, vivienda habitable y sin necesidad humanitaria inmediata']
  };
}

/**
 * True si `manual` puede reemplazar a `calculada`.
 *
 * Solo se admite SUBIR. La regla existe para que la prioridad no dependa del criterio
 * de cada voluntario; permitir bajarla la devolveria al punto de partida y, peor,
 * dejaria casos urgentes marcados como leves sin que nadie note por que.
 *
 * Subir si se permite: ninguna regla previo la emergencia que alguien tiene enfrente.
 */
export function puedeElevarse(calculada: Prioridad, manual: Prioridad): boolean {
  const orden = [Prioridad.P3, Prioridad.P2, Prioridad.P1, Prioridad.P0];
  return orden.indexOf(manual) > orden.indexOf(calculada);
}

function sinRepetir(motivos: string[]): string[] {
  return [...new Set(motivos)];
}
