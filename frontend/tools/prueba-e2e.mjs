import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// El puerto se puede fijar por variable: en la maquina de quien programa se sirve en
// el 8789 y en la integracion continua en el 4300. Cuando estaba escrito a mano en un
// solo lado, la prueba pasaba local y fallaba en la nube por conexion rechazada, que
// es el peor fallo posible: no dice nada sobre la aplicacion.
const BASE = process.env['BASE_PRUEBA'] ?? 'http://127.0.0.1:8789';
const OUT = 'preview';

/**
 * Las capturas que se publican salen de ESTA prueba y de ningun otro lado.
 *
 * Las anteriores se tomaron a mano y con el caso de una familia real: nombre,
 * apellidos, vereda y coordenada de un reporte que llego por WhatsApp. Quedaron
 * versionadas y embebidas en la presentacion que se le muestra a las entidades.
 *
 * Atandolas a la prueba, la unica forma de generar una captura es recorrer el
 * formulario con los datos inventados de este archivo, y ademas dejan de mentir:
 * si una pantalla cambia, la captura cambia con ella.
 */
const CAPTURAS = fileURLToPath(new URL('../../docs/capturas/', import.meta.url));

/** Guarda la captura de trabajo y, si lleva nombre de publicacion, la publicada. */
const foto = async (nombre, publicada, opciones = {}) => {
  await page.screenshot({ path: `${OUT}-${nombre}.png`, ...opciones });
  if (publicada) {
    await page.screenshot({
      path: `${CAPTURAS}${publicada}.jpg`,
      type: 'jpeg',
      quality: 82,
      ...opciones
    });
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 900 },
  deviceScaleFactor: 2,
  permissions: ['geolocation'],
  geolocation: { latitude: 4.2712345, longitude: -75.9412345, accuracy: 12 },
  locale: 'es-CO'
});
/**
 * La aplicacion publicada exige haber entrado, y con razon.
 *
 * Desde que la PWA apunta a la API real, la guarda de sesion manda a /acceso a quien
 * no tenga sesion, y esta prueba se quedaba esperando un boton que no estaba. Entrar
 * de verdad exigiria red, y lo que se prueba aqui es precisamente lo contrario.
 *
 * Se siembra la sesion en el dispositivo, que es el estado real del voluntario en
 * campo: entro UNA vez con senal en el casco urbano y subio a la vereda. La sesion
 * vive en el navegador y el token puede estar vencido; capturar no lo exige.
 */
const SESION_SEMBRADA = {
  perfil: {
    id: '00000000-0000-4000-8000-000000000001',
    nombre: 'Ana Velez',
    rol: 'lider',
    organizacionId: null,
    telefono: null,
    activo: true
  },
  correo: 'prueba@ejemplo.test',
  expiraEn: null,
  validadaEn: '2026-08-15T00:00:00.000Z'
};

await ctx.addInitScript(
  ([clave, sesion]) => {
    try { localStorage.setItem(clave, sesion); } catch { /* sin almacenamiento */ }
  },
  ['raiz.sesion.local', JSON.stringify(SESION_SEMBRADA)]
);

/**
 * Esta prueba mide que la aplicacion funcione SIN servidor, asi que no debe hablar
 * con el que esta publicado. Si lo hiciera, un despliegue caido pintaria de rojo una
 * prueba que no tiene nada que ver, y peor: una prueba verde podria estarlo por lo que
 * respondio la nube y no por lo que hace el dispositivo.
 */
await ctx.route('**://api.apoyo-colombia.com/**', (ruta) => ruta.abort());

const page = await ctx.newPage();

const errores = [];
// Las llamadas a la API cortadas arriba salen por consola como error de red. Son
// esperadas y son el escenario, no un defecto: se filtran para que 'errores de
// consola' siga significando algo.
const ES_RED_CORTADA = (texto) =>
  texto.includes('api.apoyo-colombia.com') ||
  texto.includes('net::ERR_FAILED') ||
  texto.includes('Failed to load resource');

page.on('console', (m) => {
  if (m.type() === 'error' && !ES_RED_CORTADA(m.text())) errores.push(m.text());
});
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));

const paso = (n, msg) => console.log(`[${n}] ${msg}`);

// --- 1. lista vacia ---------------------------------------------------------
await page.goto(BASE + '/casos', { waitUntil: 'networkidle' });
await page.waitForSelector('h1');
paso(1, 'lista abre: ' + (await page.textContent('h1')).trim());
await foto('1-lista-vacia');

// --- 2. nuevo caso rural ----------------------------------------------------
await page.getByRole('link', { name: 'Nuevo caso rural' }).click();
await page.waitForSelector('#reg');
paso(2, 'formulario paso 1: ' + (await page.textContent('h1')).trim());

await page.fill('#reg', 'Ana Velez');
await page.fill('#org', 'Mesa de sistematizacion');
await page.fill('#vereda', 'Vereda Ficticia Uno');
await page.fill('#ref', '300 m arriba de la escuela');
// La autorizacion dejo de ser una casilla y son dos botones: sin responder no se
// continua, que es justo lo que esta prueba debe recorrer como lo hace el voluntario.
await page.getByRole('button', { name: 'Sí, autoriza' }).click();

// GPS
await page.getByRole('button', { name: /Obtener ubicacion/i }).click();
await page.waitForSelector('.aviso.exito.mono', { timeout: 20000 });
const coord = (await page.textContent('.aviso.exito.mono')).trim();
paso(3, 'GPS capturado: ' + coord.replace(/\s+/g, ' '));
await foto('2-paso1', 'app-gps', { fullPage: true });

// --- 3. paso 2: hogar -------------------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#tel1');
// Datos INVENTADOS. Nunca una familia real en una prueba: el archivo se versiona,
// se publica en la salida de la integracion continua y sale del control de la mesa.
await page.fill('#nom', 'Familia');
await page.fill('#ape', 'Inventada Uno');
await page.fill('#tel1', '3000000101');
await page.fill('#ptotal', '5');
await page.getByRole('textbox', { name: 'Hombres de 18 a 59' }).fill('2');
await page.getByRole('textbox', { name: 'Mujeres de 18 a 59' }).fill('2');
await page.getByRole('textbox', { name: 'Mujeres de 0 a 5' }).fill('1');
// La pregunta cambio: antes era 'a que organizacion pertenece' con una lista de
// pastillas, y daba por sentado que pertenece a alguna. Ahora se pregunta si
// pertenece, y solo entonces cual.
await page.getByRole('button', { name: 'Sí', exact: true }).click();
await page.fill('#afiliacion-cual', 'Junta de accion comunal inventada');
const descuadre = await page.locator('.aviso.peligro').count();
paso(4, `paso 2 lleno, avisos de descuadre visibles: ${descuadre}`);
await foto('3-paso2', 'app-hogar', { fullPage: true });

// --- 4. paso 3: vivienda ----------------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#ten');
await page.selectOption('#ten', 'arrendatario');
await page.selectOption('#afec', 'severo');
// Sin id: el contador es un componente y el id vivia en el input que reemplazo.
// Se busca por su etiqueta accesible, que es contrato de la interfaz y no detalle interno.
await page.getByRole('textbox', { name: 'Familias en la misma estructura' }).fill('2');
await page.getByText('No se puede vivir ahí', { exact: true }).click();
await page.getByText('Hay riesgo inminente de colapso').click();
await page.getByText('Remoción de escombros', { exact: true }).click();
await page.getByText('Cafe', { exact: true }).click();
const avisoRiesgo = await page.locator('.aviso.peligro').first().textContent();
paso(5, 'aviso riesgo: ' + avisoRiesgo.trim().slice(0, 60).replace(/\s+/g, ' '));
await foto('4-paso3', 'app-riesgo', { fullPage: true });

// --- 5. paso 4: cierre ------------------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#prio');
await page.selectOption('#prio', 'p0');
await page.getByText('Alimentos o mercado', { exact: true }).click();
await page.fill('#obs', 'Necesitan remover. Solicitan ayuda estructural.');
paso(6, 'paso 4 listo');
await foto('5-paso4', null, { fullPage: true });

// --- 6. guardar y volver a la lista ----------------------------------------
await page.getByRole('button', { name: 'Guardar caso' }).click();

// La casa alojaba dos familias, asi que la aplicacion ofrece registrar la siguiente
// (HU 1.3.14). Aqui se comprueba que el ofrecimiento aparece y se cierra: la prueba
// mide que el caso quede guardado, no el encadenamiento de familias.
await page.waitForSelector('text=Esta casa alojaba más de una familia', { timeout: 10000 });
paso('4b', 'ofrece registrar la siguiente familia de la misma casa');
await page.getByRole('button', { name: 'Terminar por ahora' }).click();
await page.waitForSelector('li.tarjeta', { timeout: 10000 });
const tarjeta = (await page.textContent('li.tarjeta')).replace(/\s+/g, ' ').trim();
paso(7, 'caso en la lista: ' + tarjeta.slice(0, 110));
await foto('6-lista', 'app-lista', { fullPage: true });

// --- 7. persistencia: recarga dura ------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('li.tarjeta', { timeout: 10000 });
const tras = await page.locator('li.tarjeta').count();
paso(8, `tras recargar la pagina siguen ${tras} caso(s) en IndexedDB`);

// --- 8. modo avion ----------------------------------------------------------
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1500);
const offlineOk = await page.locator('li.tarjeta').count();
const banner = await page.locator('header span.mono').textContent().catch(() => '');
paso(9, `SIN CONEXION: la app abre y muestra ${offlineOk} caso(s). Barra: ${banner.trim()}`);
await foto('7-offline', 'app-offline', { fullPage: true });
await ctx.setOffline(false);

// --- 9. el tablero arranca en el paquete PUBLICADO --------------------------
/**
 * ESTE PASO EXISTE POR UN DESPLIEGUE ROTO, y conviene decir cual.
 *
 * El tablero se probo dos veces contra el servidor de desarrollo y las dos funciono.
 * Publicado, el mapa salia en blanco con «t.map is not a function»: Leaflet se publica
 * al estilo viejo, y el empaquetador de produccion deja lo que exporta colgando de
 * `default` mientras el de desarrollo lo desenvuelve. Las cifras se veian bien, asi que
 * la pantalla parecia estar.
 *
 * Esta prueba corre sobre `dist/`, que es el mismo paquete que se sube. Es el unico
 * sitio del proyecto donde una diferencia asi se puede ver antes que un coordinador.
 *
 * Se siembra una sesion de custodia porque el tablero pide `verTodosLosCasos`, y se
 * cortan tanto la API como las teselas: lo que se mide es que Leaflet ARRANQUE, no que
 * OpenStreetMap este disponible desde la integracion continua.
 */
const mesa = await browser.newContext({ viewport: { width: 1024, height: 900 }, locale: 'es-CO' });
await mesa.addInitScript(
  ([clave, sesion]) => {
    try { localStorage.setItem(clave, sesion); } catch { /* sin almacenamiento */ }
  },
  [
    'raiz.sesion.local',
    JSON.stringify({
      ...SESION_SEMBRADA,
      perfil: { ...SESION_SEMBRADA.perfil, nombre: 'Custodia de prueba', rol: 'custodio' }
    })
  ]
);
await mesa.route('**://api.apoyo-colombia.com/**', (ruta) => ruta.abort());
await mesa.route('**://tile.openstreetmap.org/**', (ruta) => ruta.abort());

const paginaMesa = await mesa.newPage();
const erroresMesa = [];
paginaMesa.on('console', (m) => {
  if (m.type() === 'error' && !ES_RED_CORTADA(m.text())) erroresMesa.push(m.text());
});
paginaMesa.on('pageerror', (e) => erroresMesa.push('pageerror: ' + e.message));

await paginaMesa.goto(BASE + '/tablero', { waitUntil: 'networkidle' });
await paginaMesa.waitForSelector('h1');

// `#mapa.leaflet-container` solo existe si `L.map()` corrio: es la asercion que habria
// atajado el despliegue roto.
const mapaVivo = (await paginaMesa.locator('#mapa.leaflet-container').count()) === 1;
const controles = await paginaMesa.locator('.leaflet-control-zoom').count();
paso(10, `tablero: mapa inicializado ${mapaVivo ? 'si' : 'NO'}, controles ${controles}`);
if (!mapaVivo || erroresMesa.length > 0) {
  console.error('El mapa no arranco en el paquete de produccion.', erroresMesa.slice(0, 3));
  await browser.close();
  process.exit(1);
}
await mesa.close();

console.log('errores de consola:', errores.length ? JSON.stringify(errores.slice(0, 5)) : 'ninguno');
await browser.close();
