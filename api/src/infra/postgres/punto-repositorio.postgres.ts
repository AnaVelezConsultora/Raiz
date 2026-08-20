import { Injectable, Logger } from '@nestjs/common';
import {
  EstadoServicio,
  NivelVerificacion,
  OrigenDato,
  PuntoEnTablero,
  PuntoServicio,
  TipoPunto,
  Zona,
  nivelInicialDesde
} from '@raiz/dominio';
import {
  ErrorTransporte,
  Identidad,
  PuntoRegistrado,
  PuntoRepositorioPort
} from '../../dominio/puertos';
import { PostgresPool } from './pool';

/** Fila de la vista del tablero de puntos. */
interface FilaPunto {
  id: string | number;
  codigo: string;
  tipo: TipoPunto;
  nombre: string;
  municipio: string;
  zona: Zona;
  vereda: string | null;
  direccion_ref: string | null;
  lat: string | number | null;
  lon: string | number | null;
  estado_servicio: EstadoServicio;
  descripcion_afectacion: string | null;
  requiere: string | null;
  hogares_estimados: number | null;
  hogares_registrados: string | number;
  veredas_servidas: string[] | null;
  origen_dato: string | null;
  nivel_verificacion: string;
  registrador_nombre: string;
  fecha_registro: unknown;
}

interface FilaRegistroPunto {
  codigo: string;
  ya_existia: boolean;
}

/**
 * Persistencia de puntos de servicio en PostgreSQL.
 *
 * Misma idempotencia por `origen_id` que los casos y por la misma razon: un punto se
 * registra donde no hay senal, y el reintento no puede producir dos veces el mismo
 * tubo roto. Un acueducto duplicado no infla un total como lo hace una familia
 * duplicada — es peor: parece que hay dos obras por hacer y desordena la priorizacion.
 *
 * @version 0.1.0
 */
@Injectable()
export class PuntoRepositorioPostgres implements PuntoRepositorioPort {
  private readonly log = new Logger(PuntoRepositorioPostgres.name);

  /** El mismo evento vigente de los casos. Ver CasoRepositorioPostgres. */
  private static readonly EVENTO_VIGENTE = 'SISMO-2026-08-10';

  constructor(private readonly pool: PostgresPool) {}

  /**
   * Los puntos con las dos cifras de hogares ya resueltas.
   *
   * `hogares_registrados` lo calcula la vista contra el censo en cada consulta y no se
   * guarda. Guardarlo obligaria a recalcularlo cada vez que entra una familia nueva, y
   * el dia que ese recalculo fallara el numero quedaria viejo sin que nadie lo notara.
   * Son unas decenas de puntos: el costo de calcularlo al vuelo es irrelevante frente
   * al riesgo de que mienta.
   */
  async listar(identidad: Identidad): Promise<PuntoEnTablero[]> {
    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const { rows } = await cliente.query<FilaPunto>(
        `select id, codigo, tipo, nombre, municipio, zona, vereda, direccion_ref,
                lat, lon, estado_servicio, descripcion_afectacion, requiere,
                hogares_estimados, hogares_registrados, veredas_servidas,
                origen_dato, nivel_verificacion, registrador_nombre, fecha_registro
           from v_puntos_tablero
          order by hogares_registrados desc, hogares_estimados desc nulls last, codigo`
      );

      return rows.map((f) => this.aPuntoDeTablero(f));
    });
  }

  async registrar(punto: PuntoServicio, identidad: Identidad): Promise<PuntoRegistrado> {
    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const u = punto.ubicacion;

      // El nivel de verificacion lo DERIVA el servidor del origen declarado, igual que
      // en los casos. Si viniera del cliente, cualquiera podria marcar como verificado
      // por un ingeniero algo que le contaron por telefono.
      const nivel = nivelInicialDesde(punto.origenDato ?? null);

      const sql = `
        insert into puntos_servicio (
          origen_id, evento_id, tipo, nombre,
          departamento, municipio, zona, vereda, direccion_ref, lat, lon,
          estado_servicio, descripcion_afectacion, requiere,
          hogares_estimados, veredas_servidas,
          origen_dato, nivel_verificacion,
          registrador_nombre, fecha_registro
        ) values (
          $1, (select id from eventos where codigo = $2), $3, $4,
          $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14,
          $15, $16,
          $17, $18,
          $19, coalesce($20::date, current_date)
        )
        on conflict (origen_id) do update set
          tipo = excluded.tipo,
          nombre = excluded.nombre,
          vereda = excluded.vereda,
          direccion_ref = excluded.direccion_ref,
          lat = excluded.lat,
          lon = excluded.lon,
          estado_servicio = excluded.estado_servicio,
          descripcion_afectacion = excluded.descripcion_afectacion,
          requiere = excluded.requiere,
          hogares_estimados = excluded.hogares_estimados,
          veredas_servidas = excluded.veredas_servidas,
          origen_dato = excluded.origen_dato,
          nivel_verificacion = excluded.nivel_verificacion
        returning codigo, (xmax = 0) as ya_existia`;

      try {
        const { rows } = await cliente.query<FilaRegistroPunto>(sql, [
          punto.id,
          PuntoRepositorioPostgres.EVENTO_VIGENTE,
          punto.tipo,
          punto.nombre,
          u.departamento,
          u.municipio,
          u.zona,
          u.vereda,
          u.direccionRef,
          u.lat,
          u.lon,
          punto.estadoServicio,
          punto.descripcionAfectacion,
          punto.requiere,
          punto.hogaresEstimados,
          punto.veredasServidas ?? [],
          punto.origenDato,
          nivel,
          punto.registradorNombre,
          punto.fechaRegistro
        ]);

        const fila = rows[0];
        // `xmax = 0` es cierto cuando la fila es NUEVA. El nombre de la columna quedo
        // invertido en el SQL heredado de los casos; se corrige aqui, en un solo sitio.
        return { id: punto.id, codigo: fila.codigo, yaExistia: !fila.ya_existia };
      } catch (error) {
        this.log.error(`No se pudo registrar el punto ${punto.nombre}`, error as Error);
        throw new ErrorTransporte('No se pudo guardar el punto de servicio.');
      }
    });
  }

  private aPuntoDeTablero(f: FilaPunto): PuntoEnTablero {
    return {
      id: Number(f.id),
      codigo: f.codigo,
      tipo: f.tipo,
      nombre: f.nombre,
      municipio: f.municipio,
      zona: f.zona,
      vereda: f.vereda,
      direccionRef: f.direccion_ref,
      // PostgreSQL entrega los numericos como texto para no perder precision.
      lat: f.lat === null ? null : Number(f.lat),
      lon: f.lon === null ? null : Number(f.lon),
      estadoServicio: f.estado_servicio,
      descripcionAfectacion: f.descripcion_afectacion,
      requiere: f.requiere,
      hogaresEstimados: f.hogares_estimados === null ? null : Number(f.hogares_estimados),
      hogaresRegistrados: Number(f.hogares_registrados ?? 0),
      veredasServidas: f.veredas_servidas ?? [],
      origenDato: (f.origen_dato as OrigenDato | null) ?? null,
      nivelVerificacion: f.nivel_verificacion as NivelVerificacion,
      registradorNombre: f.registrador_nombre,
      fechaRegistro: String(f.fecha_registro).slice(0, 10)
    };
  }
}
