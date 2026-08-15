import { Pool } from 'pg';

/**
 * Un solo pool por proceso. La API se conecta como `raiz_api` (sin privilegios
 * propios) y por peticion hace SET LOCAL ROLE authenticated. Ver entorno/.env.example.
 */
export function crearPool(databaseUrl = process.env['DATABASE_URL']): Pool {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL no esta definida. Copie entorno/.env.example o levante el entorno local.'
    );
  }

  return new Pool({
    connectionString: databaseUrl,
    // Suficiente para desarrollo local; en produccion lo fija la plataforma.
    max: 10
  });
}
