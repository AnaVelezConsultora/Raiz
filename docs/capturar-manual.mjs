/**
 * Capturas para el manual de los lideres.
 *
 *   node docs/capturar-manual.mjs      (con la PWA servida en el 8789)
 *
 * POR QUE NO SIRVEN LAS DE LA PRUEBA DE CAMPO
 *
 * Aquellas son de pagina completa —tres mil pixeles de alto— porque su trabajo es
 * dejar constancia de todo el formulario. En una diapositiva eso se ve como una tira
 * ilegible. Estas son del tamano de la pantalla del celular, tomadas en el momento
 * exacto que el manual esta explicando.
 *
 * Datos inventados, como en todas partes: el manual se proyecta y se comparte.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const BASE = process.env['BASE_MANUAL'] ?? 'http://127.0.0.1:8789';
const SALIDA = fileURLToPath(new URL('./capturas/manual/', import.meta.url));

await mkdir(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const ctx = await navegador.newContext({
  viewport: { width: 412, height: 880 },
  deviceScaleFactor: 2,
  permissions: ['geolocation'],
  geolocation: { latitude: 4.2712345, longitude: -75.9412345, accuracy: 12 },
  locale: 'es-CO'
});

// Sesion sembrada: el manual muestra la aplicacion como la ve el voluntario que ya
// entro, que es el estado en el que va a estar el 99% del tiempo.
await ctx.addInitScript(
  ([clave, sesion]) => {
    try { localStorage.setItem(clave, sesion); } catch { /* sin almacenamiento */ }
  },
  [
    'raiz.sesion.local',
    JSON.stringify({
      perfil: {
        id: '00000000-0000-4000-8000-000000000001',
        nombre: 'Ana Velez',
        rol: 'lider',
        organizacionId: null,
        telefono: null,
        activo: true
      },
      correo: 'lider@ejemplo.test',
      expiraEn: null,
      validadaEn: '2026-08-16T00:00:00.000Z'
    })
  ]
);
await ctx.route('**://api.apoyo-colombia.com/**', (r) => r.abort());

const page = await ctx.newPage();
const foto = async (nombre) => {
  await page.screenshot({ path: `${SALIDA}${nombre}.png` });
  console.log(`  ${nombre}`);
};

// --- entrar -----------------------------------------------------------------
await page.goto(`${BASE}/acceso`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(500);
await foto('01-entrar');

// --- lista vacia ------------------------------------------------------------
await page.goto(`${BASE}/casos`, { waitUntil: 'networkidle' });
await page.waitForSelector('h1');
await foto('02-lista-vacia');

// --- paso 1: quien reporta, autorizacion y lugar -----------------------------
// Se navega directo en vez de tocar el boton: al guion le importa la pantalla, no
// el camino, y la prueba de campo ya verifica que el boton lleve ahi.
await page.goto(`${BASE}/nuevo?zona=rural`, { waitUntil: 'networkidle' });
await page.waitForSelector('#reg');
await page.fill('#reg', 'Ana Velez');
await page.fill('#org', 'Junta de accion comunal');
await foto('03-quien-reporta');

await page.getByRole('button', { name: 'Sí, autoriza' }).click();
await page.waitForTimeout(300);
await foto('04-autorizacion');

await page.fill('#vereda', 'Vereda Ficticia Uno');
await page.fill('#ref', '300 m arriba de la escuela, casa de teja roja');
await page.getByRole('button', { name: /Obtener ubicacion/i }).click();
await page.waitForSelector('.aviso.exito.mono', { timeout: 20000 });
await page.locator('.aviso.exito.mono').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await foto('05-coordenada');

// --- paso 2: quienes viven ahi ----------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#tel1');
await page.fill('#nom', 'Familia');
await page.fill('#ape', 'Inventada Uno');
await page.fill('#tel1', '3000000101');
await page.fill('#ptotal', '5');
await page.getByRole('textbox', { name: 'Hombres de 18 a 59' }).fill('2');
await page.waitForTimeout(300);
await page.locator('text=La suma por edades da').scrollIntoViewIfNeeded().catch(() => {});
await foto('06-descuadre');

await page.getByRole('textbox', { name: 'Mujeres de 18 a 59' }).fill('2');
await page.getByRole('textbox', { name: 'Mujeres de 0 a 5' }).fill('1');
await page.waitForTimeout(300);
await foto('07-edades');

await page.locator('text=Personas fallecidas o heridas').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await foto('08-heridos');

// --- paso 3: la vivienda y el dano ------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#ten');
await page.selectOption('#afec', 'severo');
await page.getByText('No se puede vivir ahí', { exact: true }).click();
await page.getByText('Hay riesgo inminente de colapso').click();
await page.waitForTimeout(300);
await foto('09-riesgo');

await page.locator('text=Predio, cultivos y animales').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await foto('10-cultivos');

// --- paso 4: fotos y necesidad ----------------------------------------------
await page.getByRole('button', { name: 'Continuar' }).click();
await page.waitForSelector('#prio');
await page.waitForTimeout(300);
await foto('11-cierre');

// --- guardado y lista con el caso -------------------------------------------
await page.getByRole('button', { name: 'Guardar caso' }).click();
await page.waitForSelector('li.tarjeta', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(400);
await foto('12-lista-con-caso');

// --- sin conexion ------------------------------------------------------------
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1500);
await foto('13-sin-conexion');
await ctx.setOffline(false);

await navegador.close();
console.log('\nCapturas del manual en docs/capturas/manual/');
