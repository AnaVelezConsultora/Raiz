import { Hash, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AlmacenamientoObjetosPort, ErrorTransporte } from '../../dominio/puertos';

/**
 * Almacenamiento de fotografias sobre S3.
 *
 * Es la unica clase del servidor que sabe que al otro lado hay S3.
 *
 * -----------------------------------------------------------------------------------
 * POR QUE EL PERMISO SE FIRMA Y NO SE ABRE EL BUCKET
 * -----------------------------------------------------------------------------------
 *
 * Un bucket con escritura abierta es una cuenta de AWS que paga cualquiera que
 * encuentre la direccion. Aqui cada permiso vale para una clave, un tamano exacto y
 * unos minutos.
 *
 * -----------------------------------------------------------------------------------
 * POR QUE NO SE USA LA SUBIDA MULTIPARTE DE S3
 * -----------------------------------------------------------------------------------
 *
 * Porque exige que toda parte salvo la ultima pese al menos 5 MiB. Una fotografia de
 * 200 KB no se podria partir, y partirla es justamente lo que se quiere: en una red que
 * se cae cada dos minutos, lo que salva la imagen es que cada pedazo que llego se
 * quede. Aqui cada bloque es un objeto suyo, y {@link unir} los junta al final.
 *
 * @version 0.2.0
 */
@Injectable()
export class AlmacenamientoS3 implements AlmacenamientoObjetosPort {
  private readonly log = new Logger(AlmacenamientoS3.name);
  private readonly cliente: S3Client;
  private readonly bucket: string;

  /** Un permiso dura una ventana de conectividad, no una jornada. */
  private static readonly VIGENCIA_SEG = 900;

  constructor() {
    this.bucket = process.env['S3_BUCKET_FOTOS'] ?? 'raiz-fotos';

    // S3_ENDPOINT solo esta definido en el entorno local, donde apunta a LocalStack.
    // Su ausencia es lo que hace que el SDK arme la direccion real de AWS; ponerlo en
    // la nube apuntaria a un servicio que alli no existe. Mismo criterio que
    // COGNITO_ENDPOINT en el adaptador de identidad.
    const endpoint = process.env['S3_ENDPOINT'];

    this.cliente = new S3Client({
      region: process.env['AWS_REGION'] ?? 'us-east-1',

      // SIN ESTA LINEA LOS BLOQUES NO SUBEN, y el error no dice por que.
      //
      // El SDK calcula por su cuenta una suma de verificacion del cuerpo de la
      // peticion. Al FIRMAR la subida de un bloque el cuerpo aqui esta vacio —los bytes
      // los pone el celular despues— asi que en la direccion firmada queda la suma de
      // la nada. Cuando el telefono manda el bloque de verdad, el almacenamiento
      // compara contra esa suma y responde `Checksum Type mismatch`, que no se parece
      // en nada al problema.
      //
      // Tambien importa al unir: calcular la suma obligaria a leer el flujo entero en
      // memoria antes de mandarlo, que es justo lo que se evita transmitiendo en flujo.
      requestChecksumCalculation: 'WHEN_REQUIRED',

      ...(endpoint
        ? {
            endpoint,
            // Con direccion propia hay que pedir rutas del tipo `host/bucket/clave`:
            // el nombre del bucket como subdominio no resuelve contra localhost.
            forcePathStyle: true,
            credentials: {
              accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'local',
              secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'local'
            }
          }
        : {})
    });
  }

  /**
   * Permiso para escribir un bloque, con su tamano dentro de la firma.
   *
   * `content-length` va entre las cabeceras firmadas, y eso es lo que ata el permiso al
   * tamano: si el cuerpo que llega no pesa exactamente lo declarado, la firma no
   * cuadra y el almacenamiento rechaza. Sin esa atadura, un permiso interceptado seria
   * espacio ilimitado a cargo del proyecto.
   *
   * El tipo de contenido NO se firma en los bloques, a proposito: un bloque no es una
   * imagen, son bytes sueltos, y `Blob.slice` en el navegador pierde el tipo del
   * original. Firmarlo haria fallar la subida por una cabecera que el celular no
   * controla. El tipo se fija al unir, que es cuando existe una imagen.
   */
  async firmarEscritura(params: {
    clave: string;
    bytes: number;
  }): Promise<{ url: string; expiraEn: string }> {
    try {
      const url = await getSignedUrl(
        this.cliente,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.clave,
          ContentLength: params.bytes
        }),
        {
          expiresIn: AlmacenamientoS3.VIGENCIA_SEG,
          signableHeaders: new Set(['content-length'])
        }
      );

      return { url, expiraEn: this.expiraEn() };
    } catch (e) {
      throw this.traducir(e, `firmar la escritura de ${params.clave}`);
    }
  }

  async tamano(clave: string): Promise<number | null> {
    try {
      const r = await this.cliente.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: clave })
      );
      return r.ContentLength ?? 0;
    } catch (e) {
      if (this.esNoEncontrado(e)) return null;
      throw this.traducir(e, `consultar ${clave}`);
    }
  }

  /**
   * Une los bloques en un solo objeto y devuelve la suma de lo que escribio.
   *
   * LA SUMA SE CALCULA SOBRE LOS BYTES QUE PASAN, en la misma pasada. Verificarla
   * despues, releyendo el objeto, costaria el doble de trafico y ademas comprobaria una
   * lectura distinta de la que se escribio.
   *
   * SE TRANSMITE EN FLUJO, no se arma en memoria. Los bloques se leen uno detras de
   * otro y se van escribiendo a medida que llegan, de modo que la memoria que ocupa
   * unir una imagen de 25 MB es la misma que la de una de 200 KB. En un contenedor de
   * 0,25 vCPU y 512 MB que ademas esta recibiendo casos, la diferencia entre eso y
   * juntar todo en un arreglo es que el proceso siga vivo.
   *
   * `ContentLength` va explicito porque un flujo no sabe cuanto mide, y sin ese dato el
   * SDK tendria que leerlo entero para averiguarlo — volviendo a lo que se acaba de
   * evitar.
   */
  async unir(params: {
    claves: string[];
    destino: string;
    tipoMime: string;
    bytes: number;
  }): Promise<{ suma: string }> {
    const resumen = createHash('sha256');

    try {
      await this.cliente.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.destino,
          Body: Readable.from(this.leerEnOrden(params.claves, resumen)),
          ContentLength: params.bytes,
          ContentType: params.tipoMime
        })
      );

      return { suma: resumen.digest('hex') };
    } catch (e) {
      throw this.traducir(e, `unir ${params.claves.length} bloques en ${params.destino}`);
    }
  }

  async borrar(clave: string): Promise<void> {
    try {
      await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }));
    } catch (e) {
      // Borrar lo que ya no esta es exito: se llega aqui reintentando una limpieza.
      if (this.esNoEncontrado(e)) return;
      throw this.traducir(e, `borrar ${clave}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Detalles
  // ---------------------------------------------------------------------------

  /**
   * Lee los bloques uno detras de otro.
   *
   * El orden es el del arreglo y no se ordena aqui: quien lo arma es el servicio, que
   * es quien sabe que el bloque 2 va despues del 1. Si esto se equivocara, la imagen
   * resultante pesaria lo correcto y no se veria — que es la peor forma de fallar.
   */
  private async *leerEnOrden(claves: string[], resumen: Hash): AsyncGenerator<Buffer> {
    for (const clave of claves) {
      const r = await this.cliente.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: clave })
      );

      const cuerpo = r.Body as Readable | undefined;
      if (!cuerpo) throw new Error(`el bloque ${clave} vino vacio`);

      for await (const pedazo of cuerpo) {
        resumen.update(pedazo as Buffer);
        yield pedazo as Buffer;
      }
    }
  }

  private expiraEn(): string {
    return new Date(Date.now() + AlmacenamientoS3.VIGENCIA_SEG * 1000).toISOString();
  }

  private esNoEncontrado(e: unknown): boolean {
    const nombre = (e as { name?: string }).name;
    const estado = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    return nombre === 'NotFound' || nombre === 'NoSuchKey' || estado === 404;
  }

  /**
   * Todo fallo del almacenamiento es de TRANSPORTE, y esa eleccion no es pereza.
   *
   * Lo que decide el cliente con la respuesta es si reintentar o si sacar la fotografia
   * de la cola. Una imagen que se descarta no se vuelve a tomar: el voluntario ya bajo
   * de la vereda. Ante la duda, que se reintente.
   */
  private traducir(error: unknown, que: string): Error {
    const detalle = error instanceof Error ? `${error.name}: ${error.message}` : 'desconocido';
    this.log.error(`No se pudo ${que} — ${detalle}`);
    return new ErrorTransporte('El almacenamiento no respondio. Reintente.');
  }
}
