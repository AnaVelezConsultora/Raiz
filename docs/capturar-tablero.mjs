/**
 * Toma la captura del tablero publico que se publica en el deck.
 *
 * La captura anterior se tomo a mano y quedo mostrando tres cosas que ya no son
 * ciertas: el nombre viejo del proyecto, la afirmacion de que la vista es
 * agregada —no lo es, es una fila por afectacion— y el mapa centrado en la
 * coordenada de una familia real.
 *
 * Uso:  node docs/capturar-tablero.mjs
 *
 * Necesita salida a internet: el mapa base son teselas de OpenStreetMap.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLERO = fileURLToPath(new URL('../tablero/', import.meta.url));
const DESTINO = fileURLToPath(new URL('./capturas/tablero.jpg', import.meta.url));
const PUERTO = 8790;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8'
};

const servidor = createServer(async (peticion, respuesta) => {
  const ruta = new URL(peticion.url, 'http://localhost').pathname;
  const archivo = join(TABLERO, normalize(ruta === '/' ? 'index.html' : ruta));
  try {
    const contenido = await readFile(archivo);
    respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404).end('no esta');
  }
});

await new Promise((listo) => servidor.listen(PUERTO, listo));

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
await pagina.goto(`http://127.0.0.1:${PUERTO}/`, { waitUntil: 'networkidle' });

// Las teselas del mapa llegan por red y no cuentan como carga de la pagina.
await pagina.waitForTimeout(3000);

await pagina.screenshot({ path: DESTINO, type: 'jpeg', quality: 82 });
console.log('docs/capturas/tablero.jpg actualizado');

await navegador.close();
servidor.close();
