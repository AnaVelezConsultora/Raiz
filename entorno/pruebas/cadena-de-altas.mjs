/**
 * La cadena de altas, contra la API y la base reales.
 *
 *   node entorno/pruebas/cadena-de-altas.mjs [urlApi] [sub del custodio]
 *
 * Lo que comprueba, y por que cada cosa importa:
 *
 *   El CUSTODIO crea coordinadores          — es quien responde por los datos
 *   El COORDINADOR crea quien registra      — arma su equipo sin depender de nadie
 *   El coordinador NO crea coordinadores    — nadie asciende a alguien a su nivel
 *   El lider NO da de alta a nadie          — registrar no es administrar
 *   El coordinador NO toca al custodio      — lo impide una politica, no el codigo
 *   Nadie se retira el acceso a si mismo    — dejaria el sistema sin quien administre
 *
 * Y que la cedula, los nombres completos y el telefono son obligatorios: quien
 * registra a una familia firma ese registro, y el dia que una entidad devuelva un
 * caso preguntando quien lo levanto, la respuesta tiene que ser una persona.
 *
 * DEJA CUENTAS CREADAS. Contra el entorno local da igual; contra un despliegue
 * real, las cuentas que crea llevan `Prueba` en el nombre y correo `@ejemplo.test`
 * para poder encontrarlas y retirarles el acceso despues.
 */
const API = process.argv[2] ?? 'http://localhost:3021';
const QUIEN = process.argv[3];
const CLAVE = process.argv[4];

const fallos = [];
const comprobar = (c, m) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${m}`); if (!c) fallos.push(m); };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * Un token para actuar como alguien.
 *
 * Contra el entorno local se arma sin firma, que es lo unico que hace falta alli.
 * Contra un despliegue real hay que abrir sesion de verdad — pero solo se puede con
 * el custodio, que es quien tiene clave: para los demas se sigue usando el `sub`, y
 * por eso la prueba completa solo corre en local. Contra produccion se comprueba lo
 * que se puede: que el custodio crea, y que los datos quedan.
 */
const comoSub = (sub) => `eyJhbGciOiJub25lIn0.${b64({ sub })}.`;

const abrirSesion = async (correo, clave) => {
  const r = await fetch(`${API}/sesion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, clave })
  });
  if (!r.ok) { console.error(`No se pudo entrar como ${correo}: ${r.status}`); process.exit(1); }
  const s = await r.json();
  return { token: s.token, sub: s.perfil?.id ?? s.sub };
};

const REAL = QUIEN?.includes('@');

const api = async (metodo, ruta, token, cuerpo) => {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const t = await r.text();
  return { estado: r.status, cuerpo: t ? JSON.parse(t) : null };
};

const marca = Date.now();
const sesion = REAL ? await abrirSesion(QUIEN, CLAVE) : { token: comoSub(QUIEN), sub: QUIEN };
const custodio = sesion.token;
const SUB_CUSTODIO = sesion.sub;

// --- el custodio crea un coordinador ---------------------------------------
const coord = await api('POST', '/voluntarios', custodio, {
  correo: `coord.${marca}@ejemplo.test`, nombre: 'Carmen Rosa Prueba',
  documento: `10${marca}`.slice(0, 10), telefono: '3001112233',
  clave: 'Clave.De.Prueba.2026', rol: 'coordinador'
});
comprobar(coord.estado === 201, `el custodio crea la cuenta (${coord.estado})`);
comprobar(coord.cuerpo?.rol === 'coordinador', `y queda como coordinador (${coord.cuerpo?.rol})`);

// --- faltan datos: se rechaza con el detalle -------------------------------
const incompleto = await api('POST', '/voluntarios', custodio, {
  correo: `x.${marca}@ejemplo.test`, nombre: 'Solounnombre',
  documento: '', telefono: '', clave: 'Clave.De.Prueba.2026', rol: 'lider'
});
comprobar(incompleto.estado === 422, `sin cedula ni telefono se rechaza (${incompleto.estado})`);
comprobar(
  (incompleto.cuerpo?.detalles ?? []).length >= 3,
  `y dice que falta: ${(incompleto.cuerpo?.detalles ?? []).join(' | ')}`
);

// --- el coordinador crea un lider ------------------------------------------
// Contra la nube no se puede actuar como el coordinador recien creado sin su clave,
// asi que esa mitad de la cadena se comprueba en local, donde el token no se firma.
if (REAL) {
  console.log('');
  console.log('Contra un despliegue real se para aqui: lo que sigue exige actuar como');
  console.log('otras personas, y eso solo se puede donde los tokens no se firman.');
  console.log('');
  if (fallos.length) { console.error(`FALLARON ${fallos.length}`); process.exit(1); }
  console.log('El custodio crea, y los datos quedan guardados.');
  process.exit(0);
}

const tokenCoord = comoSub(coord.cuerpo.sub);
const lider = await api('POST', '/voluntarios', tokenCoord, {
  correo: `lider.${marca}@ejemplo.test`, nombre: 'Jose Luis Prueba',
  documento: `20${marca}`.slice(0, 10), telefono: '3004445566',
  clave: 'Clave.De.Prueba.2026', rol: 'lider'
});
comprobar(lider.estado === 201, `el coordinador crea un usuario de registro (${lider.estado})`);
comprobar(lider.cuerpo?.rol === 'lider', `que nace lider (${lider.cuerpo?.rol})`);

// --- el coordinador NO puede crear un coordinador --------------------------
const intruso = await api('POST', '/voluntarios', tokenCoord, {
  correo: `otro.${marca}@ejemplo.test`, nombre: 'Otro Coordinador',
  documento: `30${marca}`.slice(0, 10), telefono: '3007778899',
  clave: 'Clave.De.Prueba.2026', rol: 'coordinador'
});
comprobar(intruso.estado === 401, `un coordinador no crea coordinadores (${intruso.estado})`);

// --- un lider no da de alta a nadie ----------------------------------------
const desdeLider = await api('POST', '/voluntarios', comoSub(lider.cuerpo.sub), {
  correo: `z.${marca}@ejemplo.test`, nombre: 'Nadie Mas',
  documento: `40${marca}`.slice(0, 10), telefono: '3001010101',
  clave: 'Clave.De.Prueba.2026', rol: 'lider'
});
comprobar(desdeLider.estado === 401, `un lider no da de alta a nadie (${desdeLider.estado})`);

// --- la cedula y el telefono quedaron guardados ----------------------------
const lista = await api('GET', '/perfiles', custodio);
comprobar(lista.estado === 200, `el custodio lista los perfiles (${lista.estado})`);
const creado = (lista.cuerpo ?? []).find((p) => p.id === lider.cuerpo.sub);
comprobar(!!creado?.documento, `la cedula quedo guardada (${creado?.documento})`);
comprobar(!!creado?.telefono, `y el telefono (${creado?.telefono})`);

// --- el coordinador administra a quien registra, y a nadie mas -------------
const baja = await api('PATCH', `/perfiles/${lider.cuerpo.sub}`, tokenCoord, { activo: false });
comprobar(baja.estado === 200, `el coordinador retira el acceso de un lider (${baja.estado})`);

const contraElCustodio = await api('PATCH', `/perfiles/${SUB_CUSTODIO}`, tokenCoord, { rol: 'lider' });
comprobar(
  contraElCustodio.estado === 401,
  `y NO puede degradar al custodio (${contraElCustodio.estado})`
);

// --- nadie se retira el acceso a si mismo ----------------------------------
const aSiMismo = await api('PATCH', `/perfiles/${SUB_CUSTODIO}`, custodio, { activo: false });
comprobar(aSiMismo.estado === 422, `nadie se retira el acceso a si mismo (${aSiMismo.estado})`);

console.log('');
if (fallos.length) { console.error(`FALLARON ${fallos.length}`); process.exit(1); }
console.log('La cadena de altas se comporta como debe.');
