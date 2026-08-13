import { Injectable, signal } from '@angular/core';
import { FuenteCoordenada } from '../domain/enums';

/** Coordenada capturada por el dispositivo. */
export interface Coordenada {
  lat: number;
  lon: number;
  precisionM: number;
  fuente: FuenteCoordenada;
  capturadaEn: string;
}

/** Parametros de la captura de coordenada. */
export interface OpcionesCaptura {
  /** Precision aceptable en metros. Por debajo de este valor se acepta la lectura. */
  precisionObjetivoM: number;
  /** Tiempo maximo de espera en milisegundos. */
  timeoutMs: number;
}

/** Estado observable de la captura, para que la interfaz muestre el progreso. */
export type EstadoGps = 'inactivo' | 'buscando' | 'listo' | 'denegado' | 'error';

/**
 * Captura de coordenadas del dispositivo.
 *
 * PUNTO CLAVE PARA CAMPO: el GPS del celular usa satelite y NO requiere internet.
 * Lo que si requiere internet es la carga de mapas, que es distinto. Un voluntario
 * en una vereda sin senal puede capturar coordenada perfectamente.
 *
 * La estrategia es watchPosition y no getCurrentPosition: la primera lectura suele
 * llegar con precision de cientos de metros (triangulacion) y va mejorando conforme
 * el receptor fija satelites. Se conserva la mejor lectura y se resuelve cuando
 * alcanza la precision objetivo o se agota el tiempo.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class GeolocalizacionService {
  private static readonly OPCIONES_POR_DEFECTO: OpcionesCaptura = {
    precisionObjetivoM: 20,
    timeoutMs: 45_000
  };

  /** Estado de la captura en curso. */
  readonly estado = signal<EstadoGps>('inactivo');

  /** Mejor precision alcanzada durante la captura en curso, en metros. */
  readonly precisionActual = signal<number | null>(null);

  readonly soportado = 'geolocation' in navigator;

  /**
   * Captura la coordenada mas precisa que logre en el tiempo disponible.
   *
   * @param opciones Precision objetivo y tiempo maximo de espera.
   * @returns La mejor coordenada obtenida, o null si el usuario nego el permiso
   *          o no hubo ninguna lectura en el tiempo disponible.
   */
  async capturar(opciones: Partial<OpcionesCaptura> = {}): Promise<Coordenada | null> {
    if (!this.soportado) {
      this.estado.set('error');
      return null;
    }

    const config: OpcionesCaptura = {
      ...GeolocalizacionService.OPCIONES_POR_DEFECTO,
      ...opciones
    };

    this.estado.set('buscando');
    this.precisionActual.set(null);

    return new Promise<Coordenada | null>((resolve) => {
      let mejor: Coordenada | null = null;
      let watchId: number | null = null;

      const finalizar = (resultado: Coordenada | null): void => {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        clearTimeout(temporizador);
        this.estado.set(resultado ? 'listo' : 'error');
        resolve(resultado);
      };

      const temporizador = setTimeout(() => finalizar(mejor), config.timeoutMs);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lectura = this.aCoordenada(pos);
          this.precisionActual.set(lectura.precisionM);

          if (mejor === null || lectura.precisionM < mejor.precisionM) {
            mejor = lectura;
          }
          if (lectura.precisionM <= config.precisionObjetivoM) {
            finalizar(mejor);
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            this.estado.set('denegado');
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            clearTimeout(temporizador);
            resolve(null);
            return;
          }
          // POSITION_UNAVAILABLE y TIMEOUT no son terminales: el receptor puede
          // fijar satelites unos segundos despues. Se deja correr el temporizador.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: config.timeoutMs }
      );
    });
  }

  /** Cancela la captura en curso. */
  cancelar(): void {
    this.estado.set('inactivo');
    this.precisionActual.set(null);
  }

  private aCoordenada(pos: GeolocationPosition): Coordenada {
    return {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      precisionM: Math.round(pos.coords.accuracy),
      fuente: FuenteCoordenada.Sitio,
      capturadaEn: new Date(pos.timestamp).toISOString()
    };
  }
}
