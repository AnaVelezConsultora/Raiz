/**
 * Escribe src/environments/version.ts con la version de package.json.
 *
 * Lo corre npm solo, antes de `build` y de `start`, por los scripts `prebuild` y
 * `prestart`. Nadie tiene que acordarse.
 *
 * POR QUE SE GENERA EN VEZ DE ESCRIBIRLO A MANO
 *
 * Porque una version escrita en dos sitios se separa. El dia que alguien sube
 * package.json a 0.2.0 y olvida el otro archivo, el pie de la aplicacion sigue
 * diciendo 0.1.0 — y entonces el numero deja de servir justamente para lo que
 * existe: saber que version esta corriendo en el celular que reporta un problema.
 *
 * POR QUE EL ARCHIVO GENERADO SI SE VERSIONA
 *
 * Parece contradictorio y no lo es. La salida es DETERMINISTA: depende solo de
 * package.json, asi que no cambia entre compilaciones y no ensucia el historial.
 * Y tenerlo en el repositorio es lo que permite que `tsc --noEmit` del flujo de
 * verificacion compile sin ejecutar antes ningun paso de generacion.
 *
 * No lleva fecha ni hash de compilacion a proposito: eso lo haria cambiar en cada
 * corrida y volveria ruidoso cada diff.
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

const destino = join(RAIZ, 'src/environments/version.ts');

const contenido = `// GENERADO por tools/estampar-version.mjs. No editar a mano.
// La fuente es la version de frontend/package.json; para cambiarla, cambiela ahi.
export const VERSION = '${version}';
`;

// Se compara antes de escribir para no tocar la marca de tiempo del archivo cuando
// no cambio nada. Angular observa el sistema de archivos en modo watch, y
// reescribirlo igual dispararia una recompilacion en cada arranque.
const actual = await readFile(destino, 'utf8').catch(() => null);
if (actual !== contenido) {
  await writeFile(destino, contenido, 'utf8');
  console.log(`version ${version} estampada en src/environments/version.ts`);
}
