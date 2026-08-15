import {
  FuenteCoordenada,
  FuenteDato,
  LugarPernocta,
  NivelAfectacion,
  Prioridad,
  Tenencia,
  Zona,
  type CasoParaSincronizar
} from '@raiz/dominio';

/** Caso inventado minimo para pruebas. Nunca datos reales. */
export function casoDePrueba(origenId: string, ajustes: Partial<CasoParaSincronizar> = {}): CasoParaSincronizar {
  const base: CasoParaSincronizar = {
    origenId,
    control: {
      registradorNombre: 'Ana Lider (prueba)',
      registradorOrg: 'Junta ficticia',
      registradorTel: '3000000001',
      fuenteDato: FuenteDato.Presencial,
      consentimiento: true,
      fechaRegistro: '2026-08-14'
    },
    ubicacion: {
      departamento: 'Valle del Cauca',
      municipio: 'Sevilla',
      zona: Zona.Rural,
      vereda: 'Vereda Ficticia Prueba',
      corregimiento: null,
      barrio: null,
      comuna: null,
      direccionRef: 'Cerca del puente de prueba',
      lat: 4.31234567,
      lon: -75.91234567,
      precisionM: 12,
      gpsFuente: FuenteCoordenada.Sitio
    },
    hogar: {
      jefeNombres: 'Familia',
      jefeApellidos: 'Inventada',
      tipoDoc: 'CC',
      numDoc: '1000000999',
      tel1: '3000000999',
      tel1Whatsapp: true,
      tel2: null,
      personasTotal: 4,
      composicion: {
        h0a5: 0,
        m0a5: 0,
        h6a11: 1,
        m6a11: 1,
        h12a17: 0,
        m12a17: 0,
        h18a59: 1,
        m18a59: 1,
        h60mas: 0,
        m60mas: 0
      },
      vulnerabilidad: {
        gestantes: 0,
        lactantes: 0,
        discapacidadN: 0,
        discapacidadTipo: [],
        enfCronicaN: 0,
        requiereMedicamento: null,
        medicamentoCual: null,
        etnia: null,
        victimaConflicto: null
      },
      afiliacion: ['no_afiliada'],
      afiliacionCual: null
    },
    vivienda: {
      tenencia: Tenencia.Propietario,
      arrendadorContacto: null,
      hogaresEnEstructura: 1,
      tipoVivienda: 'casa',
      materialParedes: null,
      materialTecho: null,
      afectacion: NivelAfectacion.Severo,
      habitable: false,
      riesgoColapso: true,
      riesgoColapsoDesc: 'Muro agrietado (dato de prueba)',
      dondeDuerme: LugarPernocta.Carpa,
      requiereVivienda: ['reconstruccion'],
      serviciosAfectados: ['agua']
    },
    anexoRural: {
      predioNombre: 'Predio ficticio',
      areaHa: 1.5,
      tenenciaPredio: null,
      tieneTitulo: null,
      viaAcceso: 'carro',
      cultivos: ['cafe'],
      cultivosOtro: null,
      areaCultivoAfectadaHa: 0.5,
      perdidaPct: 40,
      perdidaEstimadaCopMinor: 150000000,
      bovinosPerdidos: 0,
      porcinosPerdidos: 0,
      avesPerdidas: 0,
      otrosAnimales: null,
      infraProductiva: [],
      requiereAgro: ['semilla']
    },
    anexoUrbano: null,
    anexoConvenio: {
      afiliadaFederacion: false,
      aplicaConvenio: false,
      convenioLinea: [],
      convenioObs: null
    },
    triaje: {
      prioridad: Prioridad.P1,
      necesidadesInmediatas: ['techo', 'agua'],
      yaRecibioAyuda: false,
      ayudaCual: null,
      ayudaQuien: null,
      observaciones: 'Caso de prueba automatica HU 1.2.4'
    }
  };

  return {
    ...base,
    ...ajustes,
    control: { ...base.control, ...ajustes.control },
    ubicacion: { ...base.ubicacion, ...ajustes.ubicacion },
    hogar: {
      ...base.hogar,
      ...ajustes.hogar,
      composicion: {
        ...base.hogar.composicion,
        ...ajustes.hogar?.composicion
      },
      vulnerabilidad: {
        ...base.hogar.vulnerabilidad,
        ...ajustes.hogar?.vulnerabilidad
      }
    },
    vivienda: ajustes.vivienda === null ? null : { ...base.vivienda!, ...ajustes.vivienda },
    anexoRural: ajustes.anexoRural === null ? null : { ...base.anexoRural!, ...ajustes.anexoRural },
    anexoConvenio:
      ajustes.anexoConvenio === null
        ? null
        : { ...base.anexoConvenio!, ...ajustes.anexoConvenio },
    triaje: ajustes.triaje === null ? null : { ...base.triaje!, ...ajustes.triaje }
  };
}
