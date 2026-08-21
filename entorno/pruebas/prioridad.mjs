/**
 * La prioridad preliminar, contra los casos que la motivaron.
 *
 * Esta prueba existe por una razon concreta: el enlace institucional observo que
 * llamarle «dano severo» a P2 confunde el estado del muro con la urgencia de la
 * familia, y dio dos ejemplos que se contradicen entre si. Los dos estan aqui, y son
 * las dos primeras comprobaciones. Si alguien vuelve a atar la prioridad al dano, esas
 * dos fallan.
 *
 * Se corre con `node entorno/pruebas/prioridad.mjs` y no necesita base ni servidor: es
 * una funcion pura del contrato compartido, que es justamente por que puede probarse
 * asi de barato.
 */
import { calcularPrioridad, puedeElevarse } from '../../dominio/dist/index.js';

let fallos = 0;

function comprobar(descripcion, condicion, detalle = '') {
  if (!condicion) fallos++;
  console.log(`${condicion ? 'OK  ' : 'FALLO'} ${descripcion}${detalle ? ` -- ${detalle}` : ''}`);
}

const vulnerabilidadVacia = {
  gestantes: 0,
  lactantes: 0,
  discapacidadN: 0,
  discapacidadTipo: [],
  requiereApoyoEvacuar: 0,
  enfCronicaN: 0,
  fallecidos: 0,
  heridosLeves: 0,
  heridosGraves: 0,
  requiereMedicamento: null,
  medicamentoCual: null,
  etnia: null,
  victimaConflicto: null
};

const caso = ({ vivienda = null, vulnerabilidad = {}, necesidades = [] } = {}) => ({
  vivienda,
  hogar: { vulnerabilidad: { ...vulnerabilidadVacia, ...vulnerabilidad } },
  triaje: { necesidadesInmediatas: necesidades }
});

// --- los dos ejemplos del enlace institucional -------------------------------
//
// Son simetricos a proposito: si la prioridad siguiera al dano, el primero saldria
// bajo y el segundo alto, que es exactamente al reves de lo que hay que atender.

const moderadaPeroUrgente = calcularPrioridad(
  caso({
    vivienda: {
      afectacion: 'moderado',
      habitabilidad: 'no_habitable',
      riesgoVisible: 'no_observado',
      dondeDuerme: 'carpa',
      serviciosAfectados: ['agua']
    },
    vulnerabilidad: { requiereApoyoEvacuar: 1 }
  })
);
comprobar(
  'casa MODERADA con dependiente, sin agua y sin techo: sube a P1',
  moderadaPeroUrgente.prioridad === 'p1',
  moderadaPeroUrgente.prioridad
);
comprobar(
  'y lo explica con sus razones, no con una letra sola',
  moderadaPeroUrgente.motivos.length >= 3,
  moderadaPeroUrgente.motivos.join(' · ')
);

const severaPeroResuelta = calcularPrioridad(
  caso({
    vivienda: {
      afectacion: 'severo',
      habitabilidad: 'habitable',
      riesgoVisible: 'no_observado',
      dondeDuerme: 'familiar_vecino',
      serviciosAfectados: []
    }
  })
);
comprobar(
  'casa SEVERA ya resuelta, con la familia donde un pariente: baja a P2',
  severaPeroResuelta.prioridad === 'p2',
  severaPeroResuelta.prioridad
);

// --- P0: no compite con nada -------------------------------------------------
const peligro = calcularPrioridad(
  caso({
    vivienda: {
      afectacion: 'leve',
      habitabilidad: 'habitable',
      riesgoVisible: 'peligro_evidente',
      dondeDuerme: 'misma_vivienda',
      serviciosAfectados: []
    }
  })
);
comprobar('peligro evidente es P0 aunque el dano se vea leve', peligro.prioridad === 'p0', peligro.prioridad);
comprobar('y el motivo dice que no se puede ingresar', peligro.motivos[0].includes('no se puede ingresar'));

const herido = calcularPrioridad(caso({ vulnerabilidad: { heridosGraves: 2 } }));
comprobar('persona remitida a un hospital es P0', herido.prioridad === 'p0', herido.prioridad);

const proteccion = calcularPrioridad(caso({ necesidades: ['proteccion'] }));
comprobar('una necesidad de proteccion es P0', proteccion.prioridad === 'p0', proteccion.prioridad);
comprobar(
  'y NO se piden detalles: el motivo es una sola linea',
  proteccion.motivos.length === 1,
  proteccion.motivos.join(' · ')
);

// --- P3: el caso sin urgencia -------------------------------------------------
const leve = calcularPrioridad(
  caso({
    vivienda: {
      afectacion: 'leve',
      habitabilidad: 'habitable',
      riesgoVisible: 'no_observado',
      dondeDuerme: 'misma_vivienda',
      serviciosAfectados: []
    }
  })
);
comprobar('dano leve con todo en pie es P3', leve.prioridad === 'p3', leve.prioridad);
comprobar('y aun asi trae su razon escrita', leve.motivos.length === 1, leve.motivos[0]);

// --- un caso sin vivienda no revienta ------------------------------------------
// Pasa de verdad: el voluntario alcanza a llenar el paso 2 y se le acaba la bateria.
const incompleto = calcularPrioridad(caso());
comprobar('un caso a medias no rompe el calculo', incompleto.prioridad === 'p3', incompleto.prioridad);

// --- el telefono que hoy esta en la vereda -----------------------------------
//
// Manda los campos VIEJOS y ninguno de los tres ejes nuevos. Si el calculo los
// ignorara, todos los casos de esta semana entrarian con prioridad baja — y un fallo
// asi no da error: solo deja de mandar a alguien.
const telefonoViejo = calcularPrioridad(
  caso({
    vivienda: {
      afectacion: 'severo',
      habitabilidad: null,
      riesgoVisible: null,
      habitable: false,
      riesgoColapso: true,
      dondeDuerme: 'carpa',
      serviciosAfectados: []
    }
  })
);
comprobar(
  'la aplicacion anterior sigue produciendo P0 con riesgoColapso',
  telefonoViejo.prioridad === 'p0',
  telefonoViejo.prioridad
);

const viejoSinRiesgo = calcularPrioridad(
  caso({
    vivienda: {
      afectacion: 'severo',
      habitabilidad: null,
      riesgoVisible: null,
      habitable: false,
      riesgoColapso: false,
      dondeDuerme: 'carpa',
      serviciosAfectados: []
    }
  })
);
comprobar(
  'y su «no se puede vivir ahi» sigue valiendo P1',
  viejoSinRiesgo.prioridad === 'p1',
  viejoSinRiesgo.prioridad
);

// --- solo se puede subir --------------------------------------------------------
comprobar('se puede elevar P2 a P0 a mano', puedeElevarse('p2', 'p0'));
comprobar('NO se puede bajar P0 a P2 a mano', !puedeElevarse('p0', 'p2'));
comprobar('ni dejarla igual cuenta como elevar', !puedeElevarse('p1', 'p1'));

console.log(fallos === 0 ? '\nTodas las pruebas de prioridad pasaron' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
