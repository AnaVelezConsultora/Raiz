import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8789';
const OUT = 'c:/tmp/raiz/frontend/preview';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 900 },
  deviceScaleFactor: 2,
  permissions: ['geolocation'],
  geolocation: { latitude: 4.3283783, longitude: -75.9029183, accuracy: 12 },
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
await page.screenshot({ path: `${OUT}-1-lista-vacia.png` });

// --- 2. nuevo caso rural ----------------------------------------------------
await page.getByRole('link', { name: 'Nuevo caso rural' }).click();
await page.waitForSelector('#reg');
paso(2, 'formulario paso 1: ' + (await page.textContent('h1')).trim());

await page.fill('#reg', 'Ana Velez');
await page.fill('#org', 'Mesa de sistematizacion');
await page.fill('#vereda', 'El Venado - La Mirandita');
await page.fill('#ref', '300 m arriba de la escuela');
await page.getByText('La familia autoriza el tratamiento de sus datos').click();

// GPS
await page.getByRole('button', { name: /Obtener ubicacion/i }).click();
await page.waitForSelector('.aviso.exito.mono', { timeout: 20000 });
const coord = (await page.textContent('.aviso.exito.mono')).trim();
paso(3, 'GPS capturado: ' + coord.replace(/\s+/g, ' '));
await page.screenshot({ path: `${OUT}-2-paso1.png`, fullPage: true });

// --- 3. paso 2: hogar -------------------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#tel1');
await page.fill('#nom', 'Maria del Carmen');
await page.fill('#ape', 'Diaz Cardona');
await page.fill('#tel1', '3217399334');
await page.fill('#ptotal', '5');
await page.getByRole('textbox', { name: 'Hombres de 18 a 59' }).fill('2');
await page.getByRole('textbox', { name: 'Mujeres de 18 a 59' }).fill('2');
await page.getByRole('textbox', { name: 'Mujeres de 0 a 5' }).fill('1');
await page.getByText('Comite de reforma agraria', { exact: true }).click();
const descuadre = await page.locator('.aviso.peligro').count();
paso(4, `paso 2 lleno, avisos de descuadre visibles: ${descuadre}`);
await page.screenshot({ path: `${OUT}-3-paso2.png`, fullPage: true });

// --- 4. paso 3: vivienda ----------------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#ten');
await page.selectOption('#ten', 'arrendatario');
await page.selectOption('#afec', 'severo');
await page.fill('#hog', '2');
await page.getByText('Hay riesgo inminente de colapso').click();
await page.getByText('Remocion de escombros', { exact: true }).click();
await page.getByText('Cafe', { exact: true }).click();
const avisoRiesgo = await page.locator('.aviso.peligro').first().textContent();
paso(5, 'aviso riesgo: ' + avisoRiesgo.trim().slice(0, 60).replace(/\s+/g, ' '));
await page.screenshot({ path: `${OUT}-4-paso3.png`, fullPage: true });

// --- 5. paso 4: cierre ------------------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#prio');
await page.selectOption('#prio', 'p0');
await page.getByText('Alimentos o mercado', { exact: true }).click();
await page.fill('#obs', 'Necesitan remover. Solicitan ayuda estructural.');
paso(6, 'paso 4 listo');
await page.screenshot({ path: `${OUT}-5-paso4.png`, fullPage: true });

// --- 6. guardar y volver a la lista ----------------------------------------
await page.getByRole('button', { name: 'Guardar caso' }).click();
await page.waitForSelector('li.tarjeta', { timeout: 10000 });
const tarjeta = (await page.textContent('li.tarjeta')).replace(/\s+/g, ' ').trim();
paso(7, 'caso en la lista: ' + tarjeta.slice(0, 110));
await page.screenshot({ path: `${OUT}-6-lista.png`, fullPage: true });

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
await page.screenshot({ path: `${OUT}-7-offline.png`, fullPage: true });
await ctx.setOffline(false);

console.log('errores de consola:', errores.length ? JSON.stringify(errores.slice(0, 5)) : 'ninguno');
await browser.close();
