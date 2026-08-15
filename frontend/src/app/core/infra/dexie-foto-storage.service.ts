import { Injectable } from '@angular/core';
import { FotoLocal } from '../domain/caso.model';
import { EstadoSync } from '../domain/enums';
import { FotoStoragePort } from '../domain/ports';
import { FotoGuardada, db } from './raiz.db';

/**
 * Implementacion de {@link FotoStoragePort} sobre IndexedDB via Dexie.
 *
 * Las fotos se envian despues de los casos y de forma independiente: una conexion
 * rural intermitente suele alcanzar para el registro de texto y no para las imagenes.
 * Un caso sincronizado con fotos pendientes es un estado valido y esperado.
 *
 * -----------------------------------------------------------------------------------
 * LOS BYTES SE ESCRIBEN UNA VEZ Y DESPUES SOLO SE LEEN
 * -----------------------------------------------------------------------------------
 *
 * La imagen vive en la tabla `imagenes`, aparte del registro que cambia. La razon esta
 * escrita en raiz.db.ts y se resume asi: en iPhone, volver a guardar un Blob leido de
 * IndexedDB falla, y como Dexie reescribe el registro entero para actualizar un campo,
 * anotar «esta foto ya se envio» reescribia la imagen — y reventaba.
 *
 * De ahi la regla que sostiene este archivo: metadato y binario no comparten fila.
 *
 * @version 0.2.0
 */
@Injectable({ providedIn: 'root' })
export class DexieFotoStorageService implements FotoStoragePort {
  private static readonly MAX_INTENTOS = 10;

  /** Una sola conversion de lo viejo por sesion, aunque se pida por varios lados. */
  private migracion: Promise<void> | null = null;

  async guardar(foto: FotoLocal): Promise<string> {
    // La conversion va ANTES de abrir la transaccion: esperar algo que no es
    // IndexedDB dentro de una transaccion la cierra sola, y la escritura se perderia
    // sin dar error.
    const datos = await foto.blob.arrayBuffer();
    const tipoMime = foto.blob.type || 'image/jpeg';

    await db.transaction('rw', db.fotos, db.imagenes, async () => {
      await db.imagenes.put({ id: foto.id, datos, tipoMime });
      await db.fotos.put(this.sinImagen(foto));
    });

    return foto.id;
  }

  async porCaso(casoId: string): Promise<FotoLocal[]> {
    const guardadas = await db.fotos.where('casoId').equals(casoId).sortBy('capturadaEn');
    return this.conImagen(guardadas);
  }

  async pendientesDeSync(limite = 10): Promise<FotoLocal[]> {
    await this.migrarLoViejo();

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
    const elegidas = candidatas.sort((a, b) => a.bytes - b.bytes).slice(0, limite);
    return this.conImagen(elegidas);
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

    // Esta escritura es la que fallaba en iPhone cuando la fila cargaba la imagen.
    // Ahora la fila es solo texto y numeros.
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
   * envio, no en un bucle. Ahora ademas lee filas sin imagen, que es mucho mas barato.
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
    await db.transaction('rw', db.fotos, db.imagenes, async () => {
      await db.imagenes.delete(fotoId);
      await db.fotos.delete(fotoId);
    });
  }

  // ---------------------------------------------------------------------------

  private sinImagen(foto: FotoLocal): FotoGuardada {
    const { blob: _, ...resto } = foto as FotoLocal & { blob?: Blob };
    return resto;
  }

  /** Reune cada metadato con sus bytes. Sin bytes, la fotografia no se puede enviar. */
  private async conImagen(guardadas: FotoGuardada[]): Promise<FotoLocal[]> {
    if (guardadas.length === 0) return [];

    const imagenes = await db.imagenes.bulkGet(guardadas.map((f) => f.id));
    const completas: FotoLocal[] = [];

    guardadas.forEach((foto, i) => {
      const imagen = imagenes[i];
      // Una fila sin bytes no se devuelve. Puede pasar con una fotografia que quedo
      // a medias entre las dos versiones del esquema: es mejor que no aparezca a que
      // la cola intente enviar una imagen vacia y la de por subida.
      if (!imagen) return;
      completas.push({ ...foto, blob: new Blob([imagen.datos], { type: imagen.tipoMime }) });
    });

    return completas;
  }

  /**
   * Pasa a la tabla nueva las fotografias que quedaron guardadas con la imagen dentro.
   *
   * Se hace aqui y no en el `upgrade` de Dexie porque convertir un Blob exige una
   * espera que no es de IndexedDB, y eso cierra la transaccion de actualizacion a
   * media faena, en silencio.
   *
   * Es tolerante a propósito: si una imagen vieja ya no se puede leer —el mismo fallo
   * de WebKit, del otro lado— la fotografia se marca con error en vez de tumbar el
   * envio de las demas. Quien la tomo vera que esa hay que repetirla.
   */
  private migrarLoViejo(): Promise<void> {
    this.migracion ??= (async () => {
      const conImagenAdentro = (await db.fotos.toArray()).filter(
        (f) => (f as FotoGuardada & { blob?: Blob }).blob instanceof Blob
      );

      for (const foto of conImagenAdentro) {
        const blob = (foto as FotoGuardada & { blob?: Blob }).blob as Blob;
        try {
          const datos = await blob.arrayBuffer();
          await db.transaction('rw', db.fotos, db.imagenes, async () => {
            await db.imagenes.put({ id: foto.id, datos, tipoMime: blob.type || 'image/jpeg' });
            await db.fotos.put(this.sinImagen({ ...foto, blob } as FotoLocal));
          });
        } catch {
          await db.fotos.update(foto.id, {
            meta: {
              ...foto.meta,
              estadoSync: EstadoSync.Error,
              ultimoError: 'La imagen guardada no se pudo leer. Hay que tomarla de nuevo.'
            }
          });
        }
      }
    })();

    return this.migracion;
  }
}
