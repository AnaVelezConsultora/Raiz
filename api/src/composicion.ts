/**
 * Punto de composicion del servidor (equivalente a app.config.ts de la PWA).
 *
 * Aqui, y solo aqui, se enlazan las implementaciones concretas a los puertos.
 * HU 1.2.2/1.2.3 agregaran el modulo Nest; mientras tanto el repositorio se
 * puede usar y probar directamente.
 */
import type { Pool } from 'pg';
import { CASO_REPOSITORIO, type CasoRepositorioPort } from './dominio/puertos';
import { crearPool } from './infra/postgres/pool';
import { PostgresCasoRepositorio } from './infra/postgres/postgres-caso.repositorio';

export { CASO_REPOSITORIO };
export { crearPool };
export { PostgresCasoRepositorio };
export * from './dominio/puertos';

export function crearCasoRepositorio(pool?: Pool): CasoRepositorioPort {
  return new PostgresCasoRepositorio(pool ?? crearPool());
}
