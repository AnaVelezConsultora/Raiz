import { Injectable } from '@angular/core';
import type { PuntoEnTablero, PuntoRegistrado, PuntoServicio } from '@raiz/dominio';
import { ResumenTablero } from '../domain/caso.model';
import { TableroPort } from '../domain/ports';
import { environment } from '../../../environments/environment';

/**
 * Consulta de casos contra la API.
 *
 * Implementa {@link TableroPort}. A diferencia de la cola de sincronizacion, esto NO
 * reintenta ni guarda nada: si no hay senal, no hay tablero. Es una pantalla de
 * escritorio en el pueblo, no una herramienta de vereda, y fingir que funciona sin
 * conexion seria mostrar cifras viejas sin decirlo — que en una reunion con una
 * entidad es peor que no mostrar nada.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class ApiTableroAdapter implements TableroPort {
  /** Una consulta de tablero no se queda colgada mas de esto. */
  private static readonly ESPERA_MS = 20_000;

  async listarCasos(): Promise<ResumenTablero[]> {
    return this.pedir<ResumenTablero[]>('/casos', []);
  }

  async listarPuntos(): Promise<PuntoEnTablero[]> {
    return this.pedir<PuntoEnTablero[]>('/puntos', []);
  }

  /**
   * Manda un punto de servicio.
   *
   * El servidor responde 200 tanto si lo creo como si lo actualizo, y `yaExistia`
   * distingue los dos casos. No es 201 a proposito: el envio es idempotente por el
   * identificador que genero el dispositivo, igual que el de casos.
   */
  async registrarPunto(punto: PuntoServicio): Promise<PuntoRegistrado> {
    if (!environment.apiUrl) {
      throw new Error('No hay servidor configurado.');
    }

    return this.pedir<PuntoRegistrado>('/puntos', null, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(punto)
    });
  }

  /**
   * Una llamada a la API con la sesion puesta y un mensaje decente si falla.
   *
   * `vacio` es lo que se devuelve cuando no hay servidor configurado —el caso de la
   * demostracion sin backend—; si es null, la falta de servidor es un error. Un
   * listado puede estar vacio sin drama, pero un envio que no llega a ninguna parte
   * NO puede parecer exitoso.
   */
  private async pedir<T>(ruta: string, vacio: T | null, opciones: RequestInit = {}): Promise<T> {
    if (!environment.apiUrl) {
      if (vacio !== null) return vacio;
      throw new Error('No hay servidor configurado.');
    }

    const r = await fetch(`${environment.apiUrl}${ruta}`, {
      ...opciones,
      headers: {
        Accept: 'application/json',
        ...(opciones.headers ?? {}),
        ...(this.token() ? { Authorization: `Bearer ${this.token()}` } : {})
      },
      signal: AbortSignal.timeout(ApiTableroAdapter.ESPERA_MS)
    });

    if (!r.ok) {
      const detalle = await r.json().catch(() => ({}));
      throw new Error(detalle.mensaje ?? `El servidor respondio ${r.status}.`);
    }

    return (await r.json()) as T;
  }

  private token(): string | null {
    try {
      return localStorage.getItem('raiz.token');
    } catch {
      return null;
    }
  }
}
