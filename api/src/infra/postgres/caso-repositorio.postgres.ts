import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  CasoParaSincronizar,
  CasoSincronizado,
  Prioridad,
  ResumenTablero,
  Zona,
  nivelInicialDesde
} from '@raiz/dominio';
import {
  CasoRepositorioPort,
  ErrorRechazo,
  ErrorTransporte,
  Identidad
} from '../../dominio/puertos';
import { PostgresPool } from './pool';

/** Fila del tablero, tal como sale de la vista. */
interface FilaTablero {
  id: string | number;
  codigo: string;
  zona: Zona;
  municipio: string;
  lugar: string | null;
  prioridad: Prioridad | null;
  personas_total: number | null;
  menores: number | null;
  adultos_mayores: number | null;
  estado_verificacion: string;
  afectacion: string | null;
  habitable: boolean | null;
  lat: string | number | null;
  lon: string | number | null;
  origen_dato: string | null;
  nivel_verificacion: string;
  n_fotos: string | number | null;
  remisiones_sin_respuesta: string | number | null;
  fecha_registro: unknown;
}

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

  /**
   * Evento al que se cuelgan los casos que llegan hoy.
   *
   * Constante y no configuracion mientras haya una sola emergencia activa: una
   * variable de entorno mal puesta colgaria casos del evento equivocado sin que nadie
   * lo note. El dia que haya dos a la vez, el cliente lo mandara y esto se cae.
   */
  private static readonly EVENTO_VIGENTE = 'SISMO-2026-08-10';

  constructor(private readonly pool: PostgresPool) {}

  /**
   * Los casos que quien pide alcanza, resumidos para el tablero.
   *
   * Se lee de `v_familias_tablero`, que lleva `security_invoker`: las politicas de la
   * tabla de origen siguen corriendo, de modo que la mesa ve todo y un lider ve lo
   * suyo. No hay ningun `where` de permisos en esta consulta y no debe haberlo.
   *
   * NO SE PIDEN NI NOMBRE NI TELEFONO, aunque la vista los tenga y quien pregunta
   * pueda verlos: esta pantalla cuenta, ubica y prioriza. Traer identidad al navegador
   * por comodidad es repartir datos personales sin que nadie los necesite.
   */
  async listar(identidad: Identidad): Promise<ResumenTablero[]> {
    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const { rows } = await cliente.query<FilaTablero>(
        `select id, codigo, zona, municipio, lugar, prioridad, personas_total,
                menores, adultos_mayores, estado_verificacion, afectacion, habitable,
                lat, lon, origen_dato, nivel_verificacion,
                n_fotos, remisiones_sin_respuesta, fecha_registro
           from v_familias_tablero
          order by fecha_registro desc nulls last, codigo desc`
      );

      return rows.map((f) => ({
        id: String(f.id),
        codigo: f.codigo,
        zona: f.zona,
        municipio: f.municipio,
        lugar: f.lugar,
        prioridad: f.prioridad,
        personasTotal: f.personas_total ?? 0,
        menores: f.menores ?? 0,
        adultosMayores: f.adultos_mayores ?? 0,
        estadoVerificacion: f.estado_verificacion,
        afectacion: f.afectacion,
        habitable: f.habitable,
        // PostgreSQL entrega `numeric` como texto para no perder precision.
        lat: f.lat === null ? null : Number(f.lat),
        lon: f.lon === null ? null : Number(f.lon),
        origenDato: (f.origen_dato as never) ?? null,
        nivelVerificacion: f.nivel_verificacion as never,
        nFotos: Number(f.n_fotos ?? 0),
        remisionesSinRespuesta: Number(f.remisiones_sin_respuesta ?? 0),
        fechaRegistro: f.fecha_registro === null ? null : String(f.fecha_registro).slice(0, 10)
      }));
    });
  }

  async registrar(caso: CasoParaSincronizar, identidad: Identidad): Promise<CasoSincronizado> {
    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const fila = await this.guardarFamilia(cliente, caso);
      await this.guardarVivienda(cliente, fila.id, caso);
      await this.guardarProduccion(cliente, fila.id, caso);

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
        observaciones,
        fallecidos, heridos_leves, heridos_graves, necesidades_otra,
        autoriza_datos_sensibles, autoriza_remision_entidades,
        version_autorizacion, autorizado_en,
        origen_dato, nivel_verificacion, evento_id,
        fuera_del_hogar, requiere_apoyo_evacuar
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::zona_t, $11, $12, $13, $14,
        $15, $16, $17, $18::gps_fuente_t, $19, $20, $21, $22, $23, $24, $25, $26,
        $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
        $48, $49, $50, $51, $52::prioridad_t, $53::necesidad_t[], $54, $55, $56, $57,
        $58, $59, $60, $61,
        $62, $63, $64, $65,
        -- El nivel de verificacion se deriva del origen y NO se acepta del cliente:
        -- un cliente modificado no puede declarar que su caso ya fue verificado por
        -- un ingeniero. Lo que sigue arriba lo sube la mesa, con su nombre.
        $66::origen_dato_t, $67::nivel_verificacion_t,
        -- El evento se resuelve por codigo. Si no llega o no existe, queda nulo y la
        -- mesa lo asigna: es preferible un caso sin evento que un caso colgado del
        -- evento equivocado.
        (select id from eventos where codigo = $68),
        $69, $70
      )
      on conflict (origen_id) do update set
        fecha_registro = excluded.fecha_registro,
        consentimiento = excluded.consentimiento,
        autoriza_datos_sensibles = excluded.autoriza_datos_sensibles,
        autoriza_remision_entidades = excluded.autoriza_remision_entidades,
        version_autorizacion = excluded.version_autorizacion,
        autorizado_en = excluded.autorizado_en,
        vereda = excluded.vereda, corregimiento = excluded.corregimiento,
        barrio = excluded.barrio, comuna = excluded.comuna,
        direccion_ref = excluded.direccion_ref,
        lat = excluded.lat, lon = excluded.lon, gps_fuente = excluded.gps_fuente,
        jefe_nombres = excluded.jefe_nombres, jefe_apellidos = excluded.jefe_apellidos,
        tipo_doc = excluded.tipo_doc, num_doc = excluded.num_doc,
        tel_1 = excluded.tel_1, tel_2 = excluded.tel_2,
        personas_total = excluded.personas_total,
        fuera_del_hogar = excluded.fuera_del_hogar,
        requiere_apoyo_evacuar = excluded.requiere_apoyo_evacuar,
        prioridad = excluded.prioridad,
        necesidades_inmediatas = excluded.necesidades_inmediatas,
        observaciones = excluded.observaciones,
        fallecidos = excluded.fallecidos,
        heridos_leves = excluded.heridos_leves,
        heridos_graves = excluded.heridos_graves,
        necesidades_otra = excluded.necesidades_otra,
        actualizado_en = now()
      returning id, codigo, (xmax = 0) as ya_existia`;

    const valores = [
      caso.origenId, c.fechaRegistro,
      c.registradorNombre, c.registradorOrg, c.registradorTel,
      c.fuenteDato,
      // Sin responder se guarda como no autorizado: la columna no admite nulo y la
      // regla de identidad ya trata cualquier cosa distinta de true como un no.
      c.consentimiento === true,
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
      t?.observaciones ?? null,
      // Fallecidos y heridos, y lo que la familia pidio con sus palabras. Salieron de
      // la primera ficha llenada en terreno el 16 de agosto.
      vul.fallecidos ?? 0, vul.heridosLeves ?? 0, vul.heridosGraves ?? 0,
      t?.necesidadesOtra ?? null,
      // Las autorizaciones viajan como llegan, incluido el nulo: null es «no se
      // pregunto» y no puede convertirse en un no por el camino. La regla que decide
      // que se guarda ya se aplico antes, en el servicio.
      c.autorizaDatosSensibles ?? null, c.autorizaRemisionEntidades ?? null,
      c.versionAutorizacion ?? null, c.autorizadoEn ?? null,
      c.origenDato ?? null, nivelInicialDesde(c.origenDato ?? null),
      CasoRepositorioPostgres.EVENTO_VIGENTE,
      // Quien no esta y quien no puede salir solo. Se anaden al final para no correr
      // los sesenta y ocho parametros anteriores: renumerarlos a mano es la clase de
      // cambio que compila y guarda el telefono en la columna del documento.
      h.fueraDelHogar ?? 0, vul.requiereApoyoEvacuar ?? 0
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
        estrato, tipo_unidad, perdio_medio_vida, medio_vida_desc, requiere_urbano,
        visita_oficial, visita_oficial_entidad, visita_oficial_fecha, visita_oficial_concepto
      ) values (
        $1, true, $2::tenencia_t, $3, $4, $5, $6, $7,
        $8::afectacion_t, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22::date, $23
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
        urb?.perdioMedioVida ?? null, urb?.medioVidaDesc ?? null, urb?.requiereUrbano ?? [],
        // Nulo se conserva como nulo: es «no se pregunto», y aplastarlo a false diria
        // que no ha venido nadie, que es una afirmacion distinta y probablemente falsa.
        v.visitaOficial ?? null, v.visitaOficialEntidad ?? null,
        v.visitaOficialFecha ?? null, v.visitaOficialConcepto ?? null
      ]);
    } catch (e) {
      throw this.traducir(e, caso.origenId);
    }
  }

  /**
   * Guarda el anexo rural: predio, cultivos, animales, infraestructura y maquinaria.
   *
   * POR QUE ESTE METODO NO EXISTIA Y ES UN DEFECTO, NO UNA FUNCION NUEVA
   *
   * La aplicacion captura este bloque completo desde el primer dia y lo manda en cada
   * envio. El servidor lo recibia y lo tiraba: guardaba familia y vivienda, y el anexo
   * rural no se escribia en ninguna parte. En un municipio que vive del cafe y del
   * aguacate, eso es perder justo la mitad del dano — la que no se ve en una foto de
   * la casa y la que sostiene una peticion de reactivacion productiva.
   *
   * Se borra y se reinserta, igual que la vivienda: un reenvio del mismo caso no debe
   * dejar dos predios colgando del mismo hogar.
   */
  private async guardarProduccion(
    cliente: PoolClient,
    familiaId: string,
    caso: CasoParaSincronizar
  ): Promise<void> {
    const r = caso.anexoRural;
    if (!r) return;

    const sql = `
      insert into produccion (
        familia_id, predio_nombre, area_ha, tenencia_predio, tiene_titulo, via_acceso,
        cultivos, cultivos_otro, area_cultivo_afectada_ha, perdida_pct,
        perdida_estimada_cop_minor,
        bovinos_perdidos, porcinos_perdidos, aves_perdidas, otros_animales,
        infra_productiva, infra_productiva_otro,
        requiere_agro, requiere_agro_otro,
        maquinaria_afectada, maquinaria_detalle
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )`;

    try {
      await cliente.query('delete from produccion where familia_id = $1', [familiaId]);
      await cliente.query(sql, [
        familiaId, r.predioNombre, r.areaHa, r.tenenciaPredio, r.tieneTitulo, r.viaAcceso,
        r.cultivos, r.cultivosOtro, r.areaCultivoAfectadaHa, r.perdidaPct,
        r.perdidaEstimadaCopMinor,
        r.bovinosPerdidos, r.porcinosPerdidos, r.avesPerdidas, r.otrosAnimales,
        r.infraProductiva, r.infraProductivaOtro,
        r.requiereAgro, r.requiereAgroOtro,
        r.maquinariaAfectada, r.maquinariaDetalle
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
