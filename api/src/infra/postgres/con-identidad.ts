import type { Pool, PoolClient } from 'pg';
import type { Identidad } from '../../dominio/puertos';

/**
 * Ejecuta trabajo dentro de una transaccion con la identidad del solicitante.
 *
 * Es el contrato de HU 1.2.3 en miniatura: set_config local a la transaccion +
 * SET LOCAL ROLE authenticated. Asi las 19 politicas RLS corren sin que el
 * repositorio decida autorizaciones a mano, y una conexion reutilizada del pool
 * no arrastra al usuario anterior.
 */
export async function conIdentidad<T>(
  pool: Pool,
  identidad: Identidad,
  trabajo: (cliente: PoolClient) => Promise<T>
): Promise<T> {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');
    await cliente.query(`SELECT set_config('app.user_id', $1, true)`, [identidad.sub]);
    await cliente.query('SET LOCAL ROLE authenticated');

    const resultado = await trabajo(cliente);

    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      // Si BEGIN no llego a ejecutarse, ROLLBACK falla: no enmascara el error original.
    }
    throw error;
  } finally {
    cliente.release();
  }
}
