/**
 * Convierte docs/manual.html en dos PDF, porque son dos usos distintos.
 *
 *   node docs/armar-pdf.mjs
 *
 *   manual-raiz-diapositivas.pdf   apaisado, en negro, una lamina por pagina.
 *                                  Para proyectar y para mandar por WhatsApp.
 *
 *   manual-raiz-impreso.pdf        vertical, papel blanco y tinta negra.
 *                                  Para fotocopiar y repartir en el salon comunal.
 *
 * POR QUE DOS Y NO UNO
 *
 * El mismo archivo no sirve para las dos cosas. Proyectado, el negro hace que las
 * pantallas del celular se lean como pantallas encendidas. Fotocopiado, ese mismo
 * negro se come el toner de la impresora del pueblo y sale una mancha gris. La hoja
 * de estilos ya preveia las dos situaciones; esto solo las materializa.
 *
 * El navegador de pruebas ya esta instalado para la prueba de campo: no entra una
 * dependencia nueva por esto.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('./', import.meta.url));
const FUENTE = pathToFileURL(`${AQUI}manual.html`).href;
const SALIDA = `${AQUI}generado/`;

await mkdir(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

await pagina.goto(FUENTE, { waitUntil: 'networkidle' });

// -----------------------------------------------------------------------------
// 1. Para proyectar: apaisado y en negro
// -----------------------------------------------------------------------------
// Se emula `print` para conservar el salto de pagina por lamina, y encima se
// devuelven los colores oscuros que esa misma hoja de estilos habia cambiado para
// papel. Es el unico sitio donde las dos intenciones se cruzan.
await pagina.emulateMedia({ media: 'print' });
const enNegro = await pagina.addStyleTag({
  content: `
    :root {
      --fondo: #0d0f0d !important;
      --tinta: #f4f2ec !important;
      --tinta-suave: #b6bdb5 !important;
      --tinta-tenue: #8a938c !important;
      --linea: rgba(244, 242, 236, 0.18) !important;
      --linea-suave: rgba(244, 242, 236, 0.08) !important;
      --verde: #a7c0aa !important;
      --ladrillo: #e08a7d !important;
    }
    /* Apaisado hay menos alto y mas ancho que en A4: se aprovecha el ancho y se
       aprieta el alto. Se probo forzar que cada lamina ocupara la pagina entera y
       el resultado fue el contrario del buscado — el contenido pasaba por unos
       milimetros y cada lamina salia en dos paginas. */
    body { font-size: 11pt; }
    .lamina { padding: 0.45in 0.7in !important; }
    .lamina > *, .nota, ul, p { max-width: none; }
    /* La columna del celular manda sobre el alto de la pagina: una captura de
       telefono es dos veces mas alta que ancha, asi que 3 pulgadas de ancho son
       6,4 de alto y la lamina se pasaba de pagina. */
    .dos { gap: 1.6rem; grid-template-columns: minmax(0, 1fr) minmax(0, 2.5in); }
    .dos.izquierda { grid-template-columns: minmax(0, 2.5in) minmax(0, 1fr); }
    figure svg, figure img { max-height: 4.4in; }
    figure img { width: auto; margin: 0 auto; }
    .portada { min-height: 6in; }
  `
});

await pagina.pdf({
  path: `${SALIDA}manual-raiz-diapositivas.pdf`,
  width: '13.33in',
  height: '7.5in',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' }
});
console.log('  manual-raiz-diapositivas.pdf   apaisado, en negro');

// -----------------------------------------------------------------------------
// 2. Para fotocopiar: vertical y en blanco
// -----------------------------------------------------------------------------
await enNegro.evaluate((etiqueta) => etiqueta.remove());

await pagina.pdf({
  path: `${SALIDA}manual-raiz-impreso.pdf`,
  format: 'A4',
  printBackground: false,
  margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' }
});
console.log('  manual-raiz-impreso.pdf        vertical, papel blanco');

await navegador.close();
console.log(`\nLos dos PDF quedaron en docs/generado/`);
