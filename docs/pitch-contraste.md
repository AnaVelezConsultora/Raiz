# Raíz — Contraste entre el pitch y lo que sostiene el código

Corte: 14 de agosto de 2026.
Documento revisado: presentación «Raíz en Producción», 16 láminas, para autoridades
civiles y líderes comunitarios.

Este documento no opina sobre la presentación: verifica cada afirmación verificable
contra `supabase/schema.sql`, `supabase/SEGURIDAD.md` y el código del frontend, y dice
cuáles se sostienen y cuáles no. Se escribe porque una afirmación falsa ante una
autoridad no cuesta una corrección: cuesta la credibilidad de todo lo demás, incluida
la parte que sí es cierta.

La lámina 15 es la que protege al mazo completo. Al decir «ningún líder ha registrado
todavía a una familia real» y «lo que se presenta es el método y el instrumento, no un
resultado», la presentación se pone en un terreno donde casi nada puede desmentirla.
Las dos correcciones de abajo son justamente las dos frases que se salen de ese
terreno.

---

## 1 · Corrección necesaria antes de presentar · el mapa público no es agregado

**Dónde:** lámina 11 («Tablero público con datos agregados y coordenada degradada a
cien metros: ubica la afectación, nunca la vivienda de una familia») y lámina 14
(«Toda vista pública es agregada y con la coordenada degradada»).

**Qué dice el código.** Hay tres vistas concedidas al rol anónimo y no se comportan
igual:

| Vista | ¿Agregada? | Qué entrega |
|---|---|---|
| `v_estadisticas` | Sí | Un solo renglón de totales. Es lo que muestran los contadores de la lámina 11 |
| `v_estado_gestion` | Sí | Un renglón por entidad, con casos remitidos y mora |
| `v_mapa_publico` | **No** | **Una fila por familia** |

`v_mapa_publico` entrega, por cada hogar: código, vereda o barrio, prioridad, total de
personas, número de menores, número de adultos mayores, nivel de afectación, si es
habitable, y la coordenada redondeada a tres decimales.

Tres decimales de grado, a la latitud de Sevilla, son una retícula de unos **111 m**.
La cifra de la lámina es correcta. El problema no es la precisión: es que redondear
una coordenada no es agregar un dato. Después de redondear sigue habiendo una fila por
familia.

**Por qué importa aquí y no en una ciudad.** En una vereda de vivienda dispersa, el
conjunto «vereda + punto a 111 m + cuántos viven + cuántos menores + si la casa quedó
inhabitable» suele describir una sola vivienda, y describe a quién hay dentro. La
población es vulnerable y varios de los campos son datos sensibles bajo la Ley 1581
de 2012.

**De dónde viene el error.** No lo introdujo la presentación. `SEGURIDAD.md` clasifica
`v_mapa_publico` entre «las vistas agregadas» y la llama «ventana controlada y
anonimizada». La documentación heredó esa clasificación y el pitch la heredó de la
documentación. Es un solo error propagándose por tres documentos, que es exactamente
lo que registra **HU 2.1.1**, hoy bloqueada.

**Qué hacer.** Dos caminos, y el primero se puede hacer hoy mismo:

1. **Corregir la frase.** Decir lo que el mapa hace de verdad: *«El mapa ubica cada
   afectación con la coordenada degradada a unos cien metros, sin nombre, sin
   documento y sin teléfono.»* Es defendible, es cierto, y no promete un anonimato que
   el dato no tiene.
2. **Agregar el mapa de verdad**, si se quiere sostener la frase actual: agrupar por
   vereda con un umbral mínimo de hogares por punto, de modo que un punto con menos de
   N familias no se publique. Eso es trabajo, y es la decisión que HU 2.1.1 tiene
   pendiente.

Lo mínimo antes de presentar es el punto 1. Si se presenta la frase actual y alguien
consulta la vista, la contradicción aparece sola.

---

## 2 · Corrección menor · la auditoría no registra consultas

**Dónde:** lámina 12, «registro permanente de quién consultó o modificó cada dato».

**Qué dice el código.** Los disparadores de auditoría son `after insert or update or
delete`, y existen sobre dos tablas: `familias` y `remisiones`. PostgreSQL no dispara
sobre `select`, de modo que **las lecturas no quedan registradas**. Quién modificó, sí.
Quién consultó, no.

**Qué hacer.** Cambiar una palabra: *«registro permanente de quién creó o modificó cada
dato»*. Registrar lecturas es posible pero es trabajo real y no está construido; no
conviene prometerlo en una lámina.

---

## 3 · Afirmación que es cierta como diseño, no como propiedad verificada

**Dónde:** lámina 14, «sin autorización la identidad no viaja, y ninguna ruta de la
aplicación puede saltarse esa validación».

Hoy la regla existe una sola vez, como función pura compartida
(`dominio/src/consentimiento.ts`), que es lo que hace que la frase pueda ser verdad.
Pero **el frontend todavía no la llama** —eso es HU 1.5.2— y el servidor que sería el
otro llamador no existe. Mientras tanto la frase describe el diseño, no una propiedad
comprobada.

Además queda el punto de **HU 1.5.1**, bloqueado: el teléfono del hogar es obligatorio
y viaja aunque no haya autorización. Un número de celular es dato de contacto directo.
La lámina dice «sin autorización la identidad no viaja»; hoy viaja el teléfono.

No hace falta cambiar la lámina si se presenta junto a la 15, que ya aclara que esto es
método e instrumento. Pero conviene que quien presente sepa la diferencia, por si
alguien pregunta.

---

## 4 · Lo que se sostiene y se puede defender sin reservas

- **«Seis fallos de control de acceso corregidos antes de crear el proyecto, incluidas
  dos vistas que exponían identidad saltándose las políticas.»** Exacto. `SEGURIDAD.md`
  documenta H1 a H6, dos de ellos graves; las dos vistas son `v_familias_tablero` y
  `v_posibles_duplicados`, corregidas con `security_invoker`.
- **«Quien controla el acceso es la base de datos, no la pantalla.»** Cierto: RLS
  activo con políticas por fila, y hay una suite ejecutable que lo comprueba en cada
  cambio (`entorno/pruebas/seguridad.sql`).
- **Registro único de hogares, no de viviendas; rural y urbano como filtros sobre el
  mismo dato.** El esquema es así.
- **Guardado incremental.** El modelo conserva el paso del formulario donde quedó el
  registro.
- **Los contadores de la lámina 11.** Salen de `v_estadisticas`, que sí es agregada.
- **«Nunca duplica.»** El diseño de idempotencia por identificador de origen es
  correcto. Todavía no está construido, y la lámina 15 ya lo dice.

---

## 5 · La ruta del pitch frente a los hitos del tablero

| Pitch (lámina 15) | Hitos del tablero |
|---|---|
| 1 · Construido | Hito 0 · Base construida |
| **2 · Aquí estamos** — celulares reales, líderes reales | **HU 1.4.1 y HU 1.4.2**, apartado 1.4 |
| 3 · Sigue — servidor y sincronización real | Hito 1, apartados 1.1 a 1.3 |
| 4 · Después — tablero, mapa, remisión con radicado | Hitos 2 y 3 |
| 5 · Escala | Hito 4 |

**Hay un desajuste en el paso 2.** El pitch dice que el equipo está hoy en la prueba
con celulares reales. El tablero numera esa prueba como HU 1.4.1, después de la
infraestructura y de la API, y quien lea el tablero concluirá que la prueba en campo
viene después de AWS.

No es así, y el propio backlog lo confirma: **HU 1.4.1 no depende de nada**. La
aplicación captura sin conexión, de modo que probarla en un teléfono de gama baja no
necesita servidor, ni nube, ni sincronización. Se puede empezar hoy, en paralelo con
todo lo demás.

Los dos documentos deben contar lo mismo, porque el pitch es el que ve la autoridad.
La corrección va en el tablero, no en el pitch.

---

## 6 · Lo que la reunión puede destrabar

Dos historias del tablero están bloqueadas esperando gestión, no programación, y esta
reunión es la ocasión de resolverlas. Conviene salir de allí con:

- **El listado veredal oficial del municipio** (HU 4.1.1). Hoy la vereda se escribe a
  mano «como lo dice la comunidad», y sin listado oficial dos líderes escriben el mismo
  lugar de dos maneras y los totales dejan de cuadrar — que es justamente la palanca que
  la lámina 5 dice que no se puede perder.
- **A qué dependencia se radica cada tipo de caso** (HU 3.2.2), con nombre exacto.

Si la presentación termina sin pedirlas, ambas siguen esperando otra reunión.
