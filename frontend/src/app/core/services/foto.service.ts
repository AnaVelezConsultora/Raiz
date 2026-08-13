import { Injectable } from '@angular/core';
import { FotoLocal } from '../domain/caso.model';
import { EstadoSync, TipoFoto } from '../domain/enums';

/** Parametros de compresion de la imagen. */
export interface OpcionesCompresion {
  /** Lado mayor maximo en pixeles. */
  ladoMaximoPx: number;
  /** Calidad JPEG entre 0 y 1. */
  calidad: number;
}

/** Parametros para preparar una fotografia del caso. */
export interface PrepararFotoParams {
  casoId: string;
  tipo: TipoFoto;
  archivo: File;
  opciones?: Partial<OpcionesCompresion>;
}

/**
 * Captura y compresion de fotografias.
 *
 * La compresion ocurre EN EL DISPOSITIVO, antes de guardar. Una foto de celular
 * moderno pesa entre 2 y 5 MB; a 1200 px de lado mayor y calidad 0.7 baja a unos
 * 200 KB sin perder el detalle de una grieta o un techo caido.
 *
 * Por que importa: con 500 familias y 3 fotos cada una, sin comprimir son ~4.5 GB
 * que no caben en ningun plan gratuito y que ademas jamas terminarian de subir por
 * una conexion rural. Comprimidas son ~300 MB.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class FotoService {
  private static readonly POR_DEFECTO: OpcionesCompresion = {
    ladoMaximoPx: 1200,
    calidad: 0.7
  };

  /**
   * Comprime la imagen y construye el registro listo para persistir.
   *
   * @throws Error si el archivo no es una imagen legible.
   */
  async preparar(params: PrepararFotoParams): Promise<FotoLocal> {
    const opciones: OpcionesCompresion = { ...FotoService.POR_DEFECTO, ...params.opciones };
    const bitmap = await this.decodificar(params.archivo);
    const { blob, ancho, alto } = await this.comprimir(bitmap, opciones);
    bitmap.close();

    return {
      id: crypto.randomUUID(),
      casoId: params.casoId,
      tipo: params.tipo,
      blob,
      bytes: blob.size,
      ancho,
      alto,
      capturadaEn: new Date().toISOString(),
      urlRemota: null,
      meta: {
        estadoSync: EstadoSync.Pendiente,
        intentos: 0,
        ultimoError: null,
        ultimoIntentoEn: null,
        sincronizadoEn: null
      }
    };
  }

  /** URL temporal para previsualizar. Quien la crea debe revocarla al destruir la vista. */
  crearUrlPrevia(foto: FotoLocal): string {
    return URL.createObjectURL(foto.blob);
  }

  revocarUrlPrevia(url: string): void {
    URL.revokeObjectURL(url);
  }

  private async decodificar(archivo: File): Promise<ImageBitmap> {
    if (!archivo.type.startsWith('image/')) {
      throw new Error('El archivo seleccionado no es una imagen.');
    }
    try {
      return await createImageBitmap(archivo);
    } catch {
      throw new Error('No se pudo leer la imagen. Intente tomar la foto de nuevo.');
    }
  }

  private async comprimir(
    bitmap: ImageBitmap,
    opciones: OpcionesCompresion
  ): Promise<{ blob: Blob; ancho: number; alto: number }> {
    const escala = Math.min(1, opciones.ladoMaximoPx / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    // OffscreenCanvas evita tocar el DOM y no bloquea el hilo de interfaz en
    // celulares de gama baja, que es donde va a correr esto de verdad.
    const lienzo = new OffscreenCanvas(ancho, alto);
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite procesar imagenes.');

    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    const blob = await lienzo.convertToBlob({ type: 'image/jpeg', quality: opciones.calidad });

    return { blob, ancho, alto };
  }
}
