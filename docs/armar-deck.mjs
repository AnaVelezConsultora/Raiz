/**
 * Arma docs/deck.html a partir de la plantilla y de las capturas.
 *
 * POR QUE EXISTE ESTE SCRIPT
 *
 * El deck se armo a mano una vez y las imagenes quedaron embebidas en base64
 * dentro del HTML. Eso tuvo dos consecuencias: nadie podia regenerarlo sin
 * rehacer el trabajo, y cuando se descubrio que las capturas mostraban el nombre
 * y la vereda de una familia real, corregirlo significaba editar a mano una
 * cadena de medio megabyte.
 *
 * Ahora la unica fuente de las capturas es la prueba de punta a punta
 * (frontend/tools/prueba-e2e.mjs), que recorre el formulario con datos
 * inventados. Regenerar el deck es correr la prueba y despues este script.
 *
 * Uso:  node docs/armar-deck.mjs
 *
 * Sin dependencias: solo Node.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('./', import.meta.url));

/** Marcador de la plantilla -> archivo que lo llena. */
const IMAGENES = {
  IMG_GPS: 'app-gps.jpg',
  IMG_HOGAR: 'app-hogar.jpg',
  IMG_RIESGO: 'app-riesgo.jpg',
  IMG_OFFLINE: 'app-offline.jpg',
  IMG_LISTA: 'app-lista.jpg',
  IMG_TABLERO: 'tablero.jpg'
};

const comoDatos = async (archivo) => {
  const binario = await readFile(`${AQUI}capturas/${archivo}`);
  return `data:image/jpeg;base64,${binario.toString('base64')}`;
};

let html = await readFile(`${AQUI}deck.template.html`, 'utf8');

for (const [marcador, archivo] of Object.entries(IMAGENES)) {
  const datos = await comoDatos(archivo);
  const antes = html;
  html = html.replaceAll(`{{${marcador}}}`, datos);
  if (html === antes) {
    console.error(`La plantilla no usa {{${marcador}}}. Revise deck.template.html.`);
    process.exit(1);
  }
  console.log(`  ${marcador} <- capturas/${archivo}`);
}

const pendientes = html.match(/\{\{[A-Z_]+\}\}/g);
if (pendientes) {
  console.error(`Quedaron marcadores sin llenar: ${[...new Set(pendientes)].join(', ')}`);
  process.exit(1);
}

await writeFile(`${AQUI}deck.html`, html);
console.log(`\ndocs/deck.html armado (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
