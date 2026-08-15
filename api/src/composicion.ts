import type { Pool } from 'pg';
import { CASO_REPOSITORIO, type CasoRepositorioPort } from './dominio/puertos';
import { PostgresCasoRepositorio } from './infra/postgres/postgres-caso.repositorio';

export { CASO_REPOSITORIO };
export { PostgresCasoRepositorio };
export * from './dominio/puertos';

/**
 * Fabrica para pruebas del repositorio propio.
 * La API Nest usa ComposicionModule, no este archivo.
 */
export function crearCasoRepositorio(pool: Pool): CasoRepositorioPort {
  return new PostgresCasoRepositorio(pool);
}
