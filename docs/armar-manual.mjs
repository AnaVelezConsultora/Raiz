/**
 * Arma docs/manual.html desde la plantilla, las capturas y el diagrama.
 *
 *   node docs/capturar-manual.mjs   (primero, con la PWA servida)
 *   node docs/armar-manual.mjs
 *
 * Las imagenes se embeben en el archivo. Un manual que se manda por WhatsApp y se
 * abre sin internet no puede depender de que las fotos esten en otro sitio.
 *
 * El sello es opcional a proposito: si `public/marca/raiz.png` no esta, la portada
 * simplemente no lo muestra. El manual no puede dejar de existir por un archivo de
 * identidad.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('./', import.meta.url));
const CAPTURAS = `${AQUI}capturas/manual/`;
const SELLO = `${AQUI}../frontend/public/marca/raiz.png`;

const IMAGENES = {
  IMG_01: '01-entrar.png',
  IMG_02: '02-lista-vacia.png',
  IMG_03: '03-quien-reporta.png',
  IMG_04: '04-autorizacion.png',
  IMG_05: '05-coordenada.png',
  IMG_06: '06-descuadre.png',
  IMG_07: '07-edades.png',
  IMG_08: '08-heridos.png',
  IMG_09: '09-riesgo.png',
  IMG_10: '10-cultivos.png',
  IMG_11: '11-cierre.png',
  IMG_12: '12-lista-con-caso.png',
  IMG_13: '13-sin-conexion.png'
};

/**
 * El recorrido de un caso, en un dibujo.
 *
 * Va en linea y no en caja con flechas cruzadas: lo que hay que entender es que
 * PRIMERO se captura sin senal y DESPUES se envia, y eso es una secuencia. Un
 * diagrama con cajas por todos lados obligaria a explicar el diagrama.
 */
const DIAGRAMA = `
<figure>
  <svg class="recorrido" viewBox="0 0 900 230" role="img"
       aria-label="Recorrido de un caso: se registra sin senal en la vereda, se guarda en el celular, viaja al llegar la senal, y termina en una remision a la entidad con radicado">
    <defs>
      <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
      </marker>
    </defs>

    <g font-family="ui-monospace, monospace" font-size="13" letter-spacing="1.6"
       fill="var(--tinta-tenue)">
      <text x="0" y="14">SIN SEÑAL · LA VEREDA</text>
      <text x="470" y="14">CON SEÑAL · EL PUEBLO</text>
    </g>

    <!-- La linea de tiempo. Una sola, continua: el caso no cambia de manos, cambia
         de momento. La marca vertical es donde aparece la senal. -->
    <line x1="0" y1="34" x2="430" y2="34" stroke="var(--linea)" stroke-width="6" />
    <line x1="470" y1="34" x2="900" y2="34" stroke="var(--verde)" stroke-width="6" />
    <line x1="450" y1="20" x2="450" y2="48" stroke="var(--tinta-tenue)" stroke-width="2"
          stroke-dasharray="3 3" />

    <g fill="var(--tinta)" font-family="ui-serif, Georgia, serif" font-size="20">
      <text x="0" y="86">1 · Registra</text>
      <text x="235" y="86">2 · Se guarda</text>
      <text x="470" y="86">3 · Viaja</text>
      <text x="705" y="86">4 · Se exige</text>
    </g>

    <g fill="var(--tinta-suave)" font-size="14">
      <text x="0" y="112">La familia, la casa,</text>
      <text x="0" y="132">la coordenada y las</text>
      <text x="0" y="152">fotos. Sin internet.</text>

      <text x="235" y="112">En el celular, de una.</text>
      <text x="235" y="132">Aunque se apague o</text>
      <text x="235" y="152">se cierre la aplicación.</text>

      <text x="470" y="112">El caso se envía solo;</text>
      <text x="470" y="132">las fotos esperan el</text>
      <text x="470" y="152">botón o el wifi.</text>

      <text x="705" y="112">Código propio, remisión</text>
      <text x="705" y="132">a la entidad, radicado</text>
      <text x="705" y="152">y días sin respuesta.</text>
    </g>

    <g stroke="var(--tinta-tenue)" stroke-width="1.5" color="var(--tinta-tenue)">
      <line x1="196" y1="60" x2="222" y2="60" marker-end="url(#punta)" />
      <line x1="431" y1="60" x2="457" y2="60" marker-end="url(#punta)" />
      <line x1="666" y1="60" x2="692" y2="60" marker-end="url(#punta)" />
    </g>

    <text x="0" y="196" font-size="14" fill="var(--tinta-tenue)">
      Entre el paso 2 y el 3 pueden pasar horas o días. El caso no se pierde.
    </text>
  </svg>
  <figcaption>El recorrido de un caso, desde la vereda hasta la entidad que tiene que responder.</figcaption>
</figure>`;

const comoDatos = async (ruta, tipo) => {
  const binario = await readFile(ruta);
  return `data:${tipo};base64,${binario.toString('base64')}`;
};

let html = await readFile(`${AQUI}manual.template.html`, 'utf8');

for (const [marcador, archivo] of Object.entries(IMAGENES)) {
  html = html.replaceAll(`{{${marcador}}}`, await comoDatos(`${CAPTURAS}${archivo}`, 'image/png'));
  console.log(`  ${marcador} <- ${archivo}`);
}

html = html.replaceAll('{{DIAGRAMA}}', DIAGRAMA);

// El sello, si esta. Si no, la portada lo oculta sola con su `onerror`.
try {
  html = html.replaceAll('{{IMG_SELLO}}', await comoDatos(SELLO, 'image/png'));
  console.log('  IMG_SELLO <- frontend/public/marca/raiz.png');
} catch {
  html = html.replaceAll('{{IMG_SELLO}}', '');
  console.log('  IMG_SELLO: no esta el sello, la portada sale sin el');
}

const pendientes = html.match(/\{\{[A-Z_0-9]+\}\}/g);
if (pendientes) {
  console.error(`Quedaron marcadores sin llenar: ${[...new Set(pendientes)].join(', ')}`);
  process.exit(1);
}

await writeFile(`${AQUI}manual.html`, html);
console.log(`\ndocs/manual.html armado (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
