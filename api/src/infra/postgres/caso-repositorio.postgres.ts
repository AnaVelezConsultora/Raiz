import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CasoParaSincronizar, CasoSincronizado } from '@raiz/dominio';
import {
  CasoRepositorioPort,
  ErrorRechazo,
  ErrorTransporte,
  Identidad
} from '../../dominio/puertos';
import { casoAFilas, type FilaProduccion } from './caso-a-fila';
import { PostgresPool } from './pool';

/** Fila devuelta al registrar. */
interface FilaRegistro {
  id: string;
  codigo: string;
  ya_existia: boolean;
}

/**
 * Persistencia de casos en PostgreSQL.
 *
 * IDEMPOTENCIA POR `origen_id`. El identificador lo genera el dispositivo antes de
 * enviar. Si el envio llega al servidor pero la respuesta se pierde por un corte de
 * senal —lo normal en zona veredal— el reintento cae en el mismo `origen_id`,
 * actualiza la misma fila y devuelve el mismo codigo. Un duplicado silencioso en un
 * censo es peor que un fallo visible: infla el total, y el total es la palanca.
 *
 * QUIEN FIRMA EL REGISTRO. `registrador_perfil_id` NO se toma del cuerpo del mensaje:
 * lo pone la base con `default auth.uid()`, que a su vez lee la identidad fijada en la
 * transaccion. Un cliente modificado no puede registrar un caso a nombre de otro
 * voluntario aunque lo intente.
 *
 * @version 0.1.0
 */
@Injectable()
export class CasoRepositorioPostgres implements CasoRepositorioPort {
  private readonly log = new Logger(CasoRepositorioPostgres.name);

  constructor(private readonly pool: PostgresPool) {}

  async registrar(caso: CasoParaSincronizar, identidad: Identidad): Promise<CasoSincronizado> {
    this.validarEntrada(caso);

    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const fila = await this.guardarFamilia(cliente, caso);
      await this.guardarVivienda(cliente, fila.id, caso);
      await this.guardarProduccion(cliente, fila.id, caso);

      return { origenId: caso.origenId, codigo: fila.codigo, yaExistia: fila.ya_existia };
    });
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

  private async guardarFamilia(
    cliente: PoolClient,
    caso: CasoParaSincronizar
  ): Promise<FilaRegistro> {
    const c = caso.control;
    const u = caso.ubicacion;
    const h = caso.hogar;
    const comp = h.composicion;
    const vul = h.vulnerabilidad;
    const t = caso.triaje;
    const cv = caso.anexoConvenio;

    // `xmax = 0` distingue insercion de actualizacion en un upsert: es cero cuando la
    // fila es nueva. Es lo que permite decirle al dispositivo si su reintento creo el
    // caso o solo lo actualizo.
    const sql = `
      insert into familias (
        origen_id, fecha_registro,
        registrador_nombre, registrador_org, registrador_tel,
        fuente_dato, consentimiento,
        departamento, municipio, zona, vereda, corregimiento, barrio, comuna,
        direccion_ref, lat, lon, gps_fuente,
        jefe_nombres, jefe_apellidos, tipo_doc, num_doc,
        tel_1, tel_1_whatsapp, tel_2, personas_total,
        h_0_5, m_0_5, h_6_11, m_6_11, h_12_17, m_12_17,
        h_18_59, m_18_59, h_60, m_60,
        gestantes, lactantes, discapacidad_n, discapacidad_tipo, enf_cronica_n,
        requiere_medicamento, medicamento_cual, etnia, victima_conflicto,
        afiliacion, afiliacion_cual,
        afiliada_federacion, aplica_convenio, convenio_linea, convenio_obs,
        prioridad, necesidades_inmediatas, ya_recibio_ayuda, ayuda_cual, ayuda_quien,
        observaciones
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::zona_t, $11, $12, $13, $14,
        $15, $16, $17, $18::gps_fuente_t, $19, $20, $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
        $48, $49, $50, $51, $52::prioridad_t, $53::necesidad_t[], $54, $55, $56, $57
      )
      on conflict (origen_id) do update set
        fecha_registro = excluded.fecha_registro,
        registrador_nombre = excluded.registrador_nombre,
        registrador_org = excluded.registrador_org,
        registrador_tel = excluded.registrador_tel,
        fuente_dato = excluded.fuente_dato,
        consentimiento = excluded.consentimiento,
        departamento = excluded.departamento,
        municipio = excluded.municipio,
        zona = excluded.zona,
        vereda = excluded.vereda, corregimiento = excluded.corregimiento,
        barrio = excluded.barrio, comuna = excluded.comuna,
        direccion_ref = excluded.direccion_ref,
        lat = excluded.lat, lon = excluded.lon, gps_fuente = excluded.gps_fuente,
        jefe_nombres = excluded.jefe_nombres, jefe_apellidos = excluded.jefe_apellidos,
        tipo_doc = excluded.tipo_doc, num_doc = excluded.num_doc,
        tel_1 = excluded.tel_1, tel_1_whatsapp = excluded.tel_1_whatsapp, tel_2 = excluded.tel_2,
        personas_total = excluded.personas_total,
        h_0_5 = excluded.h_0_5, m_0_5 = excluded.m_0_5,
        h_6_11 = excluded.h_6_11, m_6_11 = excluded.m_6_11,
        h_12_17 = excluded.h_12_17, m_12_17 = excluded.m_12_17,
        h_18_59 = excluded.h_18_59, m_18_59 = excluded.m_18_59,
        h_60 = excluded.h_60, m_60 = excluded.m_60,
        gestantes = excluded.gestantes, lactantes = excluded.lactantes,
        discapacidad_n = excluded.discapacidad_n, discapacidad_tipo = excluded.discapacidad_tipo,
        enf_cronica_n = excluded.enf_cronica_n,
        requiere_medicamento = excluded.requiere_medicamento,
        medicamento_cual = excluded.medicamento_cual,
        etnia = excluded.etnia, victima_conflicto = excluded.victima_conflicto,
        afiliacion = excluded.afiliacion, afiliacion_cual = excluded.afiliacion_cual,
        afiliada_federacion = excluded.afiliada_federacion,
        aplica_convenio = excluded.aplica_convenio,
        convenio_linea = excluded.convenio_linea, convenio_obs = excluded.convenio_obs,
        prioridad = excluded.prioridad,
        necesidades_inmediatas = excluded.necesidades_inmediatas,
        ya_recibio_ayuda = excluded.ya_recibio_ayuda,
        ayuda_cual = excluded.ayuda_cual, ayuda_quien = excluded.ayuda_quien,
        observaciones = excluded.observaciones,
        actualizado_en = now()
      returning id, codigo, (xmax = 0) as ya_existia`;

    const valores = [
      caso.origenId, c.fechaRegistro,
      c.registradorNombre, c.registradorOrg, c.registradorTel,
      c.fuenteDato, c.consentimiento,
      u.departamento, u.municipio, u.zona, u.vereda, u.corregimiento, u.barrio, u.comuna,
      u.direccionRef, u.lat, u.lon, u.gpsFuente,
      h.jefeNombres, h.jefeApellidos, h.tipoDoc, h.numDoc,
      h.tel1, h.tel1Whatsapp, h.tel2, h.personasTotal,
      comp.h0a5, comp.m0a5, comp.h6a11, comp.m6a11, comp.h12a17, comp.m12a17,
      comp.h18a59, comp.m18a59, comp.h60mas, comp.m60mas,
      vul.gestantes, vul.lactantes, vul.discapacidadN, vul.discapacidadTipo, vul.enfCronicaN,
      vul.requiereMedicamento, vul.medicamentoCual, vul.etnia, vul.victimaConflicto,
      h.afiliacion, h.afiliacionCual,
      cv?.afiliadaFederacion ?? null, cv?.aplicaConvenio ?? false,
      cv?.convenioLinea ?? [], cv?.convenioObs ?? null,
      t?.prioridad ?? 'p3', t?.necesidadesInmediatas ?? [],
      t?.yaRecibioAyuda ?? null, t?.ayudaCual ?? null, t?.ayudaQuien ?? null,
      t?.observaciones ?? null
    ];

    try {
      const r = await cliente.query<FilaRegistro>(sql, valores);
      const fila = r.rows[0];
      if (!fila) {
        throw new ErrorRechazo(
          'No se pudo registrar el caso. Puede pertenecer a otro voluntario.',
          ['origenId']
        );
      }
      // `ya_existia` viene invertido: xmax = 0 significa fila nueva.
      return { ...fila, ya_existia: !fila.ya_existia };
    } catch (e) {
      throw this.traducir(e, caso.origenId);
    }
  }

  private async guardarVivienda(
    cliente: PoolClient,
    familiaId: string,
    caso: CasoParaSincronizar
  ): Promise<void> {
    const v = caso.vivienda;
    if (!v) return;

    const sql = `
      insert into viviendas (
        familia_id, es_principal, tenencia, arrendador_contacto, hogares_en_estructura,
        tipo_vivienda, material_paredes, material_techo,
        afectacion, habitable, riesgo_colapso, riesgo_colapso_desc,
        donde_duerme, requiere_vivienda, servicios_afectados,
        estrato, tipo_unidad, perdio_medio_vida, medio_vida_desc, requiere_urbano
      ) values (
        $1, true, $2::tenencia_t, $3, $4, $5, $6, $7,
        $8::afectacion_t, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )`;

    const urb = caso.anexoUrbano;
    try {
      // Se reemplaza la principal en lugar de acumular: un reenvio del mismo caso no
      // debe dejar dos viviendas principales colgando del mismo hogar.
      await cliente.query('delete from viviendas where familia_id = $1 and es_principal', [
        familiaId
      ]);
      await cliente.query(sql, [
        familiaId, v.tenencia, v.arrendadorContacto, v.hogaresEnEstructura,
        v.tipoVivienda, v.materialParedes, v.materialTecho,
        v.afectacion, v.habitable, v.riesgoColapso, v.riesgoColapsoDesc,
        v.dondeDuerme, v.requiereVivienda, v.serviciosAfectados,
        urb?.estrato ?? null, urb?.tipoUnidad ?? null,
        urb?.perdioMedioVida ?? null, urb?.medioVidaDesc ?? null, urb?.requiereUrbano ?? []
      ]);
    } catch (e) {
      throw this.traducir(e, caso.origenId);
    }
  }

  private async guardarProduccion(
    cliente: PoolClient,
    familiaId: string,
    caso: CasoParaSincronizar
  ): Promise<void> {
    const { produccion } = casoAFilas(caso);
    if (!produccion) return;

    try {
      const existentes = await cliente.query<{ id: string }>(
        `select id from produccion where familia_id = $1 limit 1`,
        [familiaId]
      );

      const valores = this.valoresProduccion(familiaId, produccion);

      if (existentes.rows[0]) {
        await cliente.query(
          `update produccion set
             predio_nombre = $2, area_ha = $3, tenencia_predio = $4, tiene_titulo = $5,
             via_acceso = $6, cultivos = $7, cultivos_otro = $8,
             area_cultivo_afectada_ha = $9, perdida_pct = $10,
             perdida_estimada_cop_minor = $11, bovinos_perdidos = $12,
             porcinos_perdidos = $13, aves_perdidas = $14, otros_animales = $15,
             infra_productiva = $16, requiere_agro = $17
           where id = $18`,
          [...valores.slice(1), existentes.rows[0].id]
        );
        return;
      }

      await cliente.query(
        `insert into produccion (
           familia_id, predio_nombre, area_ha, tenencia_predio, tiene_titulo, via_acceso,
           cultivos, cultivos_otro, area_cultivo_afectada_ha, perdida_pct,
           perdida_estimada_cop_minor, bovinos_perdidos, porcinos_perdidos, aves_perdidas,
           otros_animales, infra_productiva, requiere_agro
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        valores
      );
    } catch (e) {
      throw this.traducir(e, caso.origenId);
    }
  }

  private valoresProduccion(familiaId: string, fila: FilaProduccion): unknown[] {
    return [
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
  }

  /**
   * Traduce el error de PostgreSQL a la taxonomia del ADR 003.
   *
   * La distincion importa porque el cliente hace cosas distintas: un rechazo saca el
   * caso de la cola para revision humana; un error de transporte lo deja en la cola
   * para reintentar. Confundirlos pierde casos o repite envios eternamente.
   */
  private traducir(error: unknown, origenId: string): Error {
    if (error instanceof ErrorRechazo || error instanceof ErrorTransporte) {
      return error;
    }

    const codigo = (error as { code?: string }).code;
    const detalle = error instanceof Error ? error.message : 'desconocido';

    // 23xxx: violacion de integridad. 22xxx: dato invalido. 42501: sin permiso.
    // Todos son problemas del dato o del permiso: reintentar no cambia nada.
    if (codigo && (codigo.startsWith('23') || codigo.startsWith('22') || codigo === '42501')) {
      this.log.warn(`Caso ${origenId} rechazado (${codigo}): ${detalle}`);
      return new ErrorRechazo('El caso no cumple las reglas de la base de datos.', [detalle]);
    }

    this.log.error(`Fallo temporal registrando ${origenId}: ${detalle}`);
    return new ErrorTransporte();
  }
}
