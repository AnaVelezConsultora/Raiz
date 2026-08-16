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
  <svg class="recorrido" viewBox="0 0 900 260" role="img"
       aria-label="Recorrido de un caso: se captura sin senal en la vereda, viaja al llegar la senal, queda en el registro unico y se remite a la entidad con radicado">
    <defs>
      <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#7b8071" />
      </marker>
    </defs>

    <!-- bandas: sin senal / con senal -->
    <rect x="0" y="0" width="430" height="52" fill="#e7dfc9" />
    <rect x="450" y="0" width="450" height="52" fill="#dfe4d4" />
    <text x="18" y="33" font-family="ui-monospace, monospace" font-size="15"
          letter-spacing="2" fill="#7f5406">SIN SEÑAL · LA VEREDA</text>
    <text x="468" y="33" font-family="ui-monospace, monospace" font-size="15"
          letter-spacing="2" fill="#2b3a2e">CON SEÑAL · EL PUEBLO</text>

    <!-- 1. captura -->
    <rect x="18" y="86" width="180" height="120" rx="10" fill="#fbf6ea" stroke="#d8cfb8" />
    <text x="38" y="120" font-family="ui-serif, Georgia, serif" font-size="21" fill="#232b24">1 · Registra</text>
    <text x="38" y="148" font-size="15" fill="#4b544a">La familia, la casa,</text>
    <text x="38" y="170" font-size="15" fill="#4b544a">la coordenada y las</text>
    <text x="38" y="192" font-size="15" fill="#4b544a">fotos. Sin internet.</text>

    <!-- 2. guarda -->
    <rect x="230" y="86" width="180" height="120" rx="10" fill="#fbf6ea" stroke="#d8cfb8" />
    <text x="250" y="120" font-family="ui-serif, Georgia, serif" font-size="21" fill="#232b24">2 · Se guarda</text>
    <text x="250" y="148" font-size="15" fill="#4b544a">En el celular, de una.</text>
    <text x="250" y="170" font-size="15" fill="#4b544a">Aunque se apague o</text>
    <text x="250" y="192" font-size="15" fill="#4b544a">se cierre la app.</text>

    <line x1="204" y1="146" x2="226" y2="146" stroke="#7b8071" stroke-width="2" marker-end="url(#punta)" />
    <line x1="416" y1="146" x2="462" y2="146" stroke="#7b8071" stroke-width="2" marker-end="url(#punta)" />

    <!-- 3. viaja -->
    <rect x="468" y="86" width="180" height="120" rx="10" fill="#fbf6ea" stroke="#d8cfb8" />
    <text x="488" y="120" font-family="ui-serif, Georgia, serif" font-size="21" fill="#232b24">3 · Viaja</text>
    <text x="488" y="148" font-size="15" fill="#4b544a">El caso se envía solo;</text>
    <text x="488" y="170" font-size="15" fill="#4b544a">las fotos esperan el</text>
    <text x="488" y="192" font-size="15" fill="#4b544a">botón o el wifi.</text>

    <line x1="654" y1="146" x2="696" y2="146" stroke="#7b8071" stroke-width="2" marker-end="url(#punta)" />

    <!-- 4. exigible -->
    <rect x="702" y="86" width="180" height="120" rx="10" fill="#2b3a2e" />
    <text x="722" y="120" font-family="ui-serif, Georgia, serif" font-size="21" fill="#fbf6ea">4 · Se exige</text>
    <text x="722" y="148" font-size="15" fill="#dfe4d4">Código propio, remisión</text>
    <text x="722" y="170" font-size="15" fill="#dfe4d4">a la entidad, radicado</text>
    <text x="722" y="192" font-size="15" fill="#dfe4d4">y días sin respuesta.</text>

    <text x="18" y="240" font-size="15" fill="#7b8071">
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
