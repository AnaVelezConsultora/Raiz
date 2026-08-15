import type { CasoParaSincronizar, CasoSincronizado } from '@raiz/dominio';
import type { Pool, PoolClient } from 'pg';
import {
  CasoRepositorioPort,
  ErrorRechazo,
  ErrorSesion,
  ErrorTransporte,
  type Identidad
} from '../../dominio/puertos';
import {
  casoAFilas,
  type FilaFamilia,
  type FilaProduccion,
  type FilaVivienda
} from './caso-a-fila';
import { conIdentidad } from './con-identidad';

/**
 * Persistencia de casos en PostgreSQL.
 *
 * Unica responsabilidad: cumplir el contrato de {@link CasoRepositorioPort}.
 * No conoce HTTP ni Cognito. La identidad llega ya resuelta; las politicas RLS
 * deciden que filas puede tocar.
 *
 * Idempotencia (HU 1.2.4): ON CONFLICT (origen_id) actualiza la misma fila y
 * conserva el codigo RZ-AAAA-NNNNNN que asigno el servidor en el primer envio.
 */
export class PostgresCasoRepositorio implements CasoRepositorioPort {
  constructor(private readonly pool: Pool) {}

  async registrar(caso: CasoParaSincronizar, identidad: Identidad): Promise<CasoSincronizado> {
    this.validarEntrada(caso);

    try {
      return await conIdentidad(this.pool, identidad, (cliente) =>
        this.escribir(cliente, caso, identidad)
      );
    } catch (error) {
      throw this.clasificar(error);
    }
  }

  private async escribir(
    cliente: PoolClient,
    caso: CasoParaSincronizar,
    identidad: Identidad
  ): Promise<CasoSincronizado> {
    const filas = casoAFilas(caso);
    const familia = await this.upsertFamilia(cliente, filas.familia, identidad.sub);

    if (filas.vivienda) {
      await this.upsertVivienda(cliente, familia.id, filas.vivienda);
    }
    if (filas.produccion) {
      await this.upsertProduccion(cliente, familia.id, filas.produccion);
    }

    return {
      origenId: caso.origenId,
      codigo: familia.codigo,
      yaExistia: familia.yaExistia
    };
  }

  private async upsertFamilia(
    cliente: PoolClient,
    fila: FilaFamilia,
    registradorId: string
  ): Promise<{ id: number; codigo: string; yaExistia: boolean }> {
    // registrador_perfil_id sale de la identidad, nunca del cuerpo.
    // codigo NO se toca en el UPDATE: el consecutivo institucional es inmutable.
    const resultado = await cliente.query<{
      id: string;
      codigo: string;
      ya_existia: boolean;
    }>(
      `INSERT INTO familias (
         origen_id,
         fecha_registro, registrador_nombre, registrador_org, registrador_tel,
         registrador_perfil_id, fuente_dato, consentimiento,
         departamento, municipio, zona, vereda, corregimiento, barrio, comuna,
         direccion_ref, lat, lon, gps_fuente,
         jefe_nombres, jefe_apellidos, tipo_doc, num_doc,
         tel_1, tel_1_whatsapp, tel_2, personas_total,
         h_0_5, m_0_5, h_6_11, m_6_11, h_12_17, m_12_17, h_18_59, m_18_59, h_60, m_60,
         gestantes, lactantes, discapacidad_n, discapacidad_tipo,
         enf_cronica_n, requiere_medicamento, medicamento_cual, etnia, victima_conflicto,
         afiliacion, afiliacion_cual,
         afiliada_federacion, aplica_convenio, convenio_linea, convenio_obs,
         prioridad, necesidades_inmediatas, ya_recibio_ayuda, ayuda_cual, ayuda_quien,
         observaciones
       ) VALUES (
         $1::uuid,
         $2::date, $3, $4, $5,
         $6::uuid, $7, $8,
         $9, $10, $11::zona_t, $12, $13, $14, $15,
         $16, $17, $18, $19,
         $20, $21, $22, $23,
         $24, $25, $26, $27,
         $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
         $38, $39, $40, $41,
         $42, $43, $44, $45, $46,
         $47, $48,
         $49, $50, $51, $52,
         $53::prioridad_t, $54, $55, $56, $57,
         $58
       )
       ON CONFLICT (origen_id) DO UPDATE SET
         fecha_registro          = EXCLUDED.fecha_registro,
         registrador_nombre      = EXCLUDED.registrador_nombre,
         registrador_org         = EXCLUDED.registrador_org,
         registrador_tel         = EXCLUDED.registrador_tel,
         fuente_dato             = EXCLUDED.fuente_dato,
         consentimiento          = EXCLUDED.consentimiento,
         departamento            = EXCLUDED.departamento,
         municipio               = EXCLUDED.municipio,
         zona                    = EXCLUDED.zona,
         vereda                  = EXCLUDED.vereda,
         corregimiento           = EXCLUDED.corregimiento,
         barrio                  = EXCLUDED.barrio,
         comuna                  = EXCLUDED.comuna,
         direccion_ref           = EXCLUDED.direccion_ref,
         lat                     = EXCLUDED.lat,
         lon                     = EXCLUDED.lon,
         gps_fuente              = EXCLUDED.gps_fuente,
         jefe_nombres            = EXCLUDED.jefe_nombres,
         jefe_apellidos          = EXCLUDED.jefe_apellidos,
         tipo_doc                = EXCLUDED.tipo_doc,
         num_doc                 = EXCLUDED.num_doc,
         tel_1                   = EXCLUDED.tel_1,
         tel_1_whatsapp          = EXCLUDED.tel_1_whatsapp,
         tel_2                   = EXCLUDED.tel_2,
         personas_total          = EXCLUDED.personas_total,
         h_0_5                   = EXCLUDED.h_0_5,
         m_0_5                   = EXCLUDED.m_0_5,
         h_6_11                  = EXCLUDED.h_6_11,
         m_6_11                  = EXCLUDED.m_6_11,
         h_12_17                 = EXCLUDED.h_12_17,
         m_12_17                 = EXCLUDED.m_12_17,
         h_18_59                 = EXCLUDED.h_18_59,
         m_18_59                 = EXCLUDED.m_18_59,
         h_60                    = EXCLUDED.h_60,
         m_60                    = EXCLUDED.m_60,
         gestantes               = EXCLUDED.gestantes,
         lactantes               = EXCLUDED.lactantes,
         discapacidad_n          = EXCLUDED.discapacidad_n,
         discapacidad_tipo       = EXCLUDED.discapacidad_tipo,
         enf_cronica_n           = EXCLUDED.enf_cronica_n,
         requiere_medicamento    = EXCLUDED.requiere_medicamento,
         medicamento_cual        = EXCLUDED.medicamento_cual,
         etnia                   = EXCLUDED.etnia,
         victima_conflicto       = EXCLUDED.victima_conflicto,
         afiliacion              = EXCLUDED.afiliacion,
         afiliacion_cual         = EXCLUDED.afiliacion_cual,
         afiliada_federacion     = EXCLUDED.afiliada_federacion,
         aplica_convenio         = EXCLUDED.aplica_convenio,
         convenio_linea          = EXCLUDED.convenio_linea,
         convenio_obs            = EXCLUDED.convenio_obs,
         prioridad               = EXCLUDED.prioridad,
         necesidades_inmediatas  = EXCLUDED.necesidades_inmediatas,
         ya_recibio_ayuda        = EXCLUDED.ya_recibio_ayuda,
         ayuda_cual              = EXCLUDED.ayuda_cual,
         ayuda_quien             = EXCLUDED.ayuda_quien,
         observaciones           = EXCLUDED.observaciones,
         actualizado_en          = now()
       RETURNING id, codigo, (xmax::text::bigint > 0) AS ya_existia`,
      [
        fila.origen_id,
        fila.fecha_registro,
        fila.registrador_nombre,
        fila.registrador_org,
        fila.registrador_tel,
        registradorId,
        fila.fuente_dato,
        fila.consentimiento,
        fila.departamento,
        fila.municipio,
        fila.zona,
        fila.vereda,
        fila.corregimiento,
        fila.barrio,
        fila.comuna,
        fila.direccion_ref,
        fila.lat,
        fila.lon,
        fila.gps_fuente,
        fila.jefe_nombres,
        fila.jefe_apellidos,
        fila.tipo_doc,
        fila.num_doc,
        fila.tel_1,
        fila.tel_1_whatsapp,
        fila.tel_2,
        fila.personas_total,
        fila.h_0_5,
        fila.m_0_5,
        fila.h_6_11,
        fila.m_6_11,
        fila.h_12_17,
        fila.m_12_17,
        fila.h_18_59,
        fila.m_18_59,
        fila.h_60,
        fila.m_60,
        fila.gestantes,
        fila.lactantes,
        fila.discapacidad_n,
        fila.discapacidad_tipo,
        fila.enf_cronica_n,
        fila.requiere_medicamento,
        fila.medicamento_cual,
        fila.etnia,
        fila.victima_conflicto,
        fila.afiliacion,
        fila.afiliacion_cual,
        fila.afiliada_federacion,
        fila.aplica_convenio,
        fila.convenio_linea,
        fila.convenio_obs,
        fila.prioridad,
        fila.necesidades_inmediatas,
        fila.ya_recibio_ayuda,
        fila.ayuda_cual,
        fila.ayuda_quien,
        fila.observaciones
      ]
    );

    const filaResultado = resultado.rows[0];
    if (!filaResultado) {
      // RLS filtro el UPDATE del conflicto: alguien mas posee ese origen_id.
      throw new ErrorRechazo(
        'No se pudo registrar el caso. Puede pertenecer a otro voluntario.',
        ['origenId']
      );
    }

    return {
      id: Number(filaResultado.id),
      codigo: filaResultado.codigo,
      yaExistia: filaResultado.ya_existia
    };
  }

  private async upsertVivienda(
    cliente: PoolClient,
    familiaId: number,
    fila: FilaVivienda
  ): Promise<void> {
    const existentes = await cliente.query<{ id: string }>(
      `SELECT id FROM viviendas WHERE familia_id = $1 AND es_principal = true LIMIT 1`,
      [familiaId]
    );

    const valores = [
      familiaId,
      fila.tenencia,
      fila.arrendador_contacto,
      fila.hogares_en_estructura,
      fila.tipo_vivienda,
      fila.material_paredes,
      fila.material_techo,
      fila.afectacion,
      fila.habitable,
      fila.riesgo_colapso,
      fila.riesgo_colapso_desc,
      fila.donde_duerme,
      fila.requiere_vivienda,
      fila.servicios_afectados,
      fila.estrato,
      fila.tipo_unidad,
      fila.perdio_medio_vida,
      fila.medio_vida_desc,
      fila.requiere_urbano
    ];

    if (existentes.rows[0]) {
      await cliente.query(
        `UPDATE viviendas SET
           tenencia = $2::tenencia_t,
           arrendador_contacto = $3,
           hogares_en_estructura = $4,
           tipo_vivienda = $5,
           material_paredes = $6,
           material_techo = $7,
           afectacion = $8::afectacion_t,
           habitable = $9,
           riesgo_colapso = $10,
           riesgo_colapso_desc = $11,
           donde_duerme = $12,
           requiere_vivienda = $13,
           servicios_afectados = $14,
           estrato = $15,
           tipo_unidad = $16,
           perdio_medio_vida = $17,
           medio_vida_desc = $18,
           requiere_urbano = $19
         WHERE id = $20`,
        [...valores.slice(1), existentes.rows[0].id]
      );
      return;
    }

    await cliente.query(
      `INSERT INTO viviendas (
         familia_id, es_principal,
         tenencia, arrendador_contacto, hogares_en_estructura,
         tipo_vivienda, material_paredes, material_techo,
         afectacion, habitable, riesgo_colapso, riesgo_colapso_desc, donde_duerme,
         requiere_vivienda, servicios_afectados,
         estrato, tipo_unidad, perdio_medio_vida, medio_vida_desc, requiere_urbano
       ) VALUES (
         $1, true,
         $2::tenencia_t, $3, $4,
         $5, $6, $7,
         $8::afectacion_t, $9, $10, $11, $12,
         $13, $14,
         $15, $16, $17, $18, $19
       )`,
      valores
    );
  }

  private async upsertProduccion(
    cliente: PoolClient,
    familiaId: number,
    fila: FilaProduccion
  ): Promise<void> {
    const existentes = await cliente.query<{ id: string }>(
      `SELECT id FROM produccion WHERE familia_id = $1 LIMIT 1`,
      [familiaId]
    );

    const valores = [
      familiaId,
      fila.predio_nombre,
      fila.area_ha,
      fila.tenencia_predio,
      fila.tiene_titulo,
      fila.via_acceso,
      fila.cultivos,
      fila.cultivos_otro,
      fila.area_cultivo_afectada_ha,
      fila.perdida_pct,
      fila.perdida_estimada_cop_minor,
      fila.bovinos_perdidos,
      fila.porcinos_perdidos,
      fila.aves_perdidas,
      fila.otros_animales,
      fila.infra_productiva,
      fila.requiere_agro
    ];

    if (existentes.rows[0]) {
      await cliente.query(
        `UPDATE produccion SET
           predio_nombre = $2,
           area_ha = $3,
           tenencia_predio = $4,
           tiene_titulo = $5,
           via_acceso = $6,
           cultivos = $7,
           cultivos_otro = $8,
           area_cultivo_afectada_ha = $9,
           perdida_pct = $10,
           perdida_estimada_cop_minor = $11,
           bovinos_perdidos = $12,
           porcinos_perdidos = $13,
           aves_perdidas = $14,
           otros_animales = $15,
           infra_productiva = $16,
           requiere_agro = $17
         WHERE id = $18`,
        [...valores.slice(1), existentes.rows[0].id]
      );
      return;
    }

    await cliente.query(
      `INSERT INTO produccion (
         familia_id, predio_nombre, area_ha, tenencia_predio, tiene_titulo, via_acceso,
         cultivos, cultivos_otro, area_cultivo_afectada_ha, perdida_pct,
         perdida_estimada_cop_minor, bovinos_perdidos, porcinos_perdidos, aves_perdidas,
         otros_animales, infra_productiva, requiere_agro
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17
       )`,
      valores
    );
  }

  private validarEntrada(caso: CasoParaSincronizar): void {
    const detalles: string[] = [];

    if (!caso.origenId?.trim()) detalles.push('origenId');
    if (!caso.control?.registradorNombre?.trim()) detalles.push('control.registradorNombre');
    if (!caso.control?.fuenteDato) detalles.push('control.fuenteDato');
    if (!caso.ubicacion?.departamento?.trim()) detalles.push('ubicacion.departamento');
    if (!caso.ubicacion?.municipio?.trim()) detalles.push('ubicacion.municipio');
    if (!caso.ubicacion?.zona) detalles.push('ubicacion.zona');
    if (!caso.hogar?.tel1?.trim()) detalles.push('hogar.tel1');
    if (!caso.hogar?.personasTotal || caso.hogar.personasTotal < 1) {
      detalles.push('hogar.personasTotal');
    }

    if (detalles.length > 0) {
      throw new ErrorRechazo('El caso no tiene los datos minimos para registrarse.', detalles);
    }
  }

  private clasificar(error: unknown): Error {
    if (
      error instanceof ErrorSesion ||
      error instanceof ErrorRechazo ||
      error instanceof ErrorTransporte
    ) {
      return error;
    }

    if (!isPgError(error)) {
      return new ErrorTransporte(
        error instanceof Error ? error.message : 'Error desconocido al registrar el caso.'
      );
    }

    // 42501 insufficient_privilege; 28000 invalid_authorization — sesion / RLS.
    if (error.code === '42501' || error.code === '28000') {
      return new ErrorSesion('La sesion no tiene permiso para registrar este caso.');
    }

    // 23503 FK: perfil inexistente o identidad no reflejada en la base.
    if (error.code === '23503') {
      return new ErrorSesion(
        'Su perfil no esta disponible en la base. Confirme la cuenta o pida acceso.'
      );
    }

    // 22xxx / 23xxx (salvo unique de origen, que el UPSERT resuelve): dato invalido.
    if (error.code.startsWith('22') || error.code.startsWith('23')) {
      return new ErrorRechazo(error.message);
    }

    return new ErrorTransporte(error.message);
  }
}

interface PgError {
  code: string;
  message: string;
}

function isPgError(error: unknown): error is PgError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}
