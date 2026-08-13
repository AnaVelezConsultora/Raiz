# Raíz — Roles y esfuerzo

Corte: 13 de agosto de 2026.

Este documento responde tres preguntas: quién responde por qué, cuánto cuesta cada
frente y en qué orden se hace.

No confundir con los **roles de usuario dentro de la aplicación** (coordinador,
custodio, validador, digitador, líder), que son permisos de acceso a datos y están
descritos en [FRENTES.md](FRENTES.md). Aquí se habla de roles del equipo de trabajo.

---

## 1. Roles del equipo

Son responsabilidades, no cargos. Una persona puede tener dos, pero **ninguna
responsabilidad puede quedar sin dueño**.

| Rol | De qué responde | Cuántos |
|---|---|---|
| **Coordinación técnica** | Arquitectura, decide cuando hay empate, revisa e integra lo que llega. No toma frentes: si se mete a programar un frente, deja de revisar y el cuello de botella se traslada. | 1 |
| **Dueño de frente** | Que su frente avance. No tiene que hacerlo solo, pero es a quien se le pregunta. Reporta bloqueos temprano, no el día de la entrega. | 1 por frente activo |
| **Custodio de datos** | Accesos, cumplimiento de la Ley 1581, y es el único que exporta datos nominales. Tiene poder de veto sobre cualquier cosa que exponga información de familias. | 1 |
| **Prueba en campo** | Probar en celulares reales y reportar lo que no sirve. No requiere programar. | 2 a 3 |
| **Enlace con la mesa** | Traduce lo que la mesa operativa necesita a tareas concretas, y devuelve a la mesa qué se puede y qué no. Evita que el equipo construya lo que nadie pidió. | 1 |
| **Contribuyente** | Toma tareas puntuales sin responder por un frente completo. Es la puerta de entrada natural para quien tiene poco tiempo. | Los que se sumen |

### Reglas de operación

1. **Nadie es dueño de más de un frente al tiempo.** Dos frentes a medias valen menos
   que uno terminado.
2. **Un frente sin dueño está detenido, no "en progreso".** Se dice así en los
   reportes.
3. **Quien toma un frente lo anuncia en el grupo.** Sin anuncio no hay asignación, y
   dos personas terminan escribiendo el mismo código.
4. **El custodio de datos puede frenar cualquier entrega.** Es el único veto
   unilateral del proyecto y existe porque el daño de una filtración no se revierte.
5. **Si alguien desaparece dos semanas, el frente se libera.** Sin reproches: es
   trabajo voluntario. Pero el frente vuelve a estar disponible.

---

## 2. Cómo estimamos

En puntos de historia, por complejidad relativa, no en horas.

**No se divide el esfuerzo por persona.** Un frente de 8 puntos son 8 puntos lo haga
una persona o tres. Estimar en horas por individuo en un equipo voluntario produce
números falsos: nadie sabe cuántas horas va a tener la próxima semana.

La escala es Fibonacci: 1, 2, 3, 5, 8, 13. Un 13 es señal de que el frente debería
partirse.

**La velocidad del equipo todavía no se conoce.** Se calcula después de dos ciclos de
dos semanas, contando lo efectivamente terminado. Cualquier fecha que se prometa antes
de eso es inventada.

---

## 3. Esfuerzo por frente

| Frente | Puntos | Estado | Depende de |
|---|---|---|---|
| F1 Captura offline | 13 | Terminado | — |
| F2 Identidad y acceso | 8 | Código terminado. Queda **2** de trabajo operativo | — |
| F3 Sincronización y servidor | 8 | Pendiente | F2 |
| F4 Tablero y mapa | 8 | Pendiente | — |
| F5 Remisiones y seguimiento | 13 | Pendiente | F2 |
| F6 Calidad y prueba en campo | 5 por ciclo | Continuo | — |
| F7 Datos y cumplimiento | 5 | Pendiente | — |
| F8 Multi-municipio | 8 | Pendiente | Hito 1 cerrado |
| F9 Despliegue e integración continua | 3 | Pendiente | — |

**Terminado: 21 puntos. Pendiente: 52 puntos.**

### Escenarios de calendario

Son hipótesis para calibrar, no compromisos. Un ciclo son dos semanas.

| Equipo | Velocidad estimada | Los 52 puntos |
|---|---|---|
| 3 personas · 2 h/semana | 6 a 8 puntos por ciclo | 7 a 9 ciclos · unos 4 meses |
| 5 personas · 3 h/semana | 12 a 15 puntos por ciclo | 4 a 5 ciclos · unos 2 meses |
| 8 personas · 4 h/semana | 20 a 25 puntos por ciclo | 2 a 3 ciclos · unas 6 semanas |

Se recalcula al terminar el segundo ciclo con datos reales. Hasta entonces, en el
grupo se habla de **hitos**, no de fechas.

---

## 4. Hitos

Cada hito deja algo que se puede usar o mostrar. Un hito que no cambia nada para nadie
no es un hito.

### Hito 1 — Captura real · 15 puntos

**F2 operativo (2) + F3 (8) + F6 (5)**

El líder captura en la vereda sin señal, baja al pueblo, sincroniza, y el dato llega a
la base central. Es el ciclo completo de la herramienta.

Sin esto, todo lo demás es teoría. **Es el hito que importa.**

### Hito 2 — Evidencia · 16 puntos

**F4 (8) + F7 (5) + F9 (3)**

Cifras y mapa que se le pueden mostrar a una entidad para sustentar una petición, con
el marco de protección de datos en regla y despliegue automático en cada cambio.

### Hito 3 — Exigibilidad · 13 puntos

**F5 (13)**

Registro de a qué entidad se remitió cada familia, con radicado, respuesta y días sin
responder. Es lo que convierte una base de datos en un instrumento de presión.

### Hito 4 — Escala · 8 puntos

**F8 (8)**

Otro municipio puede usar Raíz sin tocar código.

---

## 5. Qué hay que asignar hoy

| Responsabilidad | Estado |
|---|---|
| Coordinación técnica | Asignada |
| Custodio de datos | **Sin dueño** |
| Enlace con la mesa | **Sin dueño** |
| Dueño de F3 | **Sin dueño** — bloquea el Hito 1 |
| Dueño de F4 | **Sin dueño** |
| Prueba en campo (F6) | **Sin dueño** — es lo más urgente |
| Dueño de F7 | **Sin dueño** |

Las dos primeras no son técnicas y son las que más rápido se vuelven un problema si
nadie las toma: sin custodio de datos no hay quien autorice una exportación, y sin
enlace con la mesa el equipo construye lo que cree, no lo que se necesita.

---

## 6. Ritmo de trabajo

- **Ciclos de dos semanas.** Al final de cada uno, cada dueño de frente dice en tres
  líneas: qué terminó, qué sigue, qué lo bloquea.
- **Nada se da por terminado sin que alguien más lo haya probado.** En un equipo
  voluntario y disperso, "ya quedó" sin verificación es el origen de la mayoría de los
  retrasos.
- **Lo que se decide se escribe en el repositorio.** Lo que solo vive en el chat se
  pierde en dos semanas.
- **Los bloqueos se reportan el día que aparecen.** Un bloqueo callado durante una
  semana cuesta un ciclo entero.

---

Repositorio: <https://github.com/anavelezconsultoria/raiz>
