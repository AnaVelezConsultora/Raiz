/**
 * Sube la version de Raiz en un solo comando.
 *
 *   node tools/versionar.mjs 0.3.0
 *
 * POR QUE UN SOLO NUMERO PARA TODO
 *
 * Raiz se entrega como una sola cosa: la aplicacion del celular, la API y el
 * contrato compartido salen juntos y solo tienen sentido juntos. Numerarlos por
 * separado obligaria a llevar en la cabeza que 0.4.0 del front habla con 0.2.1 de
 * la API, y esa cuenta nadie la lleva bien un martes ocupado.
 *
 * Cuando la aplicacion del celular deje de salir con el servidor —el dia que haya
 * varias versiones en campo a la vez, que va a pasar— esto se separa. Hoy seria
 * complejidad sin problema que resolver.
 *
 * QUE HACE Y QUE NO
 *
 * Cambia el numero en los tres paquetes y regenera los dos archivos estampados. NO
 * hace commit ni etiqueta: eso lo decide quien esta mirando, y una herramienta que
 * escribe en el historial sola es una que un dia escribe algo que nadie pidio.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAQUETES = ['dominio', 'api', 'frontend'];

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Uso: node tools/versionar.mjs <mayor.menor.parche>   ej: 0.3.0');
  process.exit(1);
}

for (const paquete of PAQUETES) {
  const ruta = join(RAIZ, paquete, 'package.json');
  const crudo = await readFile(ruta, 'utf8');
  const datos = JSON.parse(crudo);

  if (datos.version === version) {
    console.log(`  ${paquete}: ya estaba en ${version}`);
    continue;
  }

  // Se reemplaza la linea y no se reescribe el JSON entero: escribirlo con
  // JSON.stringify reordenaria o reindentaria el archivo y el diff de la version
  // quedaria enterrado en ruido.
  const nuevo = crudo.replace(
    /("version"\s*:\s*")\d+\.\d+\.\d+(")/,
    `$1${version}$2`
  );

  if (nuevo === crudo) {
    console.error(`  ${paquete}: no se encontro el campo version en package.json`);
    process.exit(1);
  }

  await writeFile(ruta, nuevo, 'utf8');
  console.log(`  ${paquete}: ${datos.version} -> ${version}`);
}

// Los archivos estampados se regeneran aqui y no se dejan para el proximo `build`:
// asi el commit de la version lleva TODO lo que cambia, y no queda un archivo
// generado apareciendo despues en el diff de otra persona.
const { execFileSync } = await import('node:child_process');
for (const paquete of ['api', 'frontend']) {
  execFileSync(process.execPath, ['tools/estampar-version.mjs'], {
    cwd: join(RAIZ, paquete),
    stdio: 'inherit'
  });
}

console.log(`
Version ${version} escrita. Falta lo que no hace esta herramienta:

  git add -A && git commit -m "Version ${version}"
  git tag -a v${version} -m "Raiz ${version}"
  git push origin main --follow-tags

La etiqueta es lo que convierte "el celular dice v${version}" en un commit exacto.
Y anote en docs/VERSIONES.md que cambio, en el idioma de la mesa y no en el de git.
`);
