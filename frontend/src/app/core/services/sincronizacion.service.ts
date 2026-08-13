import { Injectable, computed, inject, signal } from '@angular/core';
import { CASO_STORAGE, FOTO_STORAGE, SINCRONIZACION } from '../domain/ports';

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

  private readonly _estado = signal<EstadoSincronizacion>('inactiva');
  private readonly _casosPendientes = signal(0);
  private readonly _fotosPendientes = signal(0);
  private readonly _ultimoError = signal<string | null>(null);
  private readonly _ultimaSincronizacion = signal<string | null>(null);
  private readonly _enLinea = signal(navigator.onLine);

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

  constructor() {
    window.addEventListener('online', () => this.alRecuperarConexion());
    window.addEventListener('offline', () => {
      this._enLinea.set(false);
      this._estado.set('sin_conexion');
    });
    void this.refrescarContadores();
  }

  /** Recalcula los contadores de pendientes desde el almacenamiento local. */
  async refrescarContadores(): Promise<void> {
    const [casos, fotos] = await Promise.all([
      this.casos.contarPendientes(),
      this.fotos.contarPendientes()
    ]);
    this._casosPendientes.set(casos);
    this._fotosPendientes.set(fotos);
  }

  /**
   * Ejecuta una pasada completa de la cola.
   *
   * Es idempotente y segura de invocar varias veces: si ya hay una pasada en curso,
   * retorna sin hacer nada.
   */
  async sincronizar(): Promise<ResultadoSincronizacion> {
    const vacio: ResultadoSincronizacion = {
      casosEnviados: 0,
      casosFallidos: 0,
      fotosEnviadas: 0,
      fotosFallidas: 0,
      interrumpida: false
    };

    if (this._estado() === 'en_curso') return vacio;

    if (!navigator.onLine || !(await this.transporte.disponible())) {
      this._enLinea.set(navigator.onLine);
      this._estado.set('sin_conexion');
      return { ...vacio, interrumpida: true };
    }

    this._estado.set('en_curso');
    this._ultimoError.set(null);

    try {
      const resultadoCasos = await this.enviarCasos();
      const resultadoFotos = resultadoCasos.interrumpida
        ? { enviadas: 0, fallidas: 0, interrumpida: true }
        : await this.enviarFotos();

      await this.refrescarContadores();
      this._ultimaSincronizacion.set(new Date().toISOString());
      this._estado.set(resultadoCasos.interrumpida ? 'error' : 'inactiva');

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

  private async enviarFotos(): Promise<{
    enviadas: number;
    fallidas: number;
    interrumpida: boolean;
  }> {
    const pendientes = await this.fotos.pendientesDeSync();
    let enviadas = 0;
    let fallidas = 0;

    for (const foto of pendientes) {
      const resultado = await this.transporte.enviarFoto(foto);

      if (resultado.exito) {
        await this.fotos.marcarSync({ fotoId: foto.id, urlRemota: resultado.urlRemota });
        enviadas++;
        this._fotosPendientes.update((n) => Math.max(0, n - 1));
        continue;
      }

      await this.fotos.marcarSync({ fotoId: foto.id, error: resultado.error });
      fallidas++;

      if (resultado.reintentable) {
        return { enviadas, fallidas, interrumpida: true };
      }
    }

    return { enviadas, fallidas, interrumpida: false };
  }

  private alRecuperarConexion(): void {
    this._enLinea.set(true);
    this._estado.set('inactiva');
    // No se sincroniza solo: en zona rural la senal aparece y desaparece, y un envio
    // automatico consume los datos del voluntario sin que el lo decida. El boton
    // "Sincronizar" es explicito y muestra cuantos elementos hay pendientes.
    void this.refrescarContadores();
  }

  private mensajeDeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Error desconocido durante la sincronizacion.';
  }
}
