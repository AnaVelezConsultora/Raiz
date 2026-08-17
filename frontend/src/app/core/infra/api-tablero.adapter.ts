import { Injectable } from '@angular/core';
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
    if (!environment.apiUrl) return [];

    const r = await fetch(`${environment.apiUrl}/casos`, {
      headers: {
        Accept: 'application/json',
        ...(this.token() ? { Authorization: `Bearer ${this.token()}` } : {})
      },
      signal: AbortSignal.timeout(ApiTableroAdapter.ESPERA_MS)
    });

    if (!r.ok) {
      const detalle = await r.json().catch(() => ({}));
      throw new Error(detalle.mensaje ?? `El servidor respondio ${r.status}.`);
    }

    return (await r.json()) as ResumenTablero[];
  }

  private token(): string | null {
    try {
      return localStorage.getItem('raiz.token');
    } catch {
      return null;
    }
  }
}
