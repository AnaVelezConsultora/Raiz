#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directorio = dirname(fileURLToPath(import.meta.url));
const rutaJson = join(directorio, "tablero-raiz.json");
const rutaCsv = join(directorio, "tablero-raiz.csv");
const modelo = JSON.parse(await readFile(rutaJson, "utf8"));

const filas = [
  ["Name", "Description", "Labels", "List", "Due Date", "Members"],
];

for (const hito of modelo.hitos) {
  for (const apartado of hito.apartados) {
    for (const hu of apartado.hus) {
      filas.push([
        `${hu.id} · ${hu.titulo}`,
        descripcion(hu, apartado),
        hu.etiquetas.join(","),
        `Hito ${hito.numero} · ${hito.nombre}`,
        "",
        miembroAsignado(hu, modelo.personas),
      ]);
    }
  }
}

await writeFile(
  rutaCsv,
  `${filas.map((fila) => fila.map(celdaCsv).join(",")).join("\n")}\n`,
);

function descripcion(hu, apartado) {
  const bloques = [
    `Apartado ${apartado.numero} · ${apartado.nombre}`,
    `Como ${hu.como}, quiero ${hu.quiero}, para ${hu.para}.`,
  ];

  if (hu.nota) bloques.push(`Nota:\n${hu.nota}`);
  if (hu.criterios?.length) {
    bloques.push(
      `Criterios de aceptacion:\n${hu.criterios.map((criterio) => `- ${criterio}`).join("\n")}`,
    );
  }

  const referencias = [
    ["Responsable", hu.asignado],
    ["Origen", hu.origen],
    ["Depende de", hu.depende_de],
    ["Desbloquea", hu.desbloquea],
    ["Bloquea", hu.bloquea],
  ]
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => `${etiqueta}: ${valor}`);

  if (referencias.length) bloques.push(referencias.join("\n"));
  return bloques.join("\n\n");
}

function miembroAsignado(hu, personas) {
  if (!hu.asignado) return "";
  return personas[hu.asignado]?.trello ?? "";
}

function celdaCsv(valor) {
  const texto = String(valor ?? "");
  if (!/[",\n\r]/.test(texto)) return texto;
  return `"${texto.replaceAll('"', '""')}"`;
}
