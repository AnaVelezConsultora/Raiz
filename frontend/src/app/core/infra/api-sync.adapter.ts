import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Caso, FotoLocal } from '../domain/caso.model';
import {
  ResultadoEnvioCaso,
  ResultadoEnvioFoto,
  SincronizacionPort
} from '../domain/ports';

/**
 * Transporte hacia la API de Raiz.
 *
 * Implementa {@link SincronizacionPort}. Es la unica clase del proyecto que sabe que
 * al otro lado hay HTTP: ni el dominio ni los componentes se enteran.
 *
 * QUE CAMBIO FRENTE AL ADAPTADOR ANTERIOR, Y POR QUE IMPORTA
 *
 * El adaptador de Supabase escribia fila por fila contra la base desde el navegador, y
 * solo conocia la tabla `familias`. Los bloques de vivienda, anexo rural y anexo
 * urbano —34 campos que el voluntario llena en el paso mas largo del formulario— no
 * viajaban a ninguna parte. No se noto nunca porque no habia servidor al cual enviar.
 *
 * Aqui se manda el CASO COMPLETO como un solo documento y es el servidor quien lo
 * reparte entre `familias`, `viviendas` y `produccion`, dentro de una transaccion. Es
 * ademas lo correcto: repartir un caso en tres escrituras desde un celular con senal
 * intermitente deja hogares a medias en la base cuando la senal se cae en la segunda.
 *
 * IDEMPOTENCIA
 *
 * Viaja `origenId`, el UUID que el dispositivo genero al crear el caso. Si el envio
 * llega al servidor pero la respuesta se pierde por un corte, el reintento actualiza
 * el mismo registro en vez de crear otro. En un censo, un duplicado silencioso es peor
 * que un fallo visible: infla el total que sustenta la peticion ante la entidad.
 *
 * CONSENTIMIENTO
 *
 * La identidad se retira aqui, en el borde de salida, y el servidor la vuelve a
 * retirar por su cuenta. Son dos capas a proposito: el cliente no manda lo que no
 * debe, y el servidor no escribe lo que no debe aunque un cliente defectuoso se lo
 * mande. Ver docs/hallazgos-revision.md H8 y H9.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class ApiSyncAdapter implements SincronizacionPort {
  /** Ni un envio se queda colgado mas de esto. En rural, esperar no es gratis. */
  private static readonly ESPERA_MS = 20_000;

  async disponible(): Promise<boolean> {
    if (!environment.apiUrl) return false;

    try {
      const r = await this.pedir('GET', '/salud');
      return r.ok;
    } catch {
      return false;
    }
  }

  async enviarCaso(caso: Caso): Promise<ResultadoEnvioCaso> {
    if (!environment.apiUrl) {
      return { exito: false, error: 'La API no esta configurada.', reintentable: false };
    }

    try {
      const r = await this.pedir('POST', '/casos', this.aDocumento(caso));

      if (r.ok) {
        const cuerpo = (await r.json()) as { codigo: string };
        return { exito: true, codigoAsignado: cuerpo.codigo, reintentable: false };
      }

      return {
        exito: false,
        error: await this.detalle(r),
        reintentable: this.esReintentable(r.status)
      };
    } catch (e) {
      // Excepcion sin respuesta: no hubo servidor al otro lado. Casi siempre es la
      // senal, asi que se reintenta.
      return { exito: false, error: this.mensaje(e), reintentable: true };
    }
  }

  /**
   * Sube la fotografia en dos tiempos: se pide una URL prefirmada y se sube contra
   * ella.
   *
   * El binario NO pasa por la API. Una imagen de 200 KB atravesando el servidor gasta
   * memoria y tiempo de un contenedor que deberia estar atendiendo registros, y en una
   * subida lenta lo deja ocupado varios minutos. Con URL prefirmada el celular habla
   * directo con el almacenamiento y el permiso caduca solo.
   */
  async enviarFoto(foto: FotoLocal): Promise<ResultadoEnvioFoto> {
    if (!environment.apiUrl) {
      return { exito: false, error: 'La API no esta configurada.', reintentable: false };
    }

    try {
      const permiso = await this.pedir('POST', '/fotos/url-prefirmada', {
        casoOrigenId: foto.casoId,
        fotoId: foto.id,
        tipo: foto.tipo,
        bytes: foto.bytes,
        tipoMime: 'image/jpeg'
      });

      if (!permiso.ok) {
        return {
          exito: false,
          error: await this.detalle(permiso),
          reintentable: this.esReintentable(permiso.status)
        };
      }

      const { url, campos, ruta } = (await permiso.json()) as {
        url: string;
        /** Campos firmados de la politica. Van ANTES del archivo en el formulario. */
        campos?: Record<string, string>;
        ruta: string;
      };

      const subida = await fetch(url, {
        method: 'POST',
        body: this.formulario(campos ?? {}, foto.blob),
        signal: AbortSignal.timeout(ApiSyncAdapter.ESPERA_MS)
      });

      if (!subida.ok) {
        return {
          exito: false,
          error: `El almacenamiento respondio ${subida.status}.`,
          reintentable: this.esReintentable(subida.status)
        };
      }

      // Que el almacenamiento haya respondido bien NO es que el objeto este ahi.
      // Quien lo afirma es la API, que lo verifica contra el almacenamiento. Sin este
      // paso el dispositivo borraria la foto de su memoria creyendo que ya viajo, y la
      // evidencia de una familia desapareceria sin que nadie se entere.
      return await this.confirmar(foto.id, ruta);
    } catch (e) {
      return { exito: false, error: this.mensaje(e), reintentable: true };
    }
  }

  /**
   * Le pide a la API que confirme que el objeto existe y pesa lo declarado.
   *
   * La API responde con la ruta definitiva. Es la unica fuente de verdad sobre que
   * llego: el dispositivo no decide que su foto esta a salvo.
   */
  private async confirmar(fotoId: string, ruta: string): Promise<ResultadoEnvioFoto> {
    const r = await this.pedir('POST', `/fotos/${encodeURIComponent(fotoId)}/confirmar`, {
      ruta
    });

    if (!r.ok) {
      return {
        exito: false,
        error: await this.detalle(r),
        // Que no se pueda confirmar ahora no significa que la subida fallara. Se
        // reintenta: confirmar es idempotente y volver a hacerlo no sube nada de nuevo.
        reintentable: true
      };
    }

    const cuerpo = (await r.json()) as { ruta: string };
    return { exito: true, urlRemota: cuerpo.ruta, reintentable: false };
  }

  /**
   * Arma el formulario que espera una politica de subida por navegador.
   *
   * El orden importa y no es un capricho: el almacenamiento evalua la politica con lo
   * que ya leyo, de modo que el archivo tiene que ir de ultimo. Si va antes, se
   * rechaza la subida entera despues de haber transmitido los bytes, que en una
   * conexion rural es justo lo que no se puede permitir.
   */
  private formulario(campos: Record<string, string>, blob: Blob): FormData {
    const datos = new FormData();
    for (const [clave, valor] of Object.entries(campos)) datos.append(clave, valor);
    datos.append('file', blob);
    return datos;
  }

  // ---------------------------------------------------------------------------
  // Transporte
  // ---------------------------------------------------------------------------

  private pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<Response> {
    const cabeceras: Record<string, string> = { Accept: 'application/json' };
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

    const token = this.token();
    if (token) cabeceras['Authorization'] = `Bearer ${token}`;

    return fetch(`${environment.apiUrl}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ApiSyncAdapter.ESPERA_MS)
    });
  }

  /**
   * El token guardado por el adaptador de identidad.
   *
   * Se lee aqui y no se inyecta el servicio de sesion a proposito: la cola de
   * sincronizacion no debe depender del ciclo de vida de la pantalla de acceso.
   */
  private token(): string | null {
    try {
      return localStorage.getItem('raiz.token');
    } catch {
      return null;
    }
  }

  /**
   * Que significa cada codigo para la cola. Es la taxonomia del ADR 003.
   *
   * 401 y 403 NO son reintentables, pero tampoco son rechazos del dato: la cola debe
   * detenerse y pedir reconectar en vez de quemar intentos. Esa distincion la hace el
   * servicio de sincronizacion leyendo el mensaje; aqui solo se dice si insistir sirve.
   */
  private esReintentable(estado: number): boolean {
    if (estado === 408 || estado === 429) return true;   // congestion, no rechazo
    return estado >= 500;                                 // el servidor fallo, no el dato
  }

  private async detalle(r: Response): Promise<string> {
    try {
      const cuerpo = (await r.json()) as { mensaje?: string; detalles?: string[] };
      const base = cuerpo.mensaje ?? `El servidor respondio ${r.status}.`;
      return cuerpo.detalles?.length ? `${base} ${cuerpo.detalles.join(' ')}` : base;
    } catch {
      return `El servidor respondio ${r.status}.`;
    }
  }

  private mensaje(error: unknown): string {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return 'El envio tardo demasiado. Se reintentara.';
    }
    return error instanceof Error ? error.message : 'Fallo de red durante el envio.';
  }

  // ---------------------------------------------------------------------------
  // El documento que viaja
  // ---------------------------------------------------------------------------

  /**
   * Convierte el caso del dispositivo en el documento del contrato.
   *
   * Lo que NO viaja: el estado de la cola, el numero de intentos, el `Blob` de la
   * foto, el codigo local provisional y el paso del formulario. Todo eso solo tiene
   * sentido en el celular.
   */
  private aDocumento(caso: Caso): Record<string, unknown> {
    // Sin autorizacion de la familia la identidad no sale del dispositivo.
    const conIdentidad = caso.control.consentimiento;

    return {
      origenId: caso.id,
      dispositivoId: caso.dispositivoId,
      control: caso.control,
      ubicacion: caso.ubicacion,
      hogar: {
        ...caso.hogar,
        jefeNombres: conIdentidad ? caso.hogar.jefeNombres : null,
        jefeApellidos: conIdentidad ? caso.hogar.jefeApellidos : null,
        tipoDoc: conIdentidad ? caso.hogar.tipoDoc : null,
        numDoc: conIdentidad ? caso.hogar.numDoc : null
      },
      // Estos cuatro bloques son los que antes se quedaban en el celular.
      vivienda: caso.vivienda,
      anexoRural: caso.anexoRural,
      anexoUrbano: caso.anexoUrbano,
      anexoConvenio: caso.anexoConvenio,
      triaje: caso.triaje
    };
  }
}
