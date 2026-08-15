import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { casoAFilas } from './caso-a-fila';
import { casoDePrueba } from './caso-de-prueba';

describe('casoAFilas', () => {
  test('con consentimiento conserva la identidad', () => {
    const filas = casoAFilas(casoDePrueba('11111111-1111-4111-8111-111111111111'));

    assert.equal(filas.familia.jefe_nombres, 'Familia');
    assert.equal(filas.familia.num_doc, '1000000999');
    assert.equal(filas.familia.origen_id, '11111111-1111-4111-8111-111111111111');
    assert.ok(filas.vivienda);
    assert.ok(filas.produccion);
  });

  test('sin consentimiento retira identidad y no inventa codigo', () => {
    const origenId = '22222222-2222-4222-8222-222222222222';
    const caso = casoDePrueba(origenId, {
      control: {
        ...casoDePrueba(origenId).control,
        consentimiento: false
      }
    });

    const filas = casoAFilas(caso);

    assert.equal(filas.familia.jefe_nombres, null);
    assert.equal(filas.familia.jefe_apellidos, null);
    assert.equal(filas.familia.tipo_doc, null);
    assert.equal(filas.familia.num_doc, null);
    // Telefono: decision pendiente F7 (H7). Hoy viaja.
    assert.equal(filas.familia.tel_1, '3000000999');
    assert.equal(filas.familia.consentimiento, false);
  });
});
