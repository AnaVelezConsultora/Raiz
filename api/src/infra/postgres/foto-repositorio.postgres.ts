import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  CasoDeLaFoto,
  ErrorRechazo,
  ErrorTransporte,
  FotoParaAutorizar,
  FotoRegistrada,
  FotoRepositorioPort,
  Identidad
} from '../../dominio/puertos';
import { PostgresPool } from './pool';

/** Fila tal como vuelve de la base. */
interface FilaFoto {
  origen_id: string;
  url: string;
  bytes: number | null;
  tipo_mime: string | null;
  suma_sha256: string | null;
  partes_prefijo: string | null;
  tamano_bloque: number | null;
  confirmada: boolean;
}

/**
 * Persistencia de fotografias en PostgreSQL.
 *
 * TODO pasa por `comoUsuario`, asi que las politicas de acceso por fila corren en cada
 * consulta. La consecuencia practica importa: `fotos` hereda el permiso de `familias`,
 * de modo que un lider no puede colgarle una imagen al caso de otro voluntario ni
 * consultar las de nadie mas, aunque conozca el identificador. La regla no esta escrita
 * en este archivo — esta en el esquema, y por eso sigue valiendo si alguien escribe
 * manana otra ruta y se olvida de comprobarlo.
 *
 * SIN AUTORIZACION DE LA FAMILIA NO SE EMITE PERMISO DE SUBIDA. La comprobacion esta
 * aqui, en el borde, y no en la interfaz: la fotografia de una vivienda va asociada a
 * un hogar identificado, asi que autorizar la subida es tratamiento de dato personal.
 * Un boton escondido en la pantalla no es un control; esto si.
 *
 * @version 0.1.0
 */
@Injectable()
export class FotoRepositorioPostgres implements FotoRepositorioPort {
  private readonly log = new Logger(FotoRepositorioPostgres.name);

  constructor(private readonly pool: PostgresPool) {}

  async autorizar(
    foto: FotoParaAutorizar,
    identidad: Identidad,
    rutas: (caso: CasoDeLaFoto) => { ruta: string; partesPrefijo: string }
  ): Promise<FotoRegistrada> {
    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const familia = await this.familiaVisible(cliente, foto.casoOrigenId);
      const { ruta, partesPrefijo } = rutas({ codigo: familia.codigo });

      // Idempotente por `origen_id`, igual que el caso. El reintento tras un corte cae
      // sobre la misma fila en vez de colgarle al hogar una segunda imagen identica.
      //
      // Los CASE protegen lo ya confirmado: una fotografia verificada contra el
      // almacenamiento no cambia de ruta ni de tamano porque llegue una autorizacion
      // tardia de un celular que no se entero.
      const sql = `
        insert into fotos (
          familia_id, origen_id, tipo, url, bytes, tipo_mime, suma_sha256,
          partes_prefijo, tamano_bloque, estado, autorizada_en
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'autorizada', now())
        on conflict (origen_id) do update set
          tipo           = case when fotos.estado = 'confirmada' then fotos.tipo           else excluded.tipo end,
          url            = case when fotos.estado = 'confirmada' then fotos.url            else excluded.url end,
          bytes          = case when fotos.estado = 'confirmada' then fotos.bytes          else excluded.bytes end,
          tipo_mime      = case when fotos.estado = 'confirmada' then fotos.tipo_mime      else excluded.tipo_mime end,
          suma_sha256    = case when fotos.estado = 'confirmada' then fotos.suma_sha256    else excluded.suma_sha256 end,
          partes_prefijo = case when fotos.estado = 'confirmada' then fotos.partes_prefijo else excluded.partes_prefijo end,
          tamano_bloque  = case when fotos.estado = 'confirmada' then fotos.tamano_bloque  else excluded.tamano_bloque end,
          autorizada_en  = case when fotos.estado = 'confirmada' then fotos.autorizada_en  else now() end
        returning origen_id, url, bytes, tipo_mime, suma_sha256, partes_prefijo,
                  tamano_bloque, (estado = 'confirmada') as confirmada`;

      try {
        const r = await cliente.query<FilaFoto>(sql, [
          familia.id,
          foto.origenId,
          foto.tipo,
          ruta,
          foto.bytes,
          foto.tipoMime,
          foto.suma,
          partesPrefijo,
          foto.tamanoBloque
        ]);
        return this.aRegistrada(r.rows[0]);
      } catch (e) {
        throw this.traducir(e, foto.origenId);
      }
    });
  }

  async buscar(origenId: string, identidad: Identidad): Promise<FotoRegistrada | null> {
    return this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      const r = await cliente.query<FilaFoto>(
        `select origen_id, url, bytes, tipo_mime, suma_sha256, partes_prefijo,
                tamano_bloque, (estado = 'confirmada') as confirmada
           from fotos where origen_id = $1`,
        [origenId]
      );
      return r.rows[0] ? this.aRegistrada(r.rows[0]) : null;
    });
  }

  /**
   * Marca la fotografia como verificada.
   *
   * `bytes` es el que reporto el almacenamiento, no el que declaro el dispositivo. Si
   * difieren, el que vale es el del almacenamiento: es el unico que describe lo que hay.
   *
   * `partes_prefijo` se limpia porque los bloques ya se unieron y se borraron; dejarlo
   * puesto haria creer a una consulta posterior que todavia hay pedazos sueltos.
   */
  async confirmar(origenId: string, bytes: number, identidad: Identidad): Promise<void> {
    await this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      try {
        await cliente.query(
          `update fotos
              set estado = 'confirmada',
                  confirmada_en = coalesce(confirmada_en, now()),
                  bytes = $2,
                  partes_prefijo = null
            where origen_id = $1`,
          [origenId, bytes]
        );
      } catch (e) {
        throw this.traducir(e, origenId);
      }
    });
  }

  /** No toca las confirmadas: borrar una fotografia que ya llego es otra historia. */
  async descartar(origenId: string, identidad: Identidad): Promise<void> {
    await this.pool.comoUsuario({ sub: identidad.sub }, async (cliente) => {
      await cliente.query(`delete from fotos where origen_id = $1 and estado = 'autorizada'`, [
        origenId
      ]);
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * El caso al que se le quiere colgar la fotografia, si quien pide puede verlo.
   *
   * Las politicas de acceso hacen el trabajo: si el caso es de otro voluntario, esta
   * consulta devuelve cero filas y aqui no se distingue de que no exista. Es lo
   * correcto — decir «existe pero no es suyo» ya seria contar algo.
   */
  private async familiaVisible(
    cliente: PoolClient,
    casoOrigenId: string
  ): Promise<{ id: string; codigo: string }> {
    const r = await cliente.query<{ id: string; codigo: string; consentimiento: boolean }>(
      'select id, codigo, consentimiento from familias where origen_id = $1',
      [casoOrigenId]
    );

    const familia = r.rows[0];
    if (!familia) {
      throw new ErrorRechazo('El caso de la fotografia no existe o no es suyo.', [
        `no hay caso visible con origenId ${casoOrigenId}`
      ]);
    }

    // La fotografia de la vivienda va asociada a un hogar identificado. Sin
    // autorizacion de la familia no se emite permiso, y la que decide es la base, no
    // la pantalla desde la que se pidio.
    if (!familia.consentimiento) {
      this.log.warn(`Foto rechazada: el caso ${casoOrigenId} no tiene autorizacion de la familia.`);
      throw new ErrorRechazo('La familia no autorizo el tratamiento de sus datos.', [
        'sin consentimiento no se suben fotografias del hogar'
      ]);
    }

    return { id: familia.id, codigo: familia.codigo };
  }

  private aRegistrada(fila: FilaFoto): FotoRegistrada {
    return {
      origenId: fila.origen_id,
      ruta: fila.url,
      bytes: fila.bytes ?? 0,
      tipoMime: fila.tipo_mime ?? 'application/octet-stream',
      suma: fila.suma_sha256 ?? '',
      partesPrefijo: fila.partes_prefijo,
      tamanoBloque: fila.tamano_bloque ?? 0,
      confirmada: fila.confirmada
    };
  }

  /** Misma taxonomia del ADR 003 que usa el repositorio de casos. */
  private traducir(error: unknown, origenId: string): Error {
    if (error instanceof ErrorRechazo) return error;

    const codigo = (error as { code?: string }).code;
    const detalle = error instanceof Error ? error.message : 'desconocido';

    if (codigo && (codigo.startsWith('23') || codigo.startsWith('22') || codigo === '42501')) {
      this.log.warn(`Foto ${origenId} rechazada (${codigo}): ${detalle}`);
      return new ErrorRechazo('La fotografia no cumple las reglas de la base de datos.', [detalle]);
    }

    this.log.error(`Fallo temporal con la foto ${origenId}: ${detalle}`);
    return new ErrorTransporte();
  }
}
