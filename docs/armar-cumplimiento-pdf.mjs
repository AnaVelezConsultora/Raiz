/**
 * Arma un PDF con los documentos del frente de datos y cumplimiento.
 *
 *   node docs/armar-cumplimiento-pdf.mjs
 *
 * POR QUE EXISTE
 *
 * El frente jurídico no usa GitHub y no tiene por qué. Pedirle a un abogado que
 * revise markdown en un repositorio es ponerle una barrera que no aporta nada: lo
 * que él tiene que leer es el texto, y lo que tiene que devolver son decisiones.
 *
 * Los documentos siguen viviendo en el repositorio —ahí se comparan versiones y se
 * sabe quién cambió qué— y esto es la salida imprimible para quien no entra ahí.
 *
 * En papel blanco y con tipografía de lectura, no con el negro de las presentaciones:
 * esto se imprime, se anota al margen y eventualmente se firma.
 *
 * Convierte un subconjunto de markdown, el que estos archivos usan. No es una
 * librería de markdown ni pretende serlo: si algún día hace falta más, se cambia por
 * una de verdad.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const AQUI = fileURLToPath(new URL('./', import.meta.url));
const SALIDA = `${AQUI}generado/`;

const DOCUMENTOS = [
  'cumplimiento/autorizacion.md',
  'cumplimiento/constancia-de-entrega.md',
  'cumplimiento/articulacion-institucional.md',
  'cumplimiento/README.md'
];

const escapar = (t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Marcas dentro de una línea: negrita, cursiva, código y enlaces. */
const enLinea = (t) =>
  escapar(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

/**
 * Markdown a HTML, solo lo que estos archivos usan.
 *
 * Se recorre línea por línea con un estado mínimo —dentro de lista, dentro de tabla,
 * dentro de cita— porque el alternativo es una expresión regular gigante que nadie
 * puede leer dentro de un mes.
 */
function aHtml(md) {
  const salida = [];
  let enLista = false;
  let enTabla = false;
  let enCita = false;

  const cerrarLista = () => { if (enLista) { salida.push('</ul>'); enLista = false; } };
  const cerrarTabla = () => { if (enTabla) { salida.push('</tbody></table>'); enTabla = false; } };
  const cerrarCita = () => { if (enCita) { salida.push('</blockquote>'); enCita = false; } };
  const cerrarTodo = () => { cerrarLista(); cerrarTabla(); cerrarCita(); };

  const lineas = md.split(/\r?\n/);

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const limpia = linea.trim();

    if (limpia === '') { cerrarLista(); cerrarCita(); continue; }

    if (limpia === '---') { cerrarTodo(); salida.push('<hr />'); continue; }

    const titulo = limpia.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      cerrarTodo();
      const n = titulo[1].length;
      salida.push(`<h${n}>${enLinea(titulo[2])}</h${n}>`);
      continue;
    }

    // Tabla: la línea de guiones se traga y abre el cuerpo.
    if (limpia.startsWith('|')) {
      const celdas = limpia.split('|').slice(1, -1).map((c) => c.trim());
      if (celdas.every((c) => /^-+:?$/.test(c.replace(/\s/g, '')))) continue;

      if (!enTabla) {
        cerrarLista(); cerrarCita();
        salida.push('<table><thead><tr>');
        salida.push(celdas.map((c) => `<th>${enLinea(c)}</th>`).join(''));
        salida.push('</tr></thead><tbody>');
        enTabla = true;
        continue;
      }
      salida.push(`<tr>${celdas.map((c) => `<td>${enLinea(c)}</td>`).join('')}</tr>`);
      continue;
    }
    cerrarTabla();

    if (limpia.startsWith('> ')) {
      if (!enCita) { cerrarLista(); salida.push('<blockquote>'); enCita = true; }
      salida.push(`<p>${enLinea(limpia.slice(2))}</p>`);
      continue;
    }
    cerrarCita();

    const punto = limpia.match(/^[-*]\s+(.*)$/);
    if (punto) {
      if (!enLista) { salida.push('<ul>'); enLista = true; }
      salida.push(`<li>${enLinea(punto[1])}</li>`);
      continue;
    }
    cerrarLista();

    salida.push(`<p>${enLinea(limpia)}</p>`);
  }

  cerrarTodo();
  return salida.join('\n');
}

const ESTILO = `
  @page { size: A4; margin: 18mm 16mm; }
  body {
    font-family: ui-serif, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
    font-size: 11.5pt;
    line-height: 1.55;
    color: #16181a;
    margin: 0;
  }
  .doc { page-break-after: always; }
  .doc:last-child { page-break-after: auto; }
  h1 { font-size: 20pt; line-height: 1.15; margin: 0 0 0.6rem; }
  h2 { font-size: 14pt; margin: 1.6rem 0 0.5rem; }
  h3 { font-size: 12pt; margin: 1.2rem 0 0.3rem; }
  p { margin: 0 0 0.7rem; text-align: justify; }
  ul { margin: 0 0 0.8rem; padding-left: 1.1rem; }
  li { margin-bottom: 0.35rem; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 1.4rem 0; }
  blockquote {
    margin: 0 0 0.9rem; padding-left: 0.9rem;
    border-left: 2px solid #999; color: #333; font-style: italic;
  }
  code {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.88em; background: #f2f1ee; padding: 0.05em 0.3em;
  }
  table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: 10pt; }
  th {
    text-align: left; border-bottom: 1.5px solid #333;
    padding: 0.3rem 0.5rem 0.3rem 0; font-size: 9pt; text-transform: uppercase;
    letter-spacing: 0.06em; font-weight: 600;
  }
  td { border-bottom: 1px solid #ddd; padding: 0.4rem 0.5rem 0.4rem 0; vertical-align: top; }
  a { color: inherit; }
  .portada { text-align: center; padding-top: 22vh; page-break-after: always; }
  .portada h1 { font-size: 26pt; }
  .portada p { text-align: center; color: #555; }
`;

const partes = [];
for (const ruta of DOCUMENTOS) {
  const md = await readFile(`${AQUI}${ruta}`, 'utf8');
  partes.push(`<section class="doc">${aHtml(md)}</section>`);
  console.log(`  ${ruta}`);
}

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Raíz · Datos y cumplimiento</title><style>${ESTILO}</style></head><body>
<section class="portada">
  <h1>Raíz</h1>
  <p>Frente de datos y cumplimiento</p>
  <p>Autorización de la persona afectada · Constancia de entrega y recepción ·
     Instrumento de articulación institucional</p>
  <p>Sevilla, Valle del Cauca · Agosto de 2026</p>
  <p>Borradores para revisión jurídica. La versión vigente de cada uno vive en el
     repositorio del proyecto; este PDF es una copia para leer y anotar.</p>
</section>
${partes.join('\n')}
</body></html>`;

await mkdir(SALIDA, { recursive: true });
const intermedio = `${SALIDA}cumplimiento.html`;
await writeFile(intermedio, html, 'utf8');

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto(pathToFileURL(intermedio).href, { waitUntil: 'load' });
await pagina.pdf({
  path: `${SALIDA}raiz-cumplimiento.pdf`,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:8pt;color:#888;padding:0 16mm;' +
    'font-family:Georgia,serif;display:flex;justify-content:space-between">' +
    '<span>Raíz · Datos y cumplimiento</span>' +
    '<span class="pageNumber"></span></div>',
  margin: { top: '18mm', right: '16mm', bottom: '16mm', left: '16mm' }
});
await navegador.close();

console.log(`\ndocs/generado/raiz-cumplimiento.pdf`);
