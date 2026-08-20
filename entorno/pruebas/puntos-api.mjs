/**
 * Ciclo completo de un punto de servicio contra la API viva.
 *
 * LO QUE DE VERDAD SE COMPRUEBA AQUI no es que el POST devuelva 200, sino las tres
 * cosas de las que depende que el registro sirva para algo:
 *
 *   1. Que las DOS CIFRAS de hogares se calculen por separado y no se contaminen. Es
 *      la decision central del diseno y la unica que, si falla, produce un numero que
 *      nadie puede defender delante de una entidad.
 *   2. Que el nivel de verificacion lo derive el SERVIDOR del origen declarado, y que
 *      no se pueda mandar desde el cliente. Si se pudiera, cualquiera marcaria como
 *      «validado por una entidad» algo que le contaron por telefono.
 *   3. Que reenviar el mismo punto no cree un segundo tubo roto.
 *
 * Se ejecuta contra la base local y limpia lo suyo al terminar, para que el orden en
 * que se corran las pruebas no cambie el resultado de ninguna.
 */
import { randomUUID } from 'node:crypto';

const API = process.env.API ?? 'http://localhost:3052';
const CORREO = process.env.CORREO ?? 'coordinadora@ejemplo.test';
const CLAVE = process.env.CLAVE ?? 'Raiz.local.2026';

let fallos = 0;

function comprobar(descripcion, condicion, detalle = '') {
  const marca = condicion ? 'OK  ' : 'FALLO';
  if (!condicion) fallos++;
  console.log(`${marca} ${descripcion}${detalle ? ` -- ${detalle}` : ''}`);
}

async function pedir(ruta, opciones = {}, token = null) {
  const cabeceras = { 'Content-Type': 'application/json', ...(opciones.headers ?? {}) };
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  const respuesta = await fetch(`${API}${ruta}`, { ...opciones, headers: cabeceras });
  const texto = await respuesta.text();
  const cuerpo = texto ? JSON.parse(texto) : null;
  return { estado: respuesta.status, cuerpo };
}

// --- sesion ------------------------------------------------------------------
const sesion = await pedir('/sesion', {
  method: 'POST',
  body: JSON.stringify({ correo: CORREO, clave: CLAVE })
});
comprobar('la coordinadora entra', sesion.estado === 200, `estado ${sesion.estado}`);
const token = sesion.cuerpo?.token;
if (!token) {
  console.error('Sin token no hay nada que probar.');
  process.exit(1);
}

// --- de que veredas hay familias registradas ---------------------------------
// La prueba no inventa veredas: lee las que el censo local ya tiene, para que el cruce
// se compruebe contra datos reales de la base y no contra una coincidencia armada.
const casos = await pedir('/casos', {}, token);
const veredasConCasos = [...new Set(casos.cuerpo.map((c) => c.lugar).filter(Boolean))];
comprobar(
  'hay al menos una vereda con casos para cruzar',
  veredasConCasos.length > 0,
  `${veredasConCasos.length} vereda(s)`
);

const veredaReal = veredasConCasos[0];
const hogaresEnEsaVereda = casos.cuerpo.filter((c) => c.lugar === veredaReal).length;

// --- alta de un punto que sirve a esa vereda ---------------------------------
const id = randomUUID();
const punto = {
  id,
  codigo: null,
  tipo: 'acueducto',
  nombre: `Acueducto de prueba ${id.slice(0, 8)}`,
  ubicacion: {
    departamento: 'Valle del Cauca',
    municipio: 'Sevilla',
    zona: 'rural',
    // Escrito CON prefijo y en mayusculas a proposito: si la normalizacion no
    // funciona, el cruce devuelve cero y la prueba lo caza.
    vereda: `VEREDA ${veredaReal.toUpperCase()}`,
    direccionRef: 'Sobre la via principal',
    lat: 4.2705,
    lon: -75.9345
  },
  estadoServicio: 'fuera_servicio',
  descripcionAfectacion: 'Bocatoma colapsada por el deslizamiento',
  requiere: 'Reposicion de 300 metros de tuberia y limpieza de bocatoma',
  hogaresEstimados: 180,
  veredasServidas: [],
  // Lo vio quien registra: el servidor debe derivar r2, no r0 y no r5.
  origenDato: 'observado',
  registradorNombre: 'Prueba automatica',
  fechaRegistro: new Date().toISOString().slice(0, 10)
};

const alta = await pedir('/puntos', { method: 'POST', body: JSON.stringify(punto) }, token);
comprobar('el punto se registra', alta.estado === 200, `estado ${alta.estado}`);
comprobar('el servidor asigna consecutivo PS-', /^PS-\d{4}-\d{4}$/.test(alta.cuerpo?.codigo ?? ''), alta.cuerpo?.codigo);
comprobar('el punto es nuevo', alta.cuerpo?.yaExistia === false);

// --- idempotencia ------------------------------------------------------------
const reenvio = await pedir('/puntos', { method: 'POST', body: JSON.stringify(punto) }, token);
comprobar('el reenvio no crea un segundo punto', reenvio.cuerpo?.yaExistia === true);
comprobar('y devuelve el mismo consecutivo', reenvio.cuerpo?.codigo === alta.cuerpo?.codigo);

// --- las dos cifras ----------------------------------------------------------
const listado = await pedir('/puntos', {}, token);
const guardado = listado.cuerpo.find((p) => p.codigo === alta.cuerpo.codigo);
comprobar('el punto aparece en el listado', Boolean(guardado));

comprobar(
  'lo estimado por el lider se conserva tal cual',
  guardado?.hogaresEstimados === 180,
  String(guardado?.hogaresEstimados)
);
comprobar(
  'lo registrado se calcula contra el censo, no se declara',
  guardado?.hogaresRegistrados === hogaresEnEsaVereda,
  `esperado ${hogaresEnEsaVereda}, obtenido ${guardado?.hogaresRegistrados}`
);
comprobar(
  'las dos cifras son distintas y ninguna piso a la otra',
  guardado?.hogaresEstimados !== guardado?.hogaresRegistrados
);
comprobar(
  'la vereda se guardo entre las servidas aunque llego vacia la lista',
  (guardado?.veredasServidas ?? []).length === 1,
  JSON.stringify(guardado?.veredasServidas)
);

// --- el nivel lo pone el servidor -------------------------------------------
comprobar(
  'origen observado deriva nivel r2 en el servidor',
  guardado?.nivelVerificacion === 'r2_verificado_presencial',
  guardado?.nivelVerificacion
);

const mentiroso = {
  ...punto,
  id: randomUUID(),
  nombre: `Punto que se cree validado ${Date.now()}`,
  origenDato: 'tercero',
  nivelVerificacion: 'r5_validado_institucional'
};
const altaMentirosa = await pedir(
  '/puntos',
  { method: 'POST', body: JSON.stringify(mentiroso) },
  token
);
const listado2 = await pedir('/puntos', {}, token);
const guardadoMentiroso = listado2.cuerpo.find((p) => p.codigo === altaMentirosa.cuerpo.codigo);
comprobar(
  'un cliente NO puede declararse validado institucionalmente',
  guardadoMentiroso?.nivelVerificacion === 'r1_reportado_tercero',
  guardadoMentiroso?.nivelVerificacion
);

// --- lo que no se acepta -----------------------------------------------------
const invalido = await pedir(
  '/puntos',
  { method: 'POST', body: JSON.stringify({ ...punto, id: randomUUID(), nombre: '   ' }) },
  token
);
comprobar('un punto sin nombre se rechaza', invalido.estado === 422, `estado ${invalido.estado}`);

// --- limpieza ----------------------------------------------------------------
// Las pruebas no dejan rastro: la siguiente que corra debe encontrar la base como
// estaba. Se borra por la ruta de la base porque la API no expone borrado, y no debe.
const { execFileSync } = await import('node:child_process');
try {
  execFileSync(
    'docker',
    [
      'compose', 'exec', '-T', 'db',
      'psql', '-U', 'postgres', '-d', 'raiz', '-c',
      `delete from puntos_servicio where nombre like 'Acueducto de prueba %' or nombre like 'Punto que se cree validado %'`
    ],
    { cwd: new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, '$1:'), stdio: 'pipe' }
  );
  console.log('OK   la prueba limpio lo que creo');
} catch (error) {
  console.log(`AVISO no se pudo limpiar: ${error.message.split('\n')[0]}`);
}

console.log(fallos === 0 ? '\nTodas las pruebas de puntos pasaron' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
