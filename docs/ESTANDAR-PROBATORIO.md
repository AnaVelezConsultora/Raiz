# Raíz — Estándar de confiabilidad de la información

Traducción a requisitos técnicos del estándar de valoración de fuentes no estatales
desarrollado por la jurisprudencia interamericana y europea de derechos humanos.

**Origen del marco:** análisis jurídico aportado por Miguel Arias. Este documento no lo
repite: lo convierte en especificación verificable y contrasta cada elemento contra lo
que el sistema hace hoy.

---

## Precisión conceptual que ordena todo lo demás

Raíz **no produce un censo oficial** ni sustituye la competencia de la autoridad.

Produce **fuentes comunitarias de información, documentación y evidencia primaria,
levantadas mediante una metodología verificable, destinadas a alimentar y complementar
la información oficial.**

Esa formulación no es diplomacia: es la posición jurídicamente más fuerte. Presentarse
como censo oficial invita a que se cuestione la competencia; presentarse como fuente
documentada con metodología trazable traslada la discusión a un terreno donde el
estándar internacional ya reconoce valor.

### Lo que no se debe afirmar

El estándar dice que estas fuentes **pueden ser consideradas y ponderadas**, no que
constituyan prueba por sí mismas. Su peso depende del origen, la independencia, la
confiabilidad, la objetividad y el rigor de la recolección y verificación.

En consecuencia, ni la presentación ni la herramienta deben decir "prueba". Deben decir
**documentación con trazabilidad verificable**. Sobreafirmar es la forma más rápida de
perder el valor que se está construyendo.

---

## Los ocho elementos, contra el sistema real

| | Elemento | Estado |
|---|---|---|
| 1 | Identificación | Parcial |
| 2 | Temporalidad | Parcial |
| 3 | Localización | **Cumple** |
| 4 | Trazabilidad | Parcial |
| 5 | Corroboración | Parcial |
| 6 | Metodología | Parcial |
| 7 | Integridad | **Cumple** |
| 8 | Transparencia | Parcial |

---

### 1 · Identificación — quién suministró la información

**Hoy:** se registra nombre, organización y teléfono de quien captura, su perfil
autenticado, y el canal por el que llegó el dato.

**Falta:** distinguir **quién observó** de **quién digitó**. Cuando un líder reporta por
WhatsApp y la mesa transcribe, el sistema atribuye el registro a la mesa, que no estuvo
en el sitio. Eso debilita justamente el elemento que el estándar valora más.

> **G1.** Separar `informante` de `registrador`. El informante es quien observó; el
> registrador es quien operó el instrumento. Pueden ser la misma persona, y con
> frecuencia no lo son.

### 2 · Temporalidad — fecha y hora automáticas

**Hoy:** hora de inicio y fin del formulario, fecha de registro, y marcas de creación y
actualización.

**Faltan dos cosas, y la segunda es la seria:**

> **G2a.** Registrar la **fecha del hecho** —cuándo ocurrió o se observó el daño—
> separada de la fecha de captura. Hoy se confunden, y pueden estar separadas por días.

> **G2b.** **Sello de tiempo del servidor.** Toda la temporalidad actual proviene del
> reloj del dispositivo, que el usuario puede alterar. Debe conservarse `recibido_en`
> del lado del servidor y, cuando difiera del reloj del dispositivo, dejarlo visible.
> No para desconfiar del voluntario: para que la discrepancia sea auditable en vez de
> invisible.

### 3 · Localización — georreferenciar cuando sea posible

**Cumple, y con un matiz que el estándar agradece:** no solo se guarda la coordenada,
sino su **precisión en metros** y su **origen** —medida en el sitio, compartida por la
familia, aproximada por referencia, o no disponible.

Distinguir el dato medido del dato aproximado es exactamente lo que permite ponderar
una fuente en lugar de aceptarla o descartarla en bloque.

### 4 · Trazabilidad — conservar fotografías, videos, documentos y fuente original

**Hoy:** fotografías tipificadas —fachada, daño, cultivo— asociadas al caso.

**Faltan tres:**

> **G3.** **Huella digital de cada archivo.** Sin un resumen criptográfico calculado en
> el dispositivo al momento de la captura, no se puede demostrar que la imagen que hoy
> está en el sistema es la misma que se tomó. Es barato y es lo que separa "una foto"
> de "una foto trazable".

> **G4.** **Conservar la fuente original.** Cuando el reporte llega por WhatsApp, por
> llamada o en papel, hoy se transcribe y el original se pierde. Debe poder adjuntarse:
> captura del mensaje, nota de la llamada, foto del formulario diligenciado a mano.

> **G5.** Permitir **video y audio breves**. Un testimonio de treinta segundos frente a
> la vivienda documenta lo que ninguna casilla captura.

### 5 · Corroboración — validar después con otras fuentes

**Hoy:** estados de verificación —reportado, contactado, verificado en terreno, no
ubicado, duplicado— con responsable y fecha. Y las remisiones registran la respuesta de
la entidad, que es corroboración por autoridad.

**Falta:**

> **G6.** Registrar **corroboraciones múltiples e independientes**. Si dos líderes de
> veredas distintas reportan el mismo hecho sin conocerse, eso es convergencia de
> fuentes y es precisamente lo que el estándar pondera. Hoy el segundo reporte se marca
> como duplicado y se descarta, cuando debería sumar confiabilidad.

### 6 · Metodología — protocolo previamente definido

**Hoy:** existe protocolo operativo, formulario con definiciones y plantilla fija de
reporte, todo público y versionado en el repositorio. El requisito de protocolo previo
se cumple.

**Falta:**

> **G7.** Grabar en cada registro **la versión del instrumento** con que fue levantado.
> Cuando el formulario cambie —y va a cambiar— no habrá forma de saber qué se preguntó
> exactamente en un registro de hace tres semanas. Es un campo y evita una discusión
> irresoluble.

### 7 · Integridad — no modificable sin dejar trazabilidad

**Cumple.** Toda escritura sobre familias y remisiones deja copia del estado anterior y
del nuevo, con actor y momento, mediante un disparador que no depende de que la
aplicación se acuerde de registrarlo. La lectura de esa auditoría está restringida y la
escritura manual, revocada.

**Refuerzo opcional, de bajo costo:**

> **G8.** Encadenar cada entrada de auditoría con el resumen criptográfico de la
> anterior. Con eso, alterar un registro histórico rompe la cadena de forma detectable,
> incluso para quien tenga acceso administrativo a la base. Convierte "no se puede
> modificar sin dejar rastro" en algo demostrable y no en una afirmación de confianza.

### 8 · Transparencia — distinguir reportado, observado y verificado

**Hoy:** se infiere combinando el canal de origen con el estado de verificación. Se
infiere, no se declara.

> **G9.** Un campo explícito de **naturaleza de la observación**: observado
> directamente por quien registra, reportado por la familia, reportado por un tercero,
> o tomado de un listado de otra entidad.
>
> Y que la interfaz **muestre siempre** de qué tipo es cada dato. Un tablero que
> presenta juntos lo observado y lo referido, sin distinguirlos, pierde en un minuto
> toda la confiabilidad que costó meses construir.

---

## Consecuencias de diseño

**Ningún cambio de los anteriores rompe lo que ya funciona.** Todos son campos nuevos,
tablas nuevas o adjuntos nuevos. La captura sin conexión, la cola de sincronización y
las políticas de acceso no se tocan.

**Prioridad sugerida.** G3 y G9 primero: son baratos y son los que más elevan la
confiabilidad. Luego G1, G2b y G7. Después G4, G6 y G5. G8 al final, cuando exista
servidor.

**Costo estimado:** 8 puntos en total, repartidos entre el frente de datos y
cumplimiento (F7) y el de sincronización (F3).

---

## Lo que esto le cambia al proyecto

Sin este estándar, Raíz produce una lista de familias afectadas.

Con él, produce **fuentes documentadas y trazables** que pueden alimentar la información
oficial, sostener una gestión ante cooperación internacional y, llegado el caso, ser
ponderadas por un organismo que valore evidencia.

La diferencia no está en la cantidad de familias registradas. Está en poder responder,
sobre cualquier registro individual: **quién lo reportó, cuándo, dónde, qué observó
exactamente, con qué instrumento, con qué evidencia adjunta, si fue verificado, por
quién, y si alguna autoridad lo corroboró después.**

Un sistema que responde esas nueve preguntas sobre cada caso es de otra naturaleza que
uno que solo suma. Y es una diferencia de diseño, no de esfuerzo.
