import { Injectable } from '@angular/core';
import { Caso, FiltroCasos, ResumenCaso } from '../domain/caso.model';
import { EstadoSync } from '../domain/enums';
import { CasoStoragePort, MarcarSyncParams } from '../domain/ports';
import { db } from './raiz.db';

/**
 * Implementacion de {@link CasoStoragePort} sobre IndexedDB via Dexie.
 *
 * Unica responsabilidad: persistencia local. No sabe de red, ni de formularios, ni
 * de reglas de negocio. Cualquier decision sobre cuando sincronizar vive en
 * SincronizacionService.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class DexieCasoStorageService implements CasoStoragePort {
  /** Numero de intentos tras el cual la cola deja de reintentar automaticamente. */
  private static readonly MAX_INTENTOS = 8;

  async guardar(caso: Caso): Promise<string> {
    const registro: Caso = { ...caso, actualizadoEn: new Date().toISOString() };
    await db.casos.put(registro);
    return registro.id;
  }

  async obtener(casoId: string): Promise<Caso | undefined> {
    return db.casos.get(casoId);
  }

  async listar(filtro: FiltroCasos = {}): Promise<ResumenCaso[]> {
    const casos = await db.casos.orderBy('actualizadoEn').reverse().toArray();
    const filtrados = casos.filter((c) => this.cumpleFiltro(c, filtro));
    const recortados = filtro.limite ? filtrados.slice(0, filtro.limite) : filtrados;

    const fotos = await this.contarFotosPorCaso(recortados.map((c) => c.id));
    return recortados.map((c) =>
      this.aResumen(c, fotos.get(c.id) ?? { total: 0, pendientes: 0 })
    );
  }

  /**
   * Casos listos para enviar: pendientes, o con error pero por debajo del limite de
   * reintentos. Se ordenan por prioridad P0 primero, porque si la conexion se cae a
   * mitad de la cola lo que debe haber salido es el caso de riesgo de vida.
   */
  async pendientesDeSync(limite = 25): Promise<Caso[]> {
    const candidatos = await db.casos
      .filter(
        (c) =>
          c.meta.estadoSync === EstadoSync.Pendiente ||
          (c.meta.estadoSync === EstadoSync.Error &&
            c.meta.intentos < DexieCasoStorageService.MAX_INTENTOS)
      )
      .toArray();

    return candidatos
      .sort((a, b) => this.pesoPrioridad(a) - this.pesoPrioridad(b))
      .slice(0, limite);
  }

  async marcarSync(params: MarcarSyncParams): Promise<void> {
    const caso = await db.casos.get(params.casoId);
    if (!caso) return;

    const ahora = new Date().toISOString();
    const meta = params.sincronizado
      ? {
          estadoSync: EstadoSync.Sincronizado,
          intentos: caso.meta.intentos + 1,
          ultimoError: null,
          ultimoIntentoEn: ahora,
          sincronizadoEn: ahora
        }
      : {
          estadoSync: EstadoSync.Error,
          intentos: caso.meta.intentos + 1,
          ultimoError: params.error ?? 'Error desconocido',
          ultimoIntentoEn: ahora,
          sincronizadoEn: caso.meta.sincronizadoEn
        };

    await db.casos.update(params.casoId, {
      meta,
      codigo: params.codigoAsignado ?? caso.codigo
    });
  }

  async contarPendientes(): Promise<number> {
    return db.casos
      .filter(
        (c) =>
          c.meta.estadoSync === EstadoSync.Pendiente ||
          c.meta.estadoSync === EstadoSync.Error
      )
      .count();
  }

  /**
   * Borra un caso y sus fotografias.
   *
   * Va en una sola transaccion sobre las dos tablas: si se borrara el caso y fallara
   * el borrado de las fotos, quedarian imagenes de una familia en el dispositivo sin
   * ningun registro que las explique ni pantalla que las muestre. Datos huerfanos de
   * poblacion vulnerable son justo lo que no puede quedar suelto en un celular
   * prestado o perdido.
   */
  async eliminar(casoId: string): Promise<void> {
    await db.transaction('rw', db.casos, db.fotos, db.imagenes, async () => {
      const fotos = await db.fotos.where('casoId').equals(casoId).primaryKeys();
      // Los bytes viven en su propia tabla desde la version 2 del esquema: borrar
      // solo la fila de la fotografia dejaria la imagen ocupando el celular sin
      // ningun registro que la explique.
      await db.imagenes.bulkDelete(fotos);
      await db.fotos.where('casoId').equals(casoId).delete();
      await db.casos.delete(casoId);
    });
  }

  /**
   * Libera espacio borrando casos ya confirmados por el servidor.
   *
   * Solo toca registros con estado Sincronizado: lo no confirmado nunca se borra.
   *
   * UN CASO CON FOTOGRAFIAS SIN SUBIR NO ESTA CONFIRMADO, aunque su parte de texto si
   * lo este. La fotografia no es un adjunto del registro: es parte del registro — es la
   * prueba del dano con la que se sustenta la peticion ante la entidad. Borrar el caso
   * dejaria esas imagenes sin a que colgarse, y como el envio de una fotografia exige
   * que su caso siga aqui, no volverian a subir nunca: se perderian sin que nadie se
   * entere, que es la peor forma de perder algo.
   *
   * Se borra el caso Y sus fotografias, en una transaccion. Dejar las imagenes de una
   * familia sin ningun registro que las explique, en un celular prestado o perdido, es
   * justo lo que no puede pasar.
   */
  async eliminarSincronizadosAntesDe(fechaIso: string): Promise<number> {
    return db.transaction('rw', db.casos, db.fotos, db.imagenes, async () => {
      const candidatos = await db.casos
        .filter(
          (c) =>
            c.meta.estadoSync === EstadoSync.Sincronizado &&
            c.meta.sincronizadoEn !== null &&
            c.meta.sincronizadoEn < fechaIso
        )
        .primaryKeys();

      if (candidatos.length === 0) return 0;

      const conFotosPendientes = new Set(
        (await db.fotos.where('casoId').anyOf(candidatos as string[]).toArray())
          .filter((f) => f.meta.estadoSync !== EstadoSync.Sincronizado)
          .map((f) => f.casoId)
      );

      const obsoletos = (candidatos as string[]).filter((id) => !conFotosPendientes.has(id));
      if (obsoletos.length === 0) return 0;

      const fotos = await db.fotos.where('casoId').anyOf(obsoletos).primaryKeys();
      await db.imagenes.bulkDelete(fotos);
      await db.fotos.where('casoId').anyOf(obsoletos).delete();
      await db.casos.bulkDelete(obsoletos);
      return obsoletos.length;
    });
  }

  /**
   * Cuantas fotografias tiene cada caso, y cuantas de esas siguen sin viajar.
   *
   * Las dos cifras salen de la misma lectura porque se muestran juntas: «3 fotos, 2 sin
   * enviar» es una frase, no dos consultas.
   */
  private async contarFotosPorCaso(
    casoIds: string[]
  ): Promise<Map<string, { total: number; pendientes: number }>> {
    const conteo = new Map<string, { total: number; pendientes: number }>();
    if (casoIds.length === 0) return conteo;

    const fotos = await db.fotos.where('casoId').anyOf(casoIds).toArray();
    for (const foto of fotos) {
      const actual = conteo.get(foto.casoId) ?? { total: 0, pendientes: 0 };
      actual.total++;
      if (foto.meta.estadoSync !== EstadoSync.Sincronizado) actual.pendientes++;
      conteo.set(foto.casoId, actual);
    }
    return conteo;
  }

  private cumpleFiltro(caso: Caso, filtro: FiltroCasos): boolean {
    if (filtro.zona && caso.ubicacion.zona !== filtro.zona) return false;
    if (filtro.prioridad && caso.triaje?.prioridad !== filtro.prioridad) return false;
    if (filtro.estado && caso.estado !== filtro.estado) return false;
    if (filtro.estadoSync && caso.meta.estadoSync !== filtro.estadoSync) return false;
    if (filtro.texto && !this.coincideTexto(caso, filtro.texto)) return false;
    return true;
  }

  private coincideTexto(caso: Caso, texto: string): boolean {
    const aguja = texto.trim().toLowerCase();
    const pajar = [
      caso.codigo,
      caso.codigoLocal,
      caso.hogar.jefeNombres,
      caso.hogar.jefeApellidos,
      caso.hogar.numDoc,
      caso.hogar.tel1,
      caso.ubicacion.vereda,
      caso.ubicacion.barrio
    ]
      .filter((v): v is string => typeof v === 'string')
      .join(' ')
      .toLowerCase();

    return pajar.includes(aguja);
  }

  /** P0 pesa menos y por lo tanto se envia primero. */
  private pesoPrioridad(caso: Caso): number {
    const orden: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
    return orden[caso.triaje?.prioridad ?? 'p3'] ?? 3;
  }

  private aResumen(caso: Caso, fotos: { total: number; pendientes: number }): ResumenCaso {
    const nombre = [caso.hogar.jefeNombres, caso.hogar.jefeApellidos]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ');

    return {
      id: caso.id,
      codigo: caso.codigo ?? caso.codigoLocal,
      responsable: nombre || 'Sin identificar',
      lugar: caso.ubicacion.vereda ?? caso.ubicacion.barrio ?? 'Sin ubicar',
      zona: caso.ubicacion.zona,
      personasTotal: caso.hogar.personasTotal,
      prioridad: caso.triaje?.prioridad ?? null,
      estado: caso.estado,
      estadoSync: caso.meta.estadoSync,
      tieneCoordenada: caso.ubicacion.lat !== null && caso.ubicacion.lon !== null,
      nFotos: fotos.total,
      fotosPendientes: fotos.pendientes,
      actualizadoEn: caso.actualizadoEn
    };
  }
}
