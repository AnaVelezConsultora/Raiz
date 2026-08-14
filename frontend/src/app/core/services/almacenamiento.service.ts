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
  private readonly _estado = signal<EstadoPersistencia>('desconocido');
  private readonly _uso = signal<UsoAlmacenamiento | null>(null);

  readonly estado = this._estado.asReadonly();
  readonly uso = this._uso.asReadonly();

  /** True cuando el navegador puede borrar los casos sin sincronizar. */
  readonly enRiesgoDeDesalojo = computed(() => this._estado() === 'desalojable');

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
        return true;
      }

      const concedida = await navigator.storage.persist();
      this._estado.set(concedida ? 'persistente' : 'desalojable');
      return concedida;
    } catch {
      this._estado.set('desconocido');
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
        disponible: quota,
        porcentaje: quota > 0 ? Math.round((usage / quota) * 100) : 0
      };
      this._uso.set(uso);
      return uso;
    } catch {
      return null;
    }
  }

  /** Formatea bytes para mostrarlos a un voluntario, no a un ingeniero. */
  formatear(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
