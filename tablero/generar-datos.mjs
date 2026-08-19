/**
 * Genera tablero/datos.geojson desde la vista publica de la base.
 *
 *   node tablero/generar-datos.mjs                 (usa DATABASE_URL)
 *   node tablero/generar-datos.mjs --inventado     (muestra, sin tocar la base)
 *
 * POR QUE EXISTE
 *
 * El tablero publico ya estaba hecho —mapa, contadores, filtros— pero leia un archivo
 * escrito a mano. Eso tuvo dos consecuencias: las cifras que se le muestran a una
 * entidad no salian del censo, y el archivo llego a contener el dato real de una
 * familia porque alguien lo escribio ahi para probar. Generarlo cierra las dos.
 *
 * LO QUE ESTE GUION NO DECIDE
 *
 * No elige que se publica: lee `v_mapa_publico`, que es donde el esquema ya decidio
 * que la coordenada va redondeada a tres decimales —unos 110 m— y que no salen ni
 * nombre, ni documento, ni telefono, ni fotografia. Si manana se decide mostrar menos,
 * se cambia la vista y esto no se entera. Esa separacion es deliberada: la regla de
 * privacidad vive en la base, donde se puede auditar, y no en un guion que alguien
 * puede editar antes de correrlo.
 *
 * SIGUE ABIERTA LA DECISION HU 2.1.1: hoy la vista entrega UNA FILA POR FAMILIA, no un
 * agregado. En una vereda con pocos hogares eso puede senalar a una casa. Mientras esa
 * decision no se tome, este guion avisa cuando un lugar tiene menos de tres registros.
 *
 * COMO CORRE EN PRODUCCION
 *
 * La base no es alcanzable desde ninguna maquina y eso es a proposito. Alla esto
 * corre dentro de la VPC, como la tarea de migraciones, y publica el archivo en el
 * bucket del tablero. Aqui corre contra el entorno local.
 *
 * Sin dependencias fuera de las que ya estan: `pg`, que la API ya usa.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DESTINO = fileURLToPath(new URL('./datos.geojson', import.meta.url));
const UMBRAL_ANONIMATO = 3;

/** Filas de muestra, claramente falsas, para trabajar en el tablero sin base. */
const INVENTADAS = [
  { codigo: 'RZ-2026-000001', zona: 'rural', municipio: 'Sevilla', lugar: 'Vereda Ficticia Uno',
    prioridad: 'p1', personas_total: 5, menores: 2, adultos_mayores: 1,
    afectacion: 'severo', habitable: false, lat: 4.271, lon: -75.941, fecha_registro: '2026-08-12' },
  { codigo: 'RZ-2026-000002', zona: 'urbana', municipio: 'Sevilla', lugar: 'Barrio Ficticio Dos',
    prioridad: 'p0', personas_total: 7, menores: 3, adultos_mayores: 0,
    afectacion: 'riesgo', habitable: false, lat: 4.266, lon: -75.936, fecha_registro: '2026-08-13' },
  { codigo: 'RZ-2026-000003', zona: 'rural', municipio: 'Sevilla', lugar: 'Vereda Ficticia Tres',
    prioridad: 'p2', personas_total: 3, menores: 0, adultos_mayores: 2,
    afectacion: 'moderado', habitable: true, lat: 4.279, lon: -75.948, fecha_registro: '2026-08-14' }
];

const inventado = process.argv.includes('--inventado');

/** Lee la vista publica. Nunca la tabla: la vista es la que ya quito la identidad. */
const leerDeLaBase = async () => {
  const { default: pg } = await import('pg');

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('Falta DATABASE_URL. Para una muestra sin base: --inventado');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const cliente = await pool.connect();
  try {
    // LO QUE SE PUBLICA SE LEE COMO ANONIMO, y esa es la unica linea de este archivo
    // que de verdad protege a alguien.
    //
    // No basta con leer la vista publica: quien corra esto puede tener permisos que
    // un visitante no tiene, y entonces el archivo saldria con mas de lo que el
    // esquema autoriza a mostrar. Poniendose en el rol `anon`, lo que llega aqui es
    // por construccion lo que cualquiera podria ver — y si manana alguien restringe
    // la vista, esto publica menos sin que nadie toque este guion.
    await cliente.query('set role anon');

    const { rows } = await cliente.query(`
      select codigo, zona, municipio, lugar, prioridad, personas_total,
             menores, adultos_mayores, afectacion, habitable, lat, lon, fecha_registro
        from v_mapa_publico
       order by fecha_registro desc, codigo desc`);

    // El conteo de casos sin coordenada NO se publica: es un aviso para quien mira el
    // tablero, y sale de la tabla, que el anonimo no alcanza. Por eso se vuelve al rol
    // de la conexion antes de pedirlo. Si ese rol tampoco la alcanza —la API corre con
    // politicas por fila— el numero llega en cero, que es un aviso de menos y nunca un
    // dato de mas.
    await cliente.query('reset role');

    const { rows: sin } = await cliente.query(`
      select count(*)::int as n from familias
       where lat is null and estado_verificacion <> 'duplicado'`);

    return { filas: rows, sinCoordenada: sin[0]?.n ?? 0 };
  } finally {
    cliente.release();
    await pool.end();
  }
};

const { filas, sinCoordenada } = inventado
  ? { filas: INVENTADAS, sinCoordenada: 1 }
  : await leerDeLaBase();

// Aviso, no bloqueo: quien publica decide. Bloquear aqui esconderia el problema en
// vez de mostrarlo, y la decision de que puede mostrar el mapa no es de este guion.
const porLugar = new Map();
for (const f of filas) porLugar.set(f.lugar, (porLugar.get(f.lugar) ?? 0) + 1);
const expuestos = [...porLugar.entries()].filter(([, n]) => n < UMBRAL_ANONIMATO);

/** Fecha sola, sin hora: la base devuelve `date` como objeto y el tablero la pinta. */
const soloFecha = (valor) =>
  valor instanceof Date ? valor.toISOString().slice(0, 10) : (valor ?? null);

const geojson = {
  type: 'FeatureCollection',
  corte: soloFecha(filas[0]?.fecha_registro),
  sin_coordenada: sinCoordenada,
  datos: inventado
    ? 'INVENTADOS. Ninguna fila corresponde a una familia real.'
    : 'Generado desde v_mapa_publico. Sin nombre, documento, telefono ni fotografia.',
  nota:
    'Una fila por afectacion, con la coordenada redondeada a 3 decimales (~110 m). ' +
    'Ubica la afectacion, no la vivienda.',
  features: filas.map((f) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(f.lon), Number(f.lat)] },
    properties: {
      codigo: f.codigo,
      zona: f.zona,
      municipio: f.municipio,
      lugar: f.lugar,
      prioridad: f.prioridad,
      personas_total: f.personas_total,
      menores: f.menores,
      adultos_mayores: f.adultos_mayores,
      afectacion: f.afectacion,
      habitable: f.habitable,
      fecha_registro: soloFecha(f.fecha_registro)
    }
  }))
};

await writeFile(DESTINO, `${JSON.stringify(geojson, null, 2)}\n`, 'utf8');

console.log(`tablero/datos.geojson: ${filas.length} afectaciones, ${sinCoordenada} sin coordenada`);

if (expuestos.length > 0) {
  console.log('');
  console.log(`AVISO: ${expuestos.length} lugar(es) con menos de ${UMBRAL_ANONIMATO} registros.`);
  console.log('En un lugar con pocos hogares, una fila por familia puede senalar una casa.');
  console.log('Es la decision HU 2.1.1 y sigue abierta:');
  for (const [lugar, n] of expuestos) console.log(`  ${lugar}: ${n}`);
}
