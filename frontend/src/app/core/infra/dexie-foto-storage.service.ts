import { Injectable } from '@angular/core';
import { FotoLocal } from '../domain/caso.model';
import { EstadoSync } from '../domain/enums';
import { FotoStoragePort } from '../domain/ports';
import { db } from './raiz.db';

/**
 * Implementacion de {@link FotoStoragePort} sobre IndexedDB via Dexie.
 *
 * Las fotos se envian despues de los casos y de forma independiente: una conexion
 * rural intermitente suele alcanzar para el registro de texto y no para las imagenes.
 * Un caso sincronizado con fotos pendientes es un estado valido y esperado.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class DexieFotoStorageService implements FotoStoragePort {
  private static readonly MAX_INTENTOS = 10;

  async guardar(foto: FotoLocal): Promise<string> {
    await db.fotos.put(foto);
    return foto.id;
  }

  async porCaso(casoId: string): Promise<FotoLocal[]> {
    return db.fotos.where('casoId').equals(casoId).sortBy('capturadaEn');
  }

  async pendientesDeSync(limite = 10): Promise<FotoLocal[]> {
    const candidatas = await db.fotos
      .filter(
        (f) =>
          f.meta.estadoSync === EstadoSync.Pendiente ||
          (f.meta.estadoSync === EstadoSync.Error &&
            f.meta.intentos < DexieFotoStorageService.MAX_INTENTOS)
      )
      .toArray();

    // Las mas livianas primero: con senal debil, tres fotos pequenas suben antes
    // que una grande y el avance es visible para el voluntario.
    return candidatas.sort((a, b) => a.bytes - b.bytes).slice(0, limite);
  }

  async marcarSync(params: {
    fotoId: string;
    urlRemota?: string;
    error?: string;
  }): Promise<void> {
    const foto = await db.fotos.get(params.fotoId);
    if (!foto) return;

    const ahora = new Date().toISOString();
    const exito = params.error === undefined;

    await db.fotos.update(params.fotoId, {
      urlRemota: params.urlRemota ?? foto.urlRemota,
      meta: {
        estadoSync: exito ? EstadoSync.Sincronizado : EstadoSync.Error,
        intentos: foto.meta.intentos + 1,
        ultimoError: exito ? null : (params.error ?? 'Error desconocido'),
        ultimoIntentoEn: ahora,
        sincronizadoEn: exito ? ahora : foto.meta.sincronizadoEn
      }
    });
  }

  async contarPendientes(): Promise<number> {
    return db.fotos
      .filter(
        (f) =>
          f.meta.estadoSync === EstadoSync.Pendiente ||
          f.meta.estadoSync === EstadoSync.Error
      )
      .count();
  }

  /**
   * Cuanto pesa lo que falta por subir, en bytes.
   *
   * Sirve para decirle al voluntario cuanto va a gastar ANTES de que lo gaste, que es
   * la unica forma de que la decision sea suya de verdad.
   *
   * Recorre los pendientes en vez de sumar un indice porque IndexedDB no suma: no hay
   * forma de agregar sin leer los registros. Se acepta porque los pendientes son pocos
   * —se suben y desaparecen— y porque esto solo se llama al pintar la tarjeta de
   * envio, no en un bucle.
   */
  async bytesPendientes(): Promise<number> {
    let total = 0;
    await db.fotos
      .filter(
        (f) =>
          f.meta.estadoSync === EstadoSync.Pendiente ||
          f.meta.estadoSync === EstadoSync.Error
      )
      .each((f) => {
        total += f.bytes;
      });
    return total;
  }

  async eliminar(fotoId: string): Promise<void> {
    await db.fotos.delete(fotoId);
  }
}
