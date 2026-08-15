import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { Pool } from 'pg';
import { ErrorRechazo, ErrorSesion } from '../../dominio/puertos';
import { casoDePrueba } from './caso-de-prueba';
import { PostgresCasoRepositorio } from './postgres-caso.repositorio';

/**
 * HU 1.2.4 — Que un corte de senal no duplique a una familia.
 *
 * Requiere el entorno local (`cd entorno && make arriba`). Si la base no
 * responde, se omiten las pruebas para no romper el build de quien solo
 * trabaja el frontend.
 */

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://raiz_api:raiz_local@localhost:5432/raiz';

const ADMIN_URL =
  process.env['DATABASE_ADMIN_URL'] ?? 'postgres://postgres:postgres@localhost:5432/raiz';

describe('PostgresCasoRepositorio.registrar (HU 1.2.4)', () => {
  let pool: Pool;
  let admin: Pool;
  let repo: PostgresCasoRepositorio;
  let subAna: string;
  let subBeto: string;
  let disponible = false;
  let origenId: string;

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    admin = new Pool({ connectionString: ADMIN_URL });

    try {
      await admin.query('SELECT 1');
      disponible = true;
    } catch {
      disponible = false;
      return;
    }

    subAna = randomUUID();
    subBeto = randomUUID();
    origenId = randomUUID();

    await admin.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES
         ($1, $2, '{"nombre":"Ana Prueba HU124"}'::jsonb),
         ($3, $4, '{"nombre":"Beto Prueba HU124"}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        subAna,
        `ana-hu124-${subAna.slice(0, 8)}@ejemplo.test`,
        subBeto,
        `beto-hu124-${subBeto.slice(0, 8)}@ejemplo.test`
      ]
    );

    repo = new PostgresCasoRepositorio(pool);
  });

  after(async () => {
    if (disponible) {
      await admin.query(`DELETE FROM familias WHERE origen_id = $1::uuid`, [origenId]);
      await admin.query(`DELETE FROM perfiles WHERE id = ANY($1::uuid[])`, [[subAna, subBeto]]);
      await admin.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [[subAna, subBeto]]);
    }
    await Promise.allSettled([pool?.end(), admin?.end()]);
  });

  test('reintento conserva codigo RZ, una sola fila, y nadie mas puede firmarlo', async (t) => {
    if (!disponible) {
      t.skip('Base local no disponible. Levante con: cd entorno && make arriba');
      return;
    }

    const caso = casoDePrueba(origenId);

    const primero = await repo.registrar(caso, { sub: subAna });
    assert.match(primero.codigo, /^RZ-\d{4}-\d{6}$/);
    assert.equal(primero.origenId, origenId);
    assert.equal(primero.yaExistia, false);

    // Senal perdida: el dispositivo reenvia el mismo origenId.
    const reintento = await repo.registrar(
      casoDePrueba(origenId, {
        hogar: { ...caso.hogar, personasTotal: 5, tel1: '3000000888' }
      }),
      { sub: subAna }
    );

    assert.equal(reintento.codigo, primero.codigo, 'el reintento no debe cambiar el codigo');
    assert.equal(reintento.yaExistia, true);

    const conteo = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM familias WHERE origen_id = $1::uuid`,
      [origenId]
    );
    assert.equal(conteo.rows[0]?.n, '1', 'debe haber una sola familia');

    const fila = await admin.query<{
      personas_total: number;
      tel_1: string;
      registrador_perfil_id: string;
    }>(
      `SELECT personas_total, tel_1, registrador_perfil_id::text
         FROM familias WHERE origen_id = $1::uuid`,
      [origenId]
    );
    assert.equal(fila.rows[0]?.personas_total, 5);
    assert.equal(fila.rows[0]?.tel_1, '3000000888');
    assert.equal(fila.rows[0]?.registrador_perfil_id, subAna);

    // Beto no puede apropiarse del origen_id de Ana.
    await assert.rejects(
      () =>
        repo.registrar(
          casoDePrueba(origenId, {
            control: { ...caso.control, registradorNombre: 'Beto intentando firmar' }
          }),
          { sub: subBeto }
        ),
      (error: unknown) => error instanceof ErrorRechazo || error instanceof ErrorSesion
    );

    const dueno = await admin.query<{ registrador_perfil_id: string }>(
      `SELECT registrador_perfil_id::text FROM familias WHERE origen_id = $1::uuid`,
      [origenId]
    );
    assert.equal(dueno.rows[0]?.registrador_perfil_id, subAna);
  });
});
