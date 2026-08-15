/**
 * Escribe src/version.ts con la version de package.json.
 *
 * Es el gemelo del que ya existe en frontend/tools, y por la misma razon: una
 * version escrita a mano en dos sitios se separa, y el dia que se separa deja de
 * servir para lo unico que existe, que es saber que esta corriendo.
 *
 * POR QUE LA API TAMBIEN LA NECESITA
 *
 * Cuando un lider llame a decir que algo no le funciona, el pie de la aplicacion
 * dice que version tiene el celular. Falta la otra mitad: contra que version del
 * servidor esta hablando. Con las dos, un problema se ubica en un minuto; con una
 * sola, se adivina.
 *
 * POR QUE SE GENERA Y NO SE LEE package.json EN CALIENTE
 *
 * Leerlo al arrancar obligaria a razonar sobre rutas relativas dentro de la imagen,
 * que es un sitio donde el codigo se ejecuta con otra forma de carpetas. Un archivo
 * generado en compilacion no tiene ese problema y ademas queda en el paquete.
 *
 * No lleva fecha ni hash a proposito: haria cambiar el archivo en cada corrida y
 * ensuciaria cada diff.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const paquete = JSON.parse(await readFile(join(RAIZ, 'package.json'), 'utf8'));
const version = paquete.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`La version de package.json no es semantica: "${version}"`);
  process.exit(1);
}

const destino = join(RAIZ, 'src/version.ts');

const contenido = `// GENERADO por tools/estampar-version.mjs. No editar a mano.
// La fuente es la version de api/package.json; para cambiarla, cambiela ahi.
export const VERSION = '${version}';
`;

const actual = await readFile(destino, 'utf8').catch(() => null);
if (actual !== contenido) {
  await writeFile(destino, contenido, 'utf8');
  console.log(`version ${version} estampada en src/version.ts`);
}
