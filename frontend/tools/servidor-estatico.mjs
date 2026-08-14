/**
 * Servidor estatico con reserva para aplicacion de una sola pagina.
 *
 * Sirve para probar EL MODO SIN CONEXION, que es lo que hace util a Raiz y que el
 * servidor de desarrollo de Angular no permite verificar: en desarrollo el service
 * worker viene desactivado a proposito, asi que `npm start` da un falso negativo.
 *
 * Reproduce dos comportamientos de Netlify:
 *   1. Cualquier ruta desconocida devuelve index.html, para que /casos funcione al
 *      recargar en vez de dar 404.
 *   2. El service worker y su manifiesto se sirven sin cache, para que una version
 *      vieja no se quede pegada en el navegador.
 *
 * Uso:  npm run servir
 * Sin dependencias: solo Node.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const RAIZ = resolve(process.argv[2] ?? 'dist/frontend/browser');
const PUERTO = Number(process.argv[3] ?? process.env['PUERTO'] ?? 4300);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** Archivos que nunca deben quedar cacheados. */
const SIN_CACHE = new Set(['/ngsw.json', '/ngsw-worker.js', '/index.html', '/']);

createServer(async (peticion, respuesta) => {
  const ruta = decodeURIComponent(new URL(peticion.url ?? '/', 'http://local').pathname);
  const archivo = join(RAIZ, normalize(ruta));

  // Evita salir de la carpeta publicada con rutas tipo ../../
  if (!archivo.startsWith(RAIZ)) {
    respuesta.writeHead(403).end('Prohibido');
    return;
  }

  const encabezados = (nombre) => ({
    'Content-Type': TIPOS[extname(nombre)] ?? 'application/octet-stream',
    'Cache-Control': SIN_CACHE.has(ruta) ? 'no-cache, no-store, must-revalidate' : 'no-cache'
  });

  try {
    const contenido = await readFile(archivo);
    respuesta.writeHead(200, encabezados(archivo)).end(contenido);
  } catch {
    const indice = await readFile(join(RAIZ, 'index.html'));
    respuesta.writeHead(200, encabezados('index.html')).end(indice);
  }
}).listen(PUERTO, () => {
  console.log(`Raiz servida en http://localhost:${PUERTO}`);
  console.log('Para probar sin conexion: F12 > Network > Offline y recargue.');
});
