import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AutorizacionSubida, BloquePendiente, Caso, FotoLocal } from '../domain/caso.model';
import {
  AvanceFoto,
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

  /**
   * Un bloque aguanta mas espera que un caso de 3 KB.
   *
   * Los bloques van de 64 KiB a 1 MiB. Con el limite de 20 segundos de un caso, sobre
   * una conexion rural el bloque grande se cortaria siempre y la fotografia no subiria
   * nunca — gastando, en cada intento, los datos de lo que alcanzo a transmitir.
   */
  private static readonly ESPERA_BLOQUE_MS = 120_000;

  /**
   * Cuantas veces se insiste con un mismo bloque antes de dejarlo para la proxima.
   *
   * Tres y no mas: pasado eso, lo que falla no es un tropiezo sino la red, y seguir
   * insistiendo gasta bateria y datos del voluntario contra algo que no va a ceder.
   */
  private static readonly INTENTOS_POR_BLOQUE = 3;

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
   * Sube la fotografia en tres tiempos: se pide permiso, se sube por bloques, se
   * confirma.
   *
   * LA IMAGEN NO PASA POR LA API. Cada bloque va directo al almacenamiento con un
   * permiso firmado que caduca solo.
   *
   * TODA FOTOGRAFIA SE PARTE, incluso una de 200 KB, y esa es la diferencia que se
   * nota en terreno: la red de una vereda no se cae cuando el archivo es grande, se
   * cae cuando se cae. Un envio entero cortado al 80 % no deja nada y el reintento
   * vuelve a gastar los mismos datos. Partido, cada pedazo que llego se queda.
   *
   * EL REPARTO LO DECIDE LA API, no este adaptador: se declara cuanto pesa y se sube lo
   * que responda, en los pedazos que diga. Que el criterio viva en el servidor es lo
   * que permite cambiarlo sin actualizar quince telefonos que estan en veredas sin
   * senal.
   */
  async enviarFoto(
    foto: FotoLocal,
    alAvanzar?: (avance: AvanceFoto) => void
  ): Promise<ResultadoEnvioFoto> {
    if (!environment.apiUrl) {
      return { exito: false, error: 'La API no esta configurada.', reintentable: false };
    }

    try {
      const permiso = await this.pedir('POST', '/fotos/url-prefirmada', {
        casoOrigenId: foto.casoId,
        fotoId: foto.id,
        tipo: foto.tipo,
        bytes: foto.bytes,
        tipoMime: foto.blob.type || 'image/jpeg',
        // Una fotografia guardada por una version anterior no la trae. Se calcula
        // ahora en vez de renunciar a comprobarla: leer 200 KB del disco del telefono
        // cuesta milisegundos, y sin suma la integridad de esa imagen no la verifica
        // nadie.
        suma: foto.sha256 ?? (await this.suma(foto.blob))
      });

      if (!permiso.ok) {
        return {
          exito: false,
          error: await this.detalle(permiso),
          reintentable: this.esReintentable(permiso.status)
        };
      }

      const autorizacion = (await permiso.json()) as AutorizacionSubida;

      // Ya estaba guardada: se perdio la respuesta de una confirmacion anterior. Sin
      // este caso el voluntario pagaria por segunda vez unos datos que ya gasto.
      if (autorizacion.modo === 'confirmada') {
        return { exito: true, urlRemota: autorizacion.ruta, reintentable: false };
      }

      return await this.subirBloques(foto, autorizacion, alAvanzar);
    } catch (e) {
      return { exito: false, error: this.mensaje(e), reintentable: true };
    }
  }

  /**
   * Sube los bloques que faltan, uno por uno, y confirma al terminar.
   *
   * LO QUE YA VIAJO NO SE VUELVE A PAGAR. La API dice cuales faltan —se lo pregunta al
   * almacenamiento, no a este celular— asi que un corte en el bloque 3 de 4 deja hechos
   * los dos primeros y el siguiente intento arranca en el tercero. Es la diferencia
   * entre subir una fotografia en tres ventanas de senal de un minuto, o no subirla
   * nunca.
   *
   * SECUENCIAL Y NO EN PARALELO, por la misma razon que la cola de casos: dos envios
   * simultaneos sobre una conexion movil debil se estorban y terminan mas tarde que uno
   * detras de otro, y ademas dejan al voluntario sin saber cuanto lleva.
   *
   * Al primer fallo se corta. Insistir con el bloque siguiente sobre una red que acaba
   * de fallar gasta datos para nada; lo que corresponde es volver cuando haya senal, y
   * entonces lo subido cuenta.
   */
  private async subirBloques(
    foto: FotoLocal,
    autorizacion: Extract<AutorizacionSubida, { modo: 'bloques' }>,
    alAvanzar?: (avance: AvanceFoto) => void
  ): Promise<ResultadoEnvioFoto> {
    let bytesEnviados = autorizacion.recibidos.reduce((suma, b) => suma + b.bytes, 0);

    for (const bloque of autorizacion.pendientes) {
      const resultado = await this.subirBloque(foto, bloque);

      if (!resultado.exito) {
        // El bloque no llego, pero los anteriores si. Se informa cuanto viajo para que
        // la aplicacion no le diga al voluntario que no se envio nada.
        return { ...resultado, bytesEnviados };
      }

      bytesEnviados += bloque.hasta - bloque.desde;
      alAvanzar?.({
        fotoId: foto.id,
        bloque: bloque.numero,
        totalBloques: autorizacion.total,
        bytesEnviados,
        bytesTotales: foto.bytes
      });
    }

    // No se manda ninguna lista de bloques: quien los junta es la API, con los que ella
    // misma verifico. Asi una version defectuosa de esta aplicacion no puede dar por
    // completa una imagen a la que le falta un pedazo.
    const confirmada = await this.confirmar(foto.id, autorizacion.ruta);
    return { ...confirmada, bytesEnviados };
  }

  /**
   * Sube UN bloque, insistiendo un poco antes de rendirse.
   *
   * POR QUE SE INSISTE AQUI Y NO SOLO EN LA PASADA SIGUIENTE
   *
   * Porque hay fallos que duran segundos, no minutos: un corte de wifi al cambiar de
   * canal, un intermediario que responde 504 sin haber preguntado a nadie, una
   * conexion movil que se reengancha. Rendirse al primer intento convierte eso en
   * «no se pudo enviar», el voluntario toca el boton otra vez y la pasada entera se
   * repite desde la autorizacion.
   *
   * Se descubrio probando desde un iPhone: el primer bloque respondia 504 al instante
   * y la fotografia se daba por fallida en menos de un segundo, sin nada que mirar en
   * la pantalla.
   *
   * Tres intentos con espera creciente, y solo para lo que puede mejorar con el
   * tiempo: un rechazo del dato —403 por firma vencida, 400 por tamano— no se
   * reintenta, porque insistir con lo mismo da lo mismo.
   */
  private async subirBloque(
    foto: FotoLocal,
    bloque: BloquePendiente
  ): Promise<ResultadoEnvioFoto> {
    const pedazo = foto.blob.slice(bloque.desde, bloque.hasta);
    let ultimo = 'no se intento';

    for (let intento = 1; intento <= ApiSyncAdapter.INTENTOS_POR_BLOQUE; intento++) {
      try {
        const respuesta = await fetch(bloque.url, {
          method: 'PUT',
          body: pedazo,
          signal: AbortSignal.timeout(ApiSyncAdapter.ESPERA_BLOQUE_MS)
        });

        if (respuesta.ok) return { exito: true, reintentable: false };

        // El cuerpo del error, recortado. Un fallo de S3 llega como XML con su
        // codigo; uno de un intermediario —un proxy del operador, una retransmision
        // privada— llega como HTML y con otro nombre. Sin esto, un 504 en la vereda
        // es un numero y nadie sabe a quien reclamarle.
        ultimo = `el almacenamiento respondio ${respuesta.status}`;
        const detalle = (await respuesta.text().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (detalle) ultimo += ` — ${detalle.slice(0, 140)}`;
        if (!this.esReintentable(respuesta.status)) {
          return {
            exito: false,
            error: `Bloque ${bloque.numero}: ${ultimo}.`,
            reintentable: false
          };
        }
      } catch (e) {
        ultimo = this.mensaje(e);
      }

      if (intento < ApiSyncAdapter.INTENTOS_POR_BLOQUE) {
        await new Promise((seguir) => setTimeout(seguir, intento * 1500));
      }
    }

    return {
      exito: false,
      error:
        `El bloque ${bloque.numero} no paso despues de ` +
        `${ApiSyncAdapter.INTENTOS_POR_BLOQUE} intentos: ${ultimo}.`,
      reintentable: true
    };
  }

  /**
   * Cancela en el servidor una subida que quedo a medias.
   *
   * Los bloques de una subida que nadie cierra ocupan espacio facturable y no se ven al
   * listar el almacenamiento. Se llama cuando el voluntario borra un caso que no habia
   * terminado de enviar: sin esto, lo transmitido se queda pagando alquiler.
   */
  async cancelarFoto(fotoId: string): Promise<void> {
    if (!environment.apiUrl) return;

    try {
      await this.pedir('DELETE', `/fotos/${encodeURIComponent(fotoId)}`);
    } catch {
      // Que no se pueda cancelar ahora no puede impedirle al voluntario borrar el caso
      // de su celular. El ciclo de vida del bucket barre lo que quede.
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

  /** SHA-256 en hexadecimal. Misma funcion que usa FotoService al capturar. */
  private async suma(blob: Blob): Promise<string> {
    const resumen = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(resumen))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
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
      triaje: caso.triaje
    };
  }
}
