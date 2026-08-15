import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { CasoParaSincronizar, CasoSincronizado } from '@raiz/dominio';
import {
  CasoRepositorioPort,
  ErrorRechazo,
  ErrorTransporte,
  Identidad
} from '../../dominio/puertos';
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
    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const fila = await this.guardarFamilia(cliente, caso);
      await this.guardarVivienda(cliente, fila.id, caso);

      return { origenId: caso.origenId, codigo: fila.codigo, yaExistia: fila.ya_existia };
    });
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
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
        $48, $49, $50, $51, $52::prioridad_t, $53, $54, $55, $56, $57
      )
      on conflict (origen_id) do update set
        fecha_registro = excluded.fecha_registro,
        consentimiento = excluded.consentimiento,
        vereda = excluded.vereda, corregimiento = excluded.corregimiento,
        barrio = excluded.barrio, comuna = excluded.comuna,
        direccion_ref = excluded.direccion_ref,
        lat = excluded.lat, lon = excluded.lon, gps_fuente = excluded.gps_fuente,
        jefe_nombres = excluded.jefe_nombres, jefe_apellidos = excluded.jefe_apellidos,
        tipo_doc = excluded.tipo_doc, num_doc = excluded.num_doc,
        tel_1 = excluded.tel_1, tel_2 = excluded.tel_2,
        personas_total = excluded.personas_total,
        prioridad = excluded.prioridad,
        necesidades_inmediatas = excluded.necesidades_inmediatas,
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
      // `ya_existia` viene invertido: xmax = 0 significa fila nueva.
      const fila = r.rows[0];
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

  /**
   * Traduce el error de PostgreSQL a la taxonomia del ADR 003.
   *
   * La distincion importa porque el cliente hace cosas distintas: un rechazo saca el
   * caso de la cola para revision humana; un error de transporte lo deja en la cola
   * para reintentar. Confundirlos pierde casos o repite envios eternamente.
   */
  private traducir(error: unknown, origenId: string): Error {
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
