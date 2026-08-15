import { Injectable, computed, signal } from '@angular/core';

/** Estado del almacenamiento local frente al desalojo del navegador. */
export type EstadoPersistencia =
  | 'desconocido'
  | 'persistente'
  | 'desalojable'
  | 'no_soportado';

/** Consumo de almacenamiento del sitio, en bytes. */
export interface UsoAlmacenamiento {
  usado: number;
  disponible: number;
  cuota: number;
  porcentaje: number;
}

/**
 * Persistencia del almacenamiento local.
 *
 * EL PROBLEMA QUE RESUELVE: por defecto, IndexedDB es de categoria "best effort".
 * Cuando el dispositivo se queda sin espacio, el navegador desaloja datos de sitios
 * sin marca de persistencia, SIN avisar y SIN pedir permiso.
 *
 * En una aplicacion cuyo valor entero es guardar casos sin conexion, eso significa
 * que el sistema operativo puede borrar el trabajo de una jornada completa antes de
 * que el voluntario llegue a donde hay senal. Es el peor fallo posible aqui: no da
 * error, no deja rastro, y el voluntario concluye que la aplicacion perdio sus datos.
 *
 * `navigator.storage.persist()` marca el almacenamiento como persistente y lo saca
 * de la lista de desalojo automatico.
 *
 * ESTRATEGIA DE SOLICITUD: los navegadores conceden la persistencia segun senales de
 * uso real; una peticion en el primer segundo de la primera visita suele negarse.
 * Por eso se pide al arrancar y, si la niegan, se vuelve a pedir cuando el voluntario
 * guarda su primer caso: para entonces ya hay interaccion suficiente y la concesion
 * es mucho mas probable.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class AlmacenamientoService {
  /** Se avisa con margen: una captura puede necesitar varios MB temporales. */
  static readonly UMBRAL_PORCENTAJE = 90;
  static readonly MARGEN_MINIMO_BYTES = 50 * 1024 * 1024;

  private readonly _estado = signal<EstadoPersistencia>('desconocido');
  private readonly _uso = signal<UsoAlmacenamiento | null>(null);

  readonly estado = this._estado.asReadonly();
  readonly uso = this._uso.asReadonly();

  /** True cuando el navegador puede borrar los casos sin sincronizar. */
  readonly enRiesgoDeDesalojo = computed(() => this._estado() === 'desalojable');
  readonly espacioBajo = computed(() => {
    const uso = this._uso();
    return uso !== null &&
      (uso.porcentaje >= AlmacenamientoService.UMBRAL_PORCENTAJE ||
        uso.disponible <= AlmacenamientoService.MARGEN_MINIMO_BYTES);
  });

  readonly avisoEspacio = computed(() => {
    const uso = this._uso();
    if (!uso || !this.espacioBajo()) return '';
    return `Quedan ${this.formatear(uso.disponible)} en el celular. Libere espacio ` +
      'antes de tomar otra foto para no perder lo capturado.';
  });

  private readonly soportado =
    typeof navigator !== 'undefined' && navigator.storage !== undefined;

  /**
   * Pide al navegador que no desaloje los datos de este sitio.
   *
   * Es idempotente: si ya esta concedida, no vuelve a pedirla.
   *
   * @returns true si el almacenamiento quedo protegido.
   */
  async asegurarPersistencia(): Promise<boolean> {
    if (!this.soportado || typeof navigator.storage.persist !== 'function') {
      this._estado.set('no_soportado');
      return false;
    }

    try {
      if (await navigator.storage.persisted()) {
        this._estado.set('persistente');
        console.info('[Raíz] cuota persistente ya concedida');
        return true;
      }

      const concedida = await navigator.storage.persist();
      this._estado.set(concedida ? 'persistente' : 'desalojable');
      console.info(`[Raíz] solicitud de cuota persistente: ${concedida ? 'concedida' : 'denegada'}`);
      return concedida;
    } catch (error) {
      this._estado.set('desconocido');
      console.warn('[Raíz] no se pudo solicitar cuota persistente', error);
      return false;
    }
  }

  /** Consulta cuanto espacio ocupa la base local y cuanto queda disponible. */
  async medirUso(): Promise<UsoAlmacenamiento | null> {
    if (!this.soportado || typeof navigator.storage.estimate !== 'function') return null;

    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const uso: UsoAlmacenamiento = {
        usado: usage,
        disponible: Math.max(0, quota - usage),
        cuota: quota,
        porcentaje: quota > 0 ? Math.round((usage / quota) * 100) : 0
      };
      this._uso.set(uso);
      return uso;
    } catch {
      return null;
    }
  }

  /** Vigila la cuota mientras la pantalla está abierta y al volver del segundo plano. */
  vigilar(): void {
    if (!this.soportado) return;
    void this.medirUso();
    window.setInterval(() => void this.medirUso(), 30_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.medirUso();
    });
  }

  /** Formatea bytes para mostrarlos a un voluntario, no a un ingeniero. */
  formatear(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
