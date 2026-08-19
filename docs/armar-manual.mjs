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

/**
 * El ciclo completo, de la vereda al radicado.
 *
 * Tres carriles horizontales, uno por sitio donde vive el caso: el celular, el
 * servidor y la entidad. Se leen de arriba hacia abajo porque eso es lo que pasa:
 * el caso baja de manos. Dentro de cada carril, de izquierda a derecha.
 *
 * Las reglas que protegen a la familia van escritas AL LADO del paso donde actuan y
 * no en una leyenda aparte: una leyenda obliga a mirar dos veces y en una proyeccion
 * nadie lo hace.
 */
const DIAGRAMA_CICLO = `
<figure>
  <svg class="recorrido" viewBox="0 0 900 470" role="img"
       aria-label="Ciclo completo: el lider registra y guarda en el celular; al haber senal el caso viaja al servidor, que le asigna codigo y no lo duplica; la mesa lo verifica y lo remite a una entidad con radicado; se miden los dias sin respuesta hasta que la entidad contesta. Aparte, el mapa publico muestra la afectacion sin identidad.">
    <defs>
      <marker id="p2" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
      </marker>
    </defs>

    <g font-family="ui-monospace, monospace" font-size="12" letter-spacing="1.6"
       fill="var(--tinta-tenue)">
      <text x="0" y="12">EN EL CELULAR DEL LÍDER</text>
      <text x="0" y="182">EN EL SERVIDOR</text>
      <text x="0" y="352">ANTE LA ENTIDAD</text>
    </g>

    <g stroke="var(--linea)" stroke-width="1">
      <line x1="0" y1="24" x2="900" y2="24" />
      <line x1="0" y1="194" x2="900" y2="194" />
      <line x1="0" y1="364" x2="900" y2="364" />
    </g>

    <!-- carril 1: el celular -->
    <g fill="var(--tinta)" font-family="ui-serif, Georgia, serif" font-size="18">
      <text x="0" y="56">Registra</text>
      <text x="240" y="56">Guarda</text>
      <text x="480" y="56">Sincroniza</text>
    </g>
    <g fill="var(--tinta-suave)" font-size="13.5">
      <text x="0" y="78">Cuatro pasos, sin señal.</text>
      <text x="0" y="96">Coordenada y fotos.</text>

      <text x="240" y="78">En el celular, de una.</text>
      <text x="240" y="96">Sobrevive al apagón.</text>

      <text x="480" y="78">El caso viaja solo al</text>
      <text x="480" y="96">haber señal; las fotos,</text>
      <text x="480" y="114">con el botón o con wifi.</text>
    </g>
    <g fill="var(--ladrillo)" font-size="13">
      <text x="0" y="126">Sin autorización no se</text>
      <text x="0" y="144">guarda nombre ni documento.</text>
    </g>

    <!-- carril 2: el servidor -->
    <g fill="var(--tinta)" font-family="ui-serif, Georgia, serif" font-size="18">
      <text x="0" y="226">Recibe y responde</text>
      <text x="330" y="226">Registro único</text>
      <text x="640" y="226">La mesa verifica</text>
    </g>
    <g fill="var(--tinta-suave)" font-size="13.5">
      <text x="0" y="248">Comprueba quién envía y</text>
      <text x="0" y="266">le asigna el código</text>
      <text x="0" y="284">institucional RZ-2026-…</text>

      <text x="330" y="248">Una familia, una fila.</text>
      <text x="330" y="266">Reenviar el mismo caso</text>
      <text x="330" y="284">lo actualiza, no lo duplica.</text>

      <text x="640" y="248">Contacta, confirma y</text>
      <text x="640" y="266">depura repetidos. Cada</text>
      <text x="640" y="284">cambio queda auditado.</text>
    </g>
    <g fill="var(--ladrillo)" font-size="13">
      <text x="330" y="314">Cada líder ve solo lo suyo. La base lo impone, no la pantalla.</text>
    </g>

    <!-- carril 3: la entidad -->
    <g fill="var(--tinta)" font-family="ui-serif, Georgia, serif" font-size="18">
      <text x="0" y="396">Remite con radicado</text>
      <text x="330" y="396">Mide la mora</text>
      <text x="640" y="396">Responde y cierra</text>
    </g>
    <g fill="var(--tinta-suave)" font-size="13.5">
      <text x="0" y="418">A la entidad que le</text>
      <text x="0" y="436">corresponde según el daño.</text>

      <text x="330" y="418">Cuántos días lleva esa</text>
      <text x="330" y="436">entidad sin contestar.</text>

      <text x="640" y="418">Queda el rastro: quién</text>
      <text x="640" y="436">remitió, qué contestaron.</text>
    </g>

    <!-- bajadas entre carriles -->
    <g stroke="var(--tinta-tenue)" stroke-width="1.5" color="var(--tinta-tenue)">
      <path d="M700 120 L700 150 L60 150 L60 200" fill="none" marker-end="url(#p2)" />
      <path d="M760 290 L760 320 L60 320 L60 370" fill="none" marker-end="url(#p2)" />
      <line x1="196" y1="48" x2="228" y2="48" marker-end="url(#p2)" />
      <line x1="420" y1="48" x2="468" y2="48" marker-end="url(#p2)" />
      <line x1="270" y1="218" x2="318" y2="218" marker-end="url(#p2)" />
      <line x1="560" y1="218" x2="628" y2="218" marker-end="url(#p2)" />
      <line x1="270" y1="388" x2="318" y2="388" marker-end="url(#p2)" />
      <line x1="560" y1="388" x2="628" y2="388" marker-end="url(#p2)" />
    </g>

    <text x="700" y="146" font-size="12.5" fill="var(--tinta-tenue)">al haber señal</text>
    <text x="760" y="316" font-size="12.5" fill="var(--tinta-tenue)">cuando el caso está verificado</text>
  </svg>
  <figcaption>
    Aparte de este recorrido, el mapa público muestra cada afectación sin nombre, sin
    documento y sin teléfono, con la coordenada redondeada a unos cien metros.
  </figcaption>
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

html = html.replaceAll(
  '{{IMG_TABLERO}}',
  await comoDatos(`${AQUI}capturas/tablero.jpg`, 'image/jpeg')
);
console.log('  IMG_TABLERO <- capturas/tablero.jpg');

html = html.replaceAll('{{DIAGRAMA}}', DIAGRAMA);
html = html.replaceAll('{{DIAGRAMA_CICLO}}', DIAGRAMA_CICLO);

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
