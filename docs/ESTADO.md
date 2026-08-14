# Raíz — Estado del proyecto

Corte: 13 de agosto de 2026. Sevilla, Valle del Cauca.

Documento para el equipo técnico voluntario. Se actualiza cuando cambie algo
sustantivo, no cada día.

---

## 1. Objetivo

Caracterizar a cada familia afectada **una sola vez**, con datos que la entidad
competente pueda usar, y acompañar cada caso hasta que alguien responda por él.

1. **Remitir.** Entregar a cada entidad el reporte que le corresponde, con radicado.
2. **Hacer seguimiento.** Saber qué pasó con cada familia: si fue verificada, a quién
   se remitió, qué respondieron y cuántos días lleva sin respuesta.
3. **Ser puente.** Dejar la caracterización lista para que la cooperación
   internacional actúe sin volver a levantar información desde cero.

No es un censo para tener una cifra. Es un instrumento de seguimiento y de
representación de las familias.

### La restricción que define el diseño

No hay capacidad de ir al terreno y en la zona veredal no hay señal. Quien captura es
un líder que ya vive allá, con el celular que ya tiene. Por eso la aplicación funciona
sin conexión y sincroniza después. Cualquier decisión técnica que rompa eso está mal,
por elegante que sea.

---

## 2. Decisiones tomadas

Están cerradas. Si alguien quiere reabrir una, que traiga argumentos nuevos.

| Decisión | Por qué |
|---|---|
| **Una sola base de datos, no tres** | Se pidieron tres bases: rural, urbana y convenio. Una familia rural afiliada entraría en dos listados y los totales no cuadrarían al compararlos entre entidades. El total consolidado es la palanca de negociación. Los tres reportes son filtros sobre el mismo dato. |
| **La unidad de registro es el hogar, no la vivienda** | Un inmueble puede alojar varias familias. Contar viviendas subestima la emergencia. |
| **Los arrendatarios se registran** | Perdieron el techo aunque no sean dueños. Si no quedan en el listado, no aplican a subsidio de arriendo. |
| **Las familias no afiliadas se registran** | El censo se levanta por comités y asociaciones, pero la familia sin organización es la que más riesgo tiene de quedar invisible. |
| **El código del caso lo asigna el servidor** | Dos voluntarios sin señal generarían el mismo consecutivo. En el dispositivo se usa un código local `L-XXXX-NNN` hasta que el servidor confirme. |
| **Iniciar sesión exige conexión, capturar no** | Un token que caduca en el monte no puede costar una jornada de trabajo. Solo sincronizar exige sesión vigente. |
| **La sincronización nunca es automática** | En zona rural la señal aparece y desaparece. Un envío automático consume los datos del voluntario sin que él lo decida. El botón es explícito. |
| **KoboToolbox corre en paralelo y no se detiene** | La emergencia no espera a que terminemos. Las columnas de PostgreSQL replican los nombres del formulario de Kobo, así que migrar es una carga, no una reescritura. |

---

## 3. Dónde estamos

### Funcionando y verificado

**Captura sin conexión.** Formulario de cuatro pasos con guardado incremental: si se
cierra la aplicación en el paso 3, al volver el registro sigue ahí. Fotos comprimidas
en el dispositivo a unos 200 KB, y coordenada GPS por satélite, que no requiere
internet.

**Cola de sincronización.** Envía casos antes que fotos, prioridad de riesgo de vida
primero, secuencial y no en paralelo, con idempotencia por `origen_id`: si el envío
llega al servidor pero la respuesta se pierde por corte de señal, el reintento
actualiza la misma fila en lugar de crear un duplicado.

**Identidad y roles (F2).** Cinco roles, guardas de ruta, pantalla de acceso, permisos
derivados del rol y disparador que crea el perfil al dar de alta un usuario, con el rol
menos privilegiado por defecto. El código está; falta el servidor.

**Modelo de datos.** 11 tablas, 5 vistas, políticas de acceso por fila, auditoría de
cambios y vista pública anonimizada con la coordenada redondeada a tres decimales
(~110 m): ubica la afectación, no la vivienda.

**Vía paralela operativa.** Formulario XLSForm de 125 preguntas listo para
KoboToolbox, plantilla fija de reporte por WhatsApp y tablero estático con mapa. Eso
permite empezar a capturar hoy mientras la aplicación propia madura.

**Entorno local reproducible.** `entorno/` levanta PostgreSQL con el esquema completo,
almacenamiento de archivos y las pruebas de acceso ejecutables. Sirve para dos cosas:
verificar el esquema sin depender de ningún proveedor, y comprobar que las políticas de
acceso hacen lo que dicen. Efecto colateral valioso: **el esquema corre sobre PostgreSQL
puro**, así que el proyecto no está atado a ningún servicio en particular.

**Rama principal protegida.** Todo cambio entra por propuesta con una aprobación.
Verificado: un envío directo a `main` es rechazado por el servidor.

### Evidencia

Prueba de punta a punta en navegador real, resolución de celular, con geolocalización:

```
lista abre: Casos en este celular
GPS capturado: 4.3283783, -75.9029183 · precision 12 m
caso en la lista: L-B833-001 P0 SIN ENVIAR ... El Venado - La Mirandita · Rural
tras recargar la pagina siguen 1 caso(s) en IndexedDB
SIN CONEXION: la app abre y muestra 1 caso(s)
errores de consola: ninguno
```

Bundle inicial: 100 kB de transferencia. El formulario, la pantalla de acceso y el
cliente de Supabase se descargan aparte.

### Lo que NO está probado

**No se ha probado en un celular Android real.** Todo lo anterior es un navegador de
escritorio emulando un celular. Un teléfono de gama baja con poca memoria, pantalla
bajo el sol y un pulgar de verdad es otra cosa. Ese es el frente F6 y es el más
urgente.

### Revisión independiente

Un integrante del equipo revisó la documentación contra el código y encontró ocho
defectos, todos válidos. Están en [hallazgos-revision.md](hallazgos-revision.md) y en
[SEGURIDAD.md](../supabase/SEGURIDAD.md).

| | Hallazgo | Estado |
|---|---|---|
| H14 | El esquema no se podía crear: columna generada sobre una expresión no inmutable | **Corregido** |
| H11 | El navegador podía desalojar los casos sin sincronizar, en silencio | **Corregido** |
| H7 | El teléfono viajaba sin autorización de la familia | Pendiente |
| H9 | La regla de consentimiento no existe en la base, solo en el cliente | Pendiente |
| H10 | La cola no consulta si la sesión sigue vigente | Pendiente |
| H8, H12, H13 | Imprecisiones de documentación y ausencia de pruebas automáticas | Pendiente |

H14 era bloqueante: el esquema completo habría fallado al ejecutarse el día que alguien
creara la base.

---

## 4. Qué falta

| Frente | Estado | Depende de |
|---|---|---|
| F1 Captura offline | Funcionando | — |
| F2 Identidad y acceso | Código listo, falta servidor | — |
| F3 Sincronización y servidor | Abierto | F2 |
| F4 Tablero y mapa | Abierto | — |
| F5 Remisiones y seguimiento | Abierto | F2 |
| F6 Calidad y prueba en campo | **Empieza ya** | — |
| F7 Datos y cumplimiento | Abierto | — |
| F8 Multi-municipio | Abierto | — |

El estándar de confiabilidad que debe cumplir la información está en
[ESTANDAR-PROBATORIO.md](ESTANDAR-PROBATORIO.md), con nueve brechas identificadas y su
prioridad.

Detalle de cada frente en [FRENTES.md](FRENTES.md). Roles, estimación e hitos en
[ROLES-Y-ESFUERZO.md](ROLES-Y-ESFUERZO.md). Las historias de usuario dentro de cada
hito, en [backlog/](backlog/).

### Decisión abierta

[ADR 002](adr/002-infraestructura-en-aws.md) propone mover la infraestructura a AWS y
está en estado **Propuesta**. No se apoya en carga ni en límites alcanzados —el cálculo
del [ADR 001](adr/001-supabase-frente-a-nube-propia.md) sigue vigente— sino en que se
habría cumplido su sexta condición: que exista capacidad real de *operar*
infraestructura.

Esa es una afirmación sobre personas, no sobre código. Antes de aceptarla hay que
responder tres cosas por escrito: quién opera y qué pasa cuando se retire, el costo
mensual con los servicios concretos, y si retrasa el Hito 1.

### Los dos bloqueos reales

**No hay proyecto de Supabase.** Hasta que exista, correr el esquema y asignar rol a
cada voluntario, la base central no se conecta y F3 y F5 no pueden arrancar. Es trabajo
operativo, no de programación.

**Nadie ha probado esto en campo.** El código puede estar perfecto y el formulario
seguir siendo inusable de pie, bajo el sol, con la familia esperando. Eso no lo detecta
ninguna prueba automática.

### Pendientes que no son técnicos y bloquean la entrega

- Nombre exacto de la dependencia responsable de vivienda urbana.
- Entidades y contactos identificados por Miguel.
- Sigla y nombre de la organización internacional bajo la cual se hace la
  representación.
- Listado oficial de veredas de Sevilla, para normalizar nombres. Sin él, la misma
  vereda entra escrita de cuatro formas y las cifras por vereda no se sostienen.
- Formato oficial de censo de damnificados del consejo municipal de gestión del
  riesgo, para que ninguna entidad devuelva el reporte por forma.

---

## 5. Qué necesitamos ahora

**Prioridad 1 — cualquiera con un Android.** Instalar la aplicación, ponerla en modo
avión, registrar un caso de prueba y contar todo lo que incomodó. No requiere escribir
código y es lo de mayor impacto.

**Prioridad 2 — alguien con Supabase.** Crear el proyecto, correr el esquema, dar de
alta voluntarios. Desbloquea la mitad del tablero.

**Prioridad 3 — Angular y visualización.** El tablero y el mapa no tocan el núcleo: se
pueden construir en paralelo desde hoy con datos de prueba.

Con dos horas a la semana se aporta. Escoja un frente y avise cuál toma, para no
repetir trabajo.

---

## 6. Reglas que no se negocian

- En el grupo de chat **no** se publican nombres, cédulas, teléfonos ni fotografías de
  familias afectadas. Son datos sensibles bajo la Ley 1581 de 2012.
- Para desarrollar y probar se usan datos inventados. Nunca datos reales.
- Toda vista pública es agregada y con la coordenada degradada.
- No se prometen ayudas, plazos ni cobertura a nombre del equipo.
- Aquí no se recauda ni se administra dinero.
- Las decisiones técnicas se escriben en el repositorio, no solo en el chat.

---

Repositorio: <https://github.com/anavelezconsultoria/raiz>
