/**
 * Genera los iconos de la aplicacion a partir del sello del equipo.
 *
 *   node tools/generar-iconos.mjs
 *
 * Espera el sello en `public/marca/raiz.png`, cuadrado y de al menos 512 px. Ese
 * archivo es el original que hizo el equipo; aqui no se dibuja ninguna marca nueva.
 *
 * POR QUE CON EL NAVEGADOR Y NO CON UNA LIBRERIA DE IMAGENES
 *
 * Redimensionar un PNG en Node pide una dependencia con binarios que compilar. El
 * navegador de pruebas ya esta instalado para la prueba de campo, sabe redimensionar
 * mejor que casi cualquier libreria, y asi no entra una dependencia mas a un proyecto
 * que tiene que poder levantar cualquiera con `npm ci`.
 *
 * EL FONDO NO ES TRANSPARENTE, Y ES A PROPOSITO
 *
 * Android recorta el icono en un circulo y pinta lo que quede detras. Con
 * transparencia, el sello queda flotando sobre el color que decida el sistema —a
 * veces blanco, a veces negro— y el trazo fino se pierde. Se compone sobre el papel
 * de la paleta, que es el fondo que el sello ya tiene en su version impresa.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const ORIGEN = `${RAIZ}public/marca/raiz.png`;
const DESTINO = `${RAIZ}public/icons/`;
const PAPEL = '#f1ead8';

// Los tamanos que declara el manifiesto. Si se agrega uno alla, se agrega aqui.
const TAMANOS = [72, 96, 128, 144, 152, 192, 384, 512];

let binario;
try {
  binario = await readFile(ORIGEN);
} catch {
  console.error(`No esta ${ORIGEN}.`);
  console.error('Guarde ahi el sello del equipo, cuadrado y de 512 px o mas.');
  process.exit(1);
}

const fuente = `data:image/png;base64,${binario.toString('base64')}`;

await mkdir(DESTINO, { recursive: true });

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

for (const lado of TAMANOS) {
  await pagina.setViewportSize({ width: lado, height: lado });
  await pagina.setContent(
    `<body style="margin:0;width:${lado}px;height:${lado}px;background:${PAPEL}">
       <img src="${fuente}" style="width:100%;height:100%;object-fit:contain" />
     </body>`,
    { waitUntil: 'load' }
  );
  // Se espera a que la imagen decodifique: sin esto, el primer tamano sale en blanco.
  await pagina.evaluate(() => document.querySelector('img').decode());

  const png = await pagina.screenshot({ type: 'png' });
  await writeFile(`${DESTINO}icon-${lado}x${lado}.png`, png);
  console.log(`  icon-${lado}x${lado}.png`);
}

await navegador.close();
console.log(`\n${TAMANOS.length} iconos generados desde el sello.`);
