import {
  aplicarConsentimiento,
  type AnexoConvenio,
  type AnexoRural,
  type AnexoUrbano,
  type CasoParaSincronizar,
  type Hogar,
  type Triaje,
  type Ubicacion,
  type Vivienda
} from '@raiz/dominio';

/**
 * Valores listos para el INSERT/UPDATE de `familias`.
 * Los nombres de propiedad coinciden con las columnas de schema.sql.
 */
export interface FilaFamilia {
  origen_id: string;
  fecha_registro: string;
  registrador_nombre: string;
  registrador_org: string | null;
  registrador_tel: string | null;
  fuente_dato: string;
  consentimiento: boolean;
  departamento: string;
  municipio: string;
  zona: string;
  vereda: string | null;
  corregimiento: string | null;
  barrio: string | null;
  comuna: string | null;
  direccion_ref: string | null;
  lat: number | null;
  lon: number | null;
  gps_fuente: string | null;
  jefe_nombres: string | null;
  jefe_apellidos: string | null;
  tipo_doc: string | null;
  num_doc: string | null;
  tel_1: string;
  tel_1_whatsapp: boolean | null;
  tel_2: string | null;
  personas_total: number;
  h_0_5: number;
  m_0_5: number;
  h_6_11: number;
  m_6_11: number;
  h_12_17: number;
  m_12_17: number;
  h_18_59: number;
  m_18_59: number;
  h_60: number;
  m_60: number;
  gestantes: number;
  lactantes: number;
  discapacidad_n: number;
  discapacidad_tipo: string[];
  enf_cronica_n: number;
  requiere_medicamento: boolean | null;
  medicamento_cual: string | null;
  etnia: string | null;
  victima_conflicto: boolean | null;
  afiliacion: string[];
  afiliacion_cual: string | null;
  afiliada_federacion: boolean | null;
  aplica_convenio: boolean;
  convenio_linea: string[];
  convenio_obs: string | null;
  prioridad: string;
  necesidades_inmediatas: string[];
  ya_recibio_ayuda: boolean | null;
  ayuda_cual: string | null;
  ayuda_quien: string | null;
  observaciones: string | null;
}

export interface FilaVivienda {
  tenencia: string;
  arrendador_contacto: string | null;
  hogares_en_estructura: number;
  tipo_vivienda: string | null;
  material_paredes: string | null;
  material_techo: string | null;
  afectacion: string;
  habitable: boolean;
  riesgo_colapso: boolean;
  riesgo_colapso_desc: string | null;
  donde_duerme: string | null;
  requiere_vivienda: string[];
  servicios_afectados: string[];
  estrato: string | null;
  tipo_unidad: string | null;
  perdio_medio_vida: boolean | null;
  medio_vida_desc: string | null;
  requiere_urbano: string[];
}

export interface FilaProduccion {
  predio_nombre: string | null;
  area_ha: number | null;
  tenencia_predio: string | null;
  tiene_titulo: boolean | null;
  via_acceso: string | null;
  cultivos: string[];
  cultivos_otro: string | null;
  area_cultivo_afectada_ha: number | null;
  perdida_pct: number | null;
  perdida_estimada_cop_minor: number | null;
  bovinos_perdidos: number;
  porcinos_perdidos: number;
  aves_perdidas: number;
  otros_animales: string | null;
  infra_productiva: string[];
  requiere_agro: string[];
}

/**
 * Traduce el contrato de red a filas SQL.
 * Aplica la regla de consentimiento una sola vez, en el borde de escritura.
 */
export function casoAFilas(caso: CasoParaSincronizar): {
  familia: FilaFamilia;
  vivienda: FilaVivienda | null;
  produccion: FilaProduccion | null;
} {
  const { hogar } = aplicarConsentimiento(caso.hogar, caso.control);

  return {
    familia: aFamilia(caso, hogar),
    vivienda: caso.vivienda ? aVivienda(caso.vivienda, caso.anexoUrbano) : null,
    produccion: caso.anexoRural ? aProduccion(caso.anexoRural) : null
  };
}

function aFamilia(caso: CasoParaSincronizar, hogar: Hogar): FilaFamilia {
  const u: Ubicacion = caso.ubicacion;
  const c = hogar.composicion;
  const v = hogar.vulnerabilidad;
  const convenio: AnexoConvenio | null = caso.anexoConvenio;
  const triaje: Triaje | null = caso.triaje;

  return {
    origen_id: caso.origenId,
    fecha_registro: caso.control.fechaRegistro,
    registrador_nombre: caso.control.registradorNombre,
    registrador_org: caso.control.registradorOrg,
    registrador_tel: caso.control.registradorTel,
    fuente_dato: caso.control.fuenteDato,
    consentimiento: caso.control.consentimiento,
    departamento: u.departamento,
    municipio: u.municipio,
    zona: u.zona,
    vereda: u.vereda,
    corregimiento: u.corregimiento,
    barrio: u.barrio,
    comuna: u.comuna,
    direccion_ref: u.direccionRef,
    lat: u.lat,
    lon: u.lon,
    gps_fuente: u.gpsFuente,
    jefe_nombres: hogar.jefeNombres,
    jefe_apellidos: hogar.jefeApellidos,
    tipo_doc: hogar.tipoDoc,
    num_doc: hogar.numDoc,
    tel_1: hogar.tel1,
    tel_1_whatsapp: hogar.tel1Whatsapp,
    tel_2: hogar.tel2,
    personas_total: hogar.personasTotal,
    h_0_5: c.h0a5,
    m_0_5: c.m0a5,
    h_6_11: c.h6a11,
    m_6_11: c.m6a11,
    h_12_17: c.h12a17,
    m_12_17: c.m12a17,
    h_18_59: c.h18a59,
    m_18_59: c.m18a59,
    h_60: c.h60mas,
    m_60: c.m60mas,
    gestantes: v.gestantes,
    lactantes: v.lactantes,
    discapacidad_n: v.discapacidadN,
    discapacidad_tipo: v.discapacidadTipo,
    enf_cronica_n: v.enfCronicaN,
    requiere_medicamento: v.requiereMedicamento,
    medicamento_cual: v.medicamentoCual,
    etnia: v.etnia,
    victima_conflicto: v.victimaConflicto,
    afiliacion: hogar.afiliacion,
    afiliacion_cual: hogar.afiliacionCual,
    afiliada_federacion: convenio?.afiliadaFederacion ?? null,
    aplica_convenio: convenio?.aplicaConvenio ?? false,
    convenio_linea: convenio?.convenioLinea ?? [],
    convenio_obs: convenio?.convenioObs ?? null,
    prioridad: triaje?.prioridad ?? 'p3',
    necesidades_inmediatas: triaje?.necesidadesInmediatas ?? [],
    ya_recibio_ayuda: triaje?.yaRecibioAyuda ?? null,
    ayuda_cual: triaje?.ayudaCual ?? null,
    ayuda_quien: triaje?.ayudaQuien ?? null,
    observaciones: triaje?.observaciones ?? null
  };
}

function aVivienda(vivienda: Vivienda, urbano: AnexoUrbano | null): FilaVivienda {
  return {
    tenencia: vivienda.tenencia,
    arrendador_contacto: vivienda.arrendadorContacto,
    hogares_en_estructura: vivienda.hogaresEnEstructura,
    tipo_vivienda: vivienda.tipoVivienda,
    material_paredes: vivienda.materialParedes,
    material_techo: vivienda.materialTecho,
    afectacion: vivienda.afectacion,
    habitable: vivienda.habitable,
    riesgo_colapso: vivienda.riesgoColapso,
    riesgo_colapso_desc: vivienda.riesgoColapsoDesc,
    donde_duerme: vivienda.dondeDuerme,
    requiere_vivienda: vivienda.requiereVivienda,
    servicios_afectados: vivienda.serviciosAfectados,
    estrato: urbano?.estrato ?? null,
    tipo_unidad: urbano?.tipoUnidad ?? null,
    perdio_medio_vida: urbano?.perdioMedioVida ?? null,
    medio_vida_desc: urbano?.medioVidaDesc ?? null,
    requiere_urbano: urbano?.requiereUrbano ?? []
  };
}

function aProduccion(rural: AnexoRural): FilaProduccion {
  return {
    predio_nombre: rural.predioNombre,
    area_ha: rural.areaHa,
    tenencia_predio: rural.tenenciaPredio,
    tiene_titulo: rural.tieneTitulo,
    via_acceso: rural.viaAcceso,
    cultivos: rural.cultivos,
    cultivos_otro: rural.cultivosOtro,
    area_cultivo_afectada_ha: rural.areaCultivoAfectadaHa,
    perdida_pct: rural.perdidaPct,
    perdida_estimada_cop_minor: rural.perdidaEstimadaCopMinor,
    bovinos_perdidos: rural.bovinosPerdidos,
    porcinos_perdidos: rural.porcinosPerdidos,
    aves_perdidas: rural.avesPerdidas,
    otros_animales: rural.otrosAnimales,
    infra_productiva: rural.infraProductiva,
    requiere_agro: rural.requiereAgro
  };
}
