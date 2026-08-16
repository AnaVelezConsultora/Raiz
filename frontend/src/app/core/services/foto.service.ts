import { Injectable } from '@angular/core';
import { MAXIMO_BYTES_FOTO } from '@raiz/dominio';
import { FotoLocal } from '../domain/caso.model';
import { EstadoSync, TipoFoto } from '../domain/enums';

/** Parametros de compresion de la imagen. */
export interface OpcionesCompresion {
  /** Lado mayor maximo en pixeles. */
  ladoMaximoPx: number;
  /** Calidad JPEG entre 0 y 1. */
  calidad: number;
  /**
   * Peso al que se quiere llegar. Si el primer intento se pasa, se insiste.
   *
   * No es un limite duro: es el objetivo. Lo que manda al final es que la grieta se
   * siga viendo.
   */
  objetivoBytes: number;
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
 * LA COMPRESION OCURRE EN EL DISPOSITIVO, ANTES DE GUARDAR. El archivo original no se
 * almacena, no se encola y no viaja: lo que entra a IndexedDB ya viene reducido.
 *
 * -----------------------------------------------------------------------------------
 * POR QUE ESTO IMPORTA MAS DE LO QUE PARECE
 * -----------------------------------------------------------------------------------
 *
 * Una foto de un celular de gama alta pesa entre 2 y 8 MB, y un iPhone reciente en
 * modo por defecto puede pasar de eso. Con 500 familias y tres fotos cada una, sin
 * comprimir son varios gigabytes que no caben en ningun plan y que ademas jamas
 * terminarian de subir por una conexion rural. A 1200 px de lado mayor y calidad 0,7
 * quedan en unos 200 KB, y en 200 KB la grieta de un muro y un techo caido se siguen
 * viendo — que es para lo que sirve la fotografia.
 *
 * SIEMPRE SALE JPEG, venga lo que venga. Un iPhone entrega HEIC, y aunque Safari sabe
 * leerlo, ni el servidor ni quien abra el reporte en una entidad tienen por que
 * saberlo. Aqui se decodifica y se vuelve a codificar, de modo que el formato deja de
 * ser un problema de nadie mas.
 *
 * SI EL PRIMER INTENTO SE PASA DEL OBJETIVO, SE INSISTE. Una fachada con mucho detalle
 * puede quedar en 900 KB a calidad 0,7. Antes eso se guardaba tal cual y el voluntario
 * pagaba la diferencia sin enterarse; ahora se baja la calidad y, si aun no alcanza, el
 * tamano, hasta acercarse al objetivo.
 *
 * @version 0.2.0
 */
@Injectable({ providedIn: 'root' })
export class FotoService {
  private static readonly POR_DEFECTO: OpcionesCompresion = {
    ladoMaximoPx: 1200,
    calidad: 0.7,
    /**
     * 350 KB. Por encima de esto se insiste con menos calidad.
     *
     * No es 200 KB, que es lo que da el caso corriente, porque forzar ahi obligaria a
     * degradar de mas justo las fotos con mucho detalle, que suelen ser las de dano
     * severo: las que hay que poder mirar.
     */
    objetivoBytes: 350 * 1024
  };

  /**
   * Escalones a los que se baja cuando el primero se pasa del objetivo.
   *
   * Primero se sacrifica calidad, que se nota poco en una foto de un muro; solo despues
   * se reduce el tamano, que si borra detalle fino. El ultimo escalon es el suelo: por
   * debajo de 800 px una grieta deja de distinguirse de una sombra.
   */
  private static readonly ESCALONES: ReadonlyArray<{ lado: number; calidad: number }> = [
    { lado: 1200, calidad: 0.55 },
    { lado: 1200, calidad: 0.45 },
    { lado: 1000, calidad: 0.5 },
    { lado: 800, calidad: 0.5 }
  ];

  /**
   * Comprime la imagen y construye el registro listo para persistir.
   *
   * @throws Error si el archivo no es una imagen legible o si el navegador no sabe
   *         procesar imagenes.
   */
  async preparar(params: PrepararFotoParams): Promise<FotoLocal> {
    const opciones: OpcionesCompresion = { ...FotoService.POR_DEFECTO, ...params.opciones };
    const bitmap = await this.decodificar(params.archivo);

    try {
      const { blob, ancho, alto } = await this.comprimirHastaElObjetivo(bitmap, opciones);

      // Nunca deberia pasar con los escalones de arriba. Si pasa, es mejor decirlo aqui
      // que descubrirlo cuando el servidor rechace la subida en el pueblo, sin la
      // familia delante y sin poder repetir la foto.
      if (blob.size > MAXIMO_BYTES_FOTO) {
        throw new Error('La imagen sigue siendo demasiado pesada. Intente con menos detalle.');
      }

      return {
        id: crypto.randomUUID(),
        casoId: params.casoId,
        tipo: params.tipo,
        blob,
        bytes: blob.size,
        sha256: await this.suma(blob),
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
    } finally {
      // En el `finally` y no despues del `return`: si la compresion falla, el bitmap
      // descomprimido —que en una foto de 12 MP son unos 48 MB— se queda en memoria de
      // un telefono que probablemente ya anda justo.
      bitmap.close();
    }
  }

  /**
   * SHA-256 de la imagen ya comprimida, en hexadecimal.
   *
   * Se calcula UNA VEZ, al capturar, y no en cada intento de envio: una fotografia que
   * tarda tres ventanas de senal en subir se leeria entera tres veces, y en un telefono
   * de gama baja eso se siente en el pulgar.
   *
   * Se calcula sobre el resultado de la compresion y no sobre el archivo original,
   * porque lo que viaja es esto.
   */
  private async suma(blob: Blob): Promise<string> {
    const resumen = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(resumen))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** URL temporal para previsualizar. Quien la crea debe revocarla al destruir la vista. */
  crearUrlPrevia(foto: FotoLocal): string {
    return URL.createObjectURL(foto.blob);
  }

  revocarUrlPrevia(url: string): void {
    URL.revokeObjectURL(url);
  }

  private async decodificar(archivo: File): Promise<ImageBitmap> {
    // El tipo puede venir vacio: algunos navegadores no lo declaran para un archivo
    // que llega de la camara. Vacio se deja pasar y decide el decodificador, que es
    // quien de verdad sabe.
    if (archivo.type && !archivo.type.startsWith('image/')) {
      throw new Error('El archivo seleccionado no es una imagen.');
    }

    try {
      return await createImageBitmap(archivo);
    } catch {
      // Aqui cae el HEIC en un Android, que no lo sabe leer. El mensaje no menciona el
      // formato a proposito: quien esta parado frente a una casa caida necesita saber
      // que hacer, no como se llama el problema.
      throw new Error('No se pudo leer la imagen. Intente tomar la foto de nuevo.');
    }
  }

  /**
   * Comprime, y si se paso del objetivo vuelve a intentar con menos.
   *
   * El caso corriente cuesta UNA codificacion: la foto de 200 KB sale al primer
   * intento y no entra al bucle. Solo las que se pasan pagan mas, que es justo el
   * reparto que conviene en un telefono lento.
   */
  private async comprimirHastaElObjetivo(
    bitmap: ImageBitmap,
    opciones: OpcionesCompresion
  ): Promise<{ blob: Blob; ancho: number; alto: number }> {
    let mejor = await this.comprimir(bitmap, opciones.ladoMaximoPx, opciones.calidad);
    if (mejor.blob.size <= opciones.objetivoBytes) return mejor;

    for (const escalon of FotoService.ESCALONES) {
      const intento = await this.comprimir(bitmap, escalon.lado, escalon.calidad);
      if (intento.blob.size < mejor.blob.size) mejor = intento;
      if (mejor.blob.size <= opciones.objetivoBytes) break;
    }

    return mejor;
  }

  private async comprimir(
    bitmap: ImageBitmap,
    ladoMaximoPx: number,
    calidad: number
  ): Promise<{ blob: Blob; ancho: number; alto: number }> {
    const escala = Math.min(1, ladoMaximoPx / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const blob = await this.dibujarYCodificar(bitmap, ancho, alto, calidad);
    return { blob, ancho, alto };
  }

  /**
   * Dibuja y codifica, con lienzo fuera de pantalla si el navegador lo tiene.
   *
   * EL CAMINO DE RESPALDO NO ES DECORADO. `OffscreenCanvas` llego a Safari en iOS 16.4,
   * y un iPhone 7 u 8 —que en esta zona son telefonos corrientes, no antiguallas— se
   * queda en iOS 15. Sin respaldo, en esos telefonos la aplicacion no falla al arrancar
   * ni al iniciar sesion: falla al tomar la primera fotografia, en la vereda, con la
   * familia esperando.
   */
  private async dibujarYCodificar(
    bitmap: ImageBitmap,
    ancho: number,
    alto: number,
    calidad: number
  ): Promise<Blob> {
    if (typeof OffscreenCanvas !== 'undefined') {
      const lienzo = new OffscreenCanvas(ancho, alto);
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new Error('El navegador no permite procesar imagenes.');

      ctx.drawImage(bitmap, 0, 0, ancho, alto);
      return lienzo.convertToBlob({ type: 'image/jpeg', quality: calidad });
    }

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite procesar imagenes.');

    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    return new Promise<Blob>((resolver, rechazar) => {
      lienzo.toBlob(
        (blob) =>
          blob ? resolver(blob) : rechazar(new Error('El navegador no pudo comprimir la imagen.')),
        'image/jpeg',
        calidad
      );
    });
  }
}
