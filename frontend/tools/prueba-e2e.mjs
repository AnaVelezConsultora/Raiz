import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:8789';
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
const page = await ctx.newPage();

const errores = [];
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
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
await page.getByText('La familia autoriza el tratamiento de sus datos').click();

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
await page.getByText('Comite de reforma agraria', { exact: true }).click();
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
await page.getByText('No se puede vivir ahi', { exact: true }).click();
await page.getByText('Hay riesgo inminente de colapso').click();
await page.getByText('Remocion de escombros', { exact: true }).click();
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
await page.waitForSelector('text=Esta casa alojaba mas de una familia', { timeout: 10000 });
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

console.log('errores de consola:', errores.length ? JSON.stringify(errores.slice(0, 5)) : 'ninguno');
await browser.close();
