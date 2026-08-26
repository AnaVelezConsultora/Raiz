import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { FotoLocal } from '../domain/caso.model';
import { AvanceFoto, CASO_STORAGE, FOTO_STORAGE, SINCRONIZACION } from '../domain/ports';
import { RedService } from './red.service';

/** Resultado de una pasada completa de la cola. */
export interface ResultadoSincronizacion {
  casosEnviados: number;
  casosFallidos: number;
  fotosEnviadas: number;
  fotosFallidas: number;
  interrumpida: boolean;
}

/** Estado visible de la sincronizacion. */
export type EstadoSincronizacion = 'inactiva' | 'en_curso' | 'sin_conexion' | 'error';

/**
 * Cola de sincronizacion.
 *
 * Unica responsabilidad: decidir QUE se envia y CUANDO. No sabe de IndexedDB ni de
 * Supabase: depende de los puertos {@link CASO_STORAGE}, {@link FOTO_STORAGE} y
 * {@link SINCRONIZACION}.
 *
 * Reglas de operacion, todas aprendidas de conectividad rural real:
 *
 * 1. Casos antes que fotos. El texto es lo que permite atender a la familia; la
 *    foto es evidencia. Si la ventana de senal alcanza para una sola cosa, que sea
 *    el caso.
 * 2. P0 primero dentro de los casos (lo resuelve el almacenamiento al ordenar).
 * 3. Envio secuencial, no en paralelo. Una conexion movil debil se degrada con
 *    peticiones concurrentes y termina fallando todas.
 * 4. Se detiene a la primera falla NO reintentable de red para no quemar la bateria
 *    ni los datos del voluntario contra un servidor caido.
 * 5. Nunca hay dos pasadas simultaneas.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class SincronizacionService {
  private readonly casos = inject(CASO_STORAGE);
  private readonly fotos = inject(FOTO_STORAGE);
  private readonly transporte = inject(SINCRONIZACION);
  private readonly red = inject(RedService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _estado = signal<EstadoSincronizacion>('inactiva');
  private readonly _casosPendientes = signal(0);
  private readonly _fotosPendientes = signal(0);
  private readonly _bytesFotosPendientes = signal(0);
  private readonly _ultimoError = signal<string | null>(null);
  private readonly _ultimaSincronizacion = signal<string | null>(null);
  private readonly _enLinea = signal(navigator.onLine);
  private readonly _avanceFoto = signal<AvanceFoto | null>(null);
  private readonly _fotosEsperandoCaso = signal(0);
  private readonly _fotosDetenidas = signal(0);
  private pasadaEnCurso = false;

  readonly estado = this._estado.asReadonly();
  readonly casosPendientes = this._casosPendientes.asReadonly();
  readonly fotosPendientes = this._fotosPendientes.asReadonly();
  readonly ultimoError = this._ultimoError.asReadonly();
  readonly ultimaSincronizacion = this._ultimaSincronizacion.asReadonly();
  readonly enLinea = this._enLinea.asReadonly();

  /** Total de elementos por enviar. Es lo que ve el voluntario en el boton. */
  readonly totalPendientes = computed(
    () => this._casosPendientes() + this._fotosPendientes()
  );

  readonly puedeSincronizar = computed(
    () => this._enLinea() && this._estado() !== 'en_curso' && this.totalPendientes() > 0
  );

  /** Peso de las fotografias por subir. Se muestra ANTES de gastarlo, no despues. */
  readonly bytesFotosPendientes = this._bytesFotosPendientes.asReadonly();

  /**
   * Avance de la fotografia que se esta subiendo por bloques, o null.
   *
   * Solo tiene valor mientras hay una subida larga en curso. Una foto comprimida a
   * 200 KB sube de un envio y no pasa por aqui: no hay nada que dibujar entre «empezo»
   * y «termino».
   */
  readonly avanceFoto = this._avanceFoto.asReadonly();

  /**
   * Cuantas fotografias no pueden salir todavia porque su caso no ha llegado.
   *
   * Se muestra para que el contador de pendientes no parezca atascado: son fotos que
   * estan bien, esperando su turno, y no fotos que fallaron.
   */
  readonly fotosEsperandoCaso = this._fotosEsperandoCaso.asReadonly();

  /**
   * Fotografias que agotaron los reintentos: nadie las esta enviando.
   *
   * Se muestran aparte porque hasta ahora se sumaban a las pendientes y el contador
   * mentia: decia que faltaban dos y solo se intentaba una.
   */
  readonly fotosDetenidas = this._fotosDetenidas.asReadonly();

  /** El avance en palabras: «bloque 3 de 4». Vacio cuando no hay subida en curso. */
  readonly avanceFotoTexto = computed(() => {
    const avance = this._avanceFoto();
    if (!avance) return '';
    return `bloque ${avance.bloque} de ${avance.totalBloques}`;
  });

  /** El mismo avance en porcentaje, para la barra. */
  readonly avanceFotoPorcentaje = computed(() => {
    const avance = this._avanceFoto();
    if (!avance || avance.bytesTotales <= 0) return 0;
    return Math.min(100, Math.round((avance.bytesEnviados / avance.bytesTotales) * 100));
  });

  /** El peso en palabras: "unos 1,2 MB". Vacio si no hay nada pendiente. */
  readonly pesoFotosPendientes = computed(() => {
    const bytes = this._bytesFotosPendientes();
    if (bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `unos ${Math.round(bytes / 1024)} KB`;
    return `unos ${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  });

  constructor() {
    const alEntrarEnLinea = (): void => this.alRecuperarConexion();
    const alSalirDeLinea = (): void => {
      this._enLinea.set(false);
      this._estado.set('sin_conexion');
    };

    window.addEventListener('online', alEntrarEnLinea);
    window.addEventListener('offline', alSalirDeLinea);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', alEntrarEnLinea);
      window.removeEventListener('offline', alSalirDeLinea);
    });

    // Tambien al abrir, no solo al reconectar: el evento `online` no se dispara si la
    // aplicacion arranca con senal. El efecto vuelve a revisar cuando alguien desactiva
    // el ahorro de datos sin cerrar Raiz; ese cambio equivale a abrir la valvula.
    effect(() => {
      const permiteEnvioAutomatico = this.red.permiteEnvioAutomatico();
      void this.revisarPendientes(permiteEnvioAutomatico);
    });
  }

  /**
   * Cancela en el servidor la subida a medias de una fotografia que se esta borrando.
   *
   * Sin esto, los bloques que alcanzaron a viajar de una foto que el voluntario
   * descarto se quedan ocupando espacio facturable, invisibles al listar el
   * almacenamiento. Sin senal no se puede avisar y no se insiste: para eso el bucket
   * tiene una regla que barre lo que quede a medias.
   */
  async cancelarFoto(fotoId: string): Promise<void> {
    if (!navigator.onLine) return;
    await this.transporte.cancelarFoto(fotoId);
  }

  /** Recalcula los contadores de pendientes desde el almacenamiento local. */
  async refrescarContadores(): Promise<void> {
    const [casos, fotos, bytes, detenidas] = await Promise.all([
      this.casos.contarPendientes(),
      this.fotos.contarPendientes(),
      this.fotos.bytesPendientes(),
      this.fotos.contarDetenidas()
    ]);
    this._casosPendientes.set(casos);
    this._fotosPendientes.set(fotos);
    this._bytesFotosPendientes.set(bytes);
    this._fotosDetenidas.set(detenidas);
  }

  /**
   * Relee las colas y, si la valvula de ahorro esta abierta, inicia una pasada.
   *
   * Es publico porque guardar un caso mientras el telefono YA esta en linea no emite
   * un evento `online`: el formulario avisa aqui que aparecio trabajo nuevo. La pasada
   * se lanza sin bloquear la navegacion ni la captura de la siguiente familia.
   */
  async revisarPendientes(
    permiteEnvioAutomatico = this.red.permiteEnvioAutomatico()
  ): Promise<void> {
    await this.refrescarContadores();
    if (this.convieneEnviarAutomaticamente(permiteEnvioAutomatico)) {
      void this.sincronizarAutomaticamente();
    }
  }

  /**
   * Ejecuta una pasada completa de la cola.
   *
   * Es idempotente y segura de invocar varias veces: si ya hay una pasada en curso,
   * retorna sin hacer nada.
   */
  async sincronizar(): Promise<ResultadoSincronizacion> {
    return this.ejecutarPasada(true);
  }

  /** La ruta automatica nunca revive elementos que ya agotaron sus intentos. */
  private async sincronizarAutomaticamente(): Promise<ResultadoSincronizacion> {
    return this.ejecutarPasada(false);
  }

  private async ejecutarPasada(
    reactivarDetenidas: boolean
  ): Promise<ResultadoSincronizacion> {
    const vacio: ResultadoSincronizacion = {
      casosEnviados: 0,
      casosFallidos: 0,
      fotosEnviadas: 0,
      fotosFallidas: 0,
      interrumpida: false
    };

    if (this.pasadaEnCurso) return vacio;

    if (!navigator.onLine) {
      this._enLinea.set(navigator.onLine);
      this._estado.set('sin_conexion');
      return { ...vacio, interrumpida: true };
    }

    // Se fija ANTES de la primera espera. Abrir la lista y recibir el evento `online`
    // pueden ocurrir juntos; si ambos alcanzaran disponible() con estado inactivo, se
    // abririan dos pasadas sobre la misma foto.
    this.pasadaEnCurso = true;
    this._estado.set('en_curso');
    this._ultimoError.set(null);

    try {
      if (!(await this.transporte.disponible())) {
        this._estado.set('sin_conexion');
        return { ...vacio, interrumpida: true };
      }

      // Una pasada automatica respeta el limite de intentos. La manual significa que
      // alguien decidio probar de nuevo —otra red, otra hora o una version corregida—
      // y por eso si devuelve a la cola lo que se habia detenido.
      if (reactivarDetenidas) {
        const revividas = await this.fotos.reactivarDetenidas();
        if (revividas > 0) {
          await this.refrescarContadores();
        }
      }

      const resultadoCasos = await this.enviarCasos();
      const resultadoFotos =
        resultadoCasos.interrumpida
          ? { enviadas: 0, fallidas: 0, interrumpida: resultadoCasos.interrumpida }
          : await this.enviarFotos();

      await this.refrescarContadores();
      this._ultimaSincronizacion.set(new Date().toISOString());
      // El estado mira las dos colas. Con solo la de casos, una pasada donde
      // fallaron todas las fotografias terminaba en verde.
      this._estado.set(
        resultadoCasos.interrumpida || resultadoFotos.fallidas > 0 ? 'error' : 'inactiva'
      );

      return {
        casosEnviados: resultadoCasos.enviados,
        casosFallidos: resultadoCasos.fallidos,
        fotosEnviadas: resultadoFotos.enviadas,
        fotosFallidas: resultadoFotos.fallidas,
        interrumpida: resultadoCasos.interrumpida || resultadoFotos.interrumpida
      };
    } catch (error) {
      this._estado.set('error');
      this._ultimoError.set(this.mensajeDeError(error));
      return { ...vacio, interrumpida: true };
    } finally {
      this.pasadaEnCurso = false;
    }
  }

  private async enviarCasos(): Promise<{
    enviados: number;
    fallidos: number;
    interrumpida: boolean;
  }> {
    const pendientes = await this.casos.pendientesDeSync();
    let enviados = 0;
    let fallidos = 0;

    for (const caso of pendientes) {
      const resultado = await this.transporte.enviarCaso(caso);

      if (resultado.exito) {
        await this.casos.marcarSync({
          casoId: caso.id,
          sincronizado: true,
          codigoAsignado: resultado.codigoAsignado
        });
        enviados++;
        this._casosPendientes.update((n) => Math.max(0, n - 1));
        continue;
      }

      await this.casos.marcarSync({
        casoId: caso.id,
        sincronizado: false,
        error: resultado.error
      });
      fallidos++;

      // Falla de red: la conexion se cayo a mitad de la cola. Se detiene aqui.
      if (resultado.reintentable) {
        this._ultimoError.set(resultado.error ?? 'Se perdio la conexion durante el envio.');
        return { enviados, fallidos, interrumpida: true };
      }
    }

    return { enviados, fallidos, interrumpida: false };
  }

  /**
   * Sube las fotografias CUYO CASO YA ESTA EN EL SERVIDOR.
   *
   * UNA FOTOGRAFIA NO VIAJA SOLA. En el servidor cuelga de la familia, asi que si el
   * caso todavia no llego, la API no tiene a que colgarla y responde que ese caso no
   * existe. Antes eso se descubria gastando: se pedia permiso, se subian bloques, se
   * recibia un rechazo, y la fotografia quedaba marcada como fallida. Al tercer intento
   * la cola dejaba de reintentarla — y esa foto ya no subia nunca, aunque su caso
   * llegara diez minutos despues.
   *
   * Eran las dos cosas a la vez: datos del voluntario gastados para nada, y evidencia
   * del dano de una vivienda perdida en silencio.
   *
   * Filtrarlas aqui no las retrasa. Los casos se envian ANTES en la misma pasada, de
   * modo que un caso que acaba de sincronizarse ya deja pasar sus fotografias.
   */
  private async enviarFotos(): Promise<{
    enviadas: number;
    fallidas: number;
    interrumpida: boolean;
  }> {
    const candidatas = await this.fotos.pendientesDeSync();
    const pendientes = await this.conCasoYaEnviado(candidatas);

    this._fotosEsperandoCaso.set(candidatas.length - pendientes.length);

    let enviadas = 0;
    let fallidas = 0;

    for (const foto of pendientes) {
      const resultado = await this.transporte.enviarFoto(foto, (avance) =>
        this._avanceFoto.set(avance)
      );

      if (resultado.exito) {
        await this.fotos.marcarSync({ fotoId: foto.id, urlRemota: resultado.urlRemota });
        enviadas++;
        this._fotosPendientes.update((n) => Math.max(0, n - 1));
        this._avanceFoto.set(null);
        continue;
      }

      fallidas++;

      // EL ERROR SE DICE. Antes solo los casos escribian aqui, asi que una
      // fotografia que no subia dejaba la pantalla igual que si no hubiera pasado
      // nada: el voluntario tocaba el boton, veia el mismo contador y no tenia como
      // saber si era la senal, el permiso o su telefono. Se descubrio probando en un
      // iPhone contra la nube, que es donde tenia que descubrirse.
      const viajo =
        resultado.bytesEnviados && resultado.bytesEnviados > 0
          ? ` Alcanzaron a viajar ${Math.round(resultado.bytesEnviados / 1024)} KB, que no hay que repetir.`
          : '';
      this._ultimoError.set(
        `No se pudo enviar una fotografia: ${resultado.error ?? 'fallo desconocido'}.${viajo}`
      );

      // Se anota DESPUES de poner el mensaje, y sin dejar que tumbe la pasada: si el
      // propio almacenamiento del telefono falla al escribir, el voluntario tiene que
      // ver igual por que no subio la foto.
      try {
        await this.fotos.marcarSync({ fotoId: foto.id, error: resultado.error });
      } catch (e) {
        this._ultimoError.update(
          (previo) => `${previo ?? ''} Ademas, este celular no pudo anotarlo: ${this.mensajeDeError(e)}`
        );
      }

      if (resultado.reintentable) {
        // El avance NO se limpia al fallar, y esa es la diferencia que se ve en la
        // pantalla: una subida por bloques que se corto en el cuarto de nueve dejo
        // hechos los tres primeros, y decirle al voluntario que no se envio nada seria
        // mentirle sobre datos que ya pago.
        return { enviadas, fallidas, interrumpida: true };
      }

      this._avanceFoto.set(null);
    }

    return { enviadas, fallidas, interrumpida: false };
  }

  /**
   * De estas fotografias, las que ya tienen su caso en el servidor.
   *
   * Se mira el codigo institucional y no el estado de la cola: el codigo lo asigna el
   * servidor y solo existe si el caso llego de verdad. Un caso marcado como
   * sincronizado sin codigo seria justo el estado inconsistente que no conviene creer.
   *
   * Los casos se consultan una vez cada uno aunque tengan tres fotografias: en un
   * telefono de gama baja, treinta lecturas de IndexedDB de mas se notan en el pulgar.
   */
  private async conCasoYaEnviado(fotos: FotoLocal[]): Promise<FotoLocal[]> {
    const casos = new Map<string, boolean>();

    for (const id of new Set(fotos.map((f) => f.casoId))) {
      const caso = await this.casos.obtener(id);
      casos.set(id, Boolean(caso?.codigo));
    }

    return fotos.filter((f) => casos.get(f.casoId));
  }

  /** Al volver la senal, casos y fotos salen solos salvo que ahorro de datos lo impida. */
  private alRecuperarConexion(): void {
    this._enLinea.set(true);
    void this.revisarPendientes();
  }

  /**
   * Si hay algo que enviar automaticamente ahora mismo.
   *
   * El ahorro de datos manda sobre todo lo demas. Es una peticion explicita de alguien
   * que esta cuidando su plan: con eso puesto no salen ni casos ni fotografias sin que
   * lo pida. El tipo de red no interviene; la peticion de campo fue que las fotografias
   * viajen apenas haya cualquier conexion.
   */
  private convieneEnviarAutomaticamente(permiteEnvioAutomatico: boolean): boolean {
    return (
      this._enLinea() &&
      !this.pasadaEnCurso &&
      this.totalPendientes() > 0 &&
      permiteEnvioAutomatico
    );
  }

  private mensajeDeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Error desconocido durante la sincronizacion.';
  }
}
