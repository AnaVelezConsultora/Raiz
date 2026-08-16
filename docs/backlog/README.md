# Backlog

Estructura: **hitos numerados → apartados → historias de usuario.**

El numeral lleva la jerarquía. `HU 1.2.4` es la cuarta historia del segundo
apartado del hito 1. Con eso, una tarjeta suelta en cualquier parte se ubica sola
sin necesidad de mirar el tablero.

| Hito | Qué deja | Historias |
|---|---|---|
| **0 · Base construida** | Lo que ya funciona y no se reescribe | 4 |
| **1 · Captura real** | El líder captura sin señal, sincroniza, y el dato llega | 23 |
| **2 · Evidencia** | Cifras y mapa para sustentar una petición ante una entidad | 8 |
| **3 · Exigibilidad** | Remisión con radicado, mora medida, respuesta registrada | 5 |
| **4 · Escala** | Otro municipio usa Raíz sin tocar código | 3 |

Los hitos 1 a 4 son los mismos de
[ROLES-Y-ESFUERZO.md](../ROLES-Y-ESFUERZO.md). El hito 0 se agrega para que quien
llegue vea de dónde parte y no rehaga lo que ya está.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `tablero-raiz.json` | **Fuente de verdad.** Se edita este; el CSV se regenera |
| `tablero-raiz.csv` | Para la importación por CSV de Trello |

**Las herramientas que hablan con Trello no viven aquí.** Crear el tablero,
marcar lo cerrado y tomar una historia son tareas de quien cura el tablero, no
del producto: no las corre quien contribuye, no las ejecuta el despliegue y
ninguna es necesaria para levantar el proyecto. Quedaron fuera del repositorio, y
quien las necesite las pide.

Lo que sí es del repositorio es este directorio: el backlog en JSON, que es lo
que se cita desde `ESTADO.md` y desde las propuestas de cambio, y que sigue
sirviendo aunque nadie tenga credenciales de Trello a mano.

Si al usar esas herramientas sale `401 invalid key`, el problema es la **clave**,
no el token, y generar un token nuevo no arregla nada porque el enlace de
autorización lleva la clave dentro.

---

## Cómo se lee el tablero

**Listas:** una por hito. Las historias se ordenan por su numeral, así que los
apartados quedan agrupados dentro de cada lista.

**Etiquetas de capacidad** — `FrontEnd`, `BackEnd`, `Infra`, `sin código`:
dicen **qué perfil requiere** cada historia, no a quién se asigna. Las 15
personas del equipo son contribuyentes y toman lo que pueden. Coordinación,
custodia de datos y enlace con la mesa se manejan fuera de este tablero.

**Etiquetas de estado** — `bloqueada` no se puede tomar todavía y el campo
*Depende de* dice qué falta; `hecha` ya está; `defecto` corrige algo que no
funciona como la documentación afirma; `decisión F7` no es trabajo de
programación sino una decisión con consecuencia jurídica y operativa.

---

## Por dónde empezar

Cuatro historias desbloquean a casi todas las demás:

| Historia | Desbloquea |
|---|---|
| **HU 1.2.1** Contrato de la API | casi todo el trabajo de backend |
| **HU 1.1.1** Infraestructura reproducible | el hito 1 completo |
| **HU 1.4.2** Vista previa por propuesta | que se pueda probar desde un celular |
| **HU 1.5.1** Decisión sobre el teléfono | la restricción de consentimiento |

Al salir de Supabase se pierde la API automática: **hay que escribirla y hoy no
existe**. Es el bloque de trabajo más grande y donde está la mayor capacidad del
equipo. Definir el contrato antes de repartir es lo que evita que doce personas
colisionen en la primera semana.

Y hay tres historias que se pueden tomar hoy sin depender de nada:
**HU 1.3.1** (que el sistema no borre lo capturado), **HU 1.3.2** (que la cola no
mienta sobre lo pendiente) y **HU 1.4.1** (probar en un Android real). Las dos
primeras corrigen defectos que hoy le pueden costar la jornada a un voluntario; la
tercera no requiere escribir código y es, según el propio repositorio, la tarea de
mayor impacto.

---

## De dónde sale cada historia

Ninguna es invento: cada una cita su origen en el campo *Origen*.

- [FRENTES.md](../FRENTES.md) y [ESTADO.md](../ESTADO.md) — objetivo y frentes
- [ROLES-Y-ESFUERZO.md](../ROLES-Y-ESFUERZO.md) — los hitos 1 a 4
- [hallazgos-revision.md](../hallazgos-revision.md) — los defectos y las decisiones
- [ADR 002](../adr/002-infraestructura-en-aws.md), [003](../adr/003-contrato-de-sincronizacion.md), [004](../adr/004-modelo-de-entrega.md) — plataforma, sincronización y entrega
- [SEGURIDAD.md](../../supabase/SEGURIDAD.md) y [cumplimiento/](../cumplimiento/) — control de acceso y protección de datos

## Al cambiar el backlog

Se edita `tablero-raiz.json` y se regenera el CSV. La numeración no se reordena:
si una historia se descarta, su numeral se retira y no se reutiliza, para que las
referencias en propuestas de cambio y en el chat sigan apuntando a lo mismo.
