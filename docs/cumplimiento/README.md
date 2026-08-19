# F7 — Datos y cumplimiento

Carpeta de trabajo del frente de protección de datos. Ley 1581 de 2012 y su decreto
reglamentario.

---

## Qué vive aquí

| Archivo | Qué es | Estado |
|---|---|---|
| `autorizacion.md` | Texto que el voluntario lee a la familia | Borrador de Miguel, 18 ago |
| `constancia-de-entrega.md` | Constancia de entrega y recepción institucional | Borrador de Miguel, 18 ago |
| `articulacion-institucional.md` | Instrumento de articulación con el SNGRD | Borrador de Miguel, 18 ago |
| `politica-tratamiento.md` | Política de tratamiento de datos personales | Por subir |
| `retencion-y-supresion.md` | Tiempos de retención y procedimiento de eliminación | Por subir |

La constancia de entrega reemplaza a lo que esta tabla llamaba `oficio-remision.md`. El
cambio no es de nombre: se dejó de pedirle a la entidad que **certifique** los datos y se
le pide que los **reciba** formalmente. Es lo que puede destrabar la entrega.

**Solo el primero es una autorización.** Los otros dos son instrumentos entre la
iniciativa y las entidades. Llamarlos autorización invita a la respuesta que cierra la
puerta: «no tenemos competencia para autorizar una plataforma comunitaria».

Y el encuadre que ordena los tres: **no es absorberse en el Sistema Nacional de Gestión
del Riesgo, es acoplarse a él.** Absorberse sería pedir que Raíz sea adoptada como censo
oficial, que ninguna entidad puede conceder y que además nos quitaría lo que nos hace
útiles. Quedarse por fuera sería producir información que nadie recibe. Acoplarse es
existir como fuente comunitaria con un título claro para ser recibida, evaluada y usada.

## Formato

**Markdown en este repositorio, no Word ni PDF sueltos.** El borrador puede nacer en
Word, pero la versión que manda vive aquí: se puede comparar entre versiones, comentar
línea por línea y saber quién cambió qué y cuándo. De aquí se exporta el PDF cuando
haya que firmar algo.

Si el abogado no usa GitHub, quien tenga el frente pega los comentarios como
sugerencias y deja constancia de quién revisó y en qué fecha, al final del documento.

## Flujo de revisión

1. Quien tiene el frente sube el borrador en una rama y abre una propuesta de cambio.
2. Se comparte el enlace en el grupo para revisión jurídica.
3. Los comentarios se resuelven en la propuesta, no en el chat.
4. Se integra cuando el equipo jurídico dé el visto bueno, con su nombre y la fecha
   registrados en el documento.

---

## Preguntas que el documento DEBE responder

No son teóricas: cada una nace de algo que el sistema ya hace hoy. Un documento que no
las responda no se puede aplicar.

### 1. La supresión choca con la auditoría

La tabla `auditoria` guarda una copia completa de la fila anterior y la nueva
(`to_jsonb(old)`, `to_jsonb(new)`). Eso incluye nombre, apellidos y número de
documento.

Si una familia pide que se eliminen sus datos y solo se borra la fila de `familias`,
**la identidad sigue viva dentro de la auditoría**. La eliminación sería aparente.

Hay dos salidas y hay que escoger una:

- **Excluir las columnas de identidad del registro de auditoría.** Se pierde la
  trazabilidad de quién cambió un nombre, pero la supresión es real y simple.
- **Anonimizar en lugar de borrar.** La fila se conserva con la identidad reemplazada
  y una marca de supresión, y la auditoría se purga junto con ella. Conserva las
  cifras agregadas, que es lo que sustenta las peticiones ante las entidades.

La segunda parece mejor para este proyecto porque una familia que se retira no debería
desaparecer del conteo de afectados del municipio. Pero es decisión de este frente, y
tiene consecuencia en código.

### 2. Las fotos no viven en la fila

Las fotografías se guardan en el almacenamiento de archivos, no dentro del registro.
Borrar la familia **no borra sus fotos**. El procedimiento de supresión tiene que
nombrar explícitamente ese paso y decir quién lo ejecuta.

### 3. Los datos en el celular del voluntario

Cada dispositivo conserva una base local con lo que ese voluntario capturó, incluidos
casos ya sincronizados.

Existe una función para purgar lo ya confirmado por el servidor
(`eliminarSincronizadosAntesDe`) pero **hoy nadie la invoca**. Este frente debe definir
el plazo, y con eso se cablea.

Falta además el procedimiento para cuando un voluntario se retira o pierde el teléfono.

### 4. Registro sin autorización

El sistema permite registrar un caso sin autorización de la familia: guarda ubicación,
número de personas y tipo de daño, sin identidad ni fotos. Es lo correcto.

Falta definir cuánto tiempo se conserva ese registro anónimo, y cómo se convierte en
registro completo si la familia autoriza después.

### 5. Reportes de terceros

Un líder reporta por WhatsApp a una familia que no estuvo presente cuando se leyó la
autorización. Hoy eso se marca como `fuenteDato = whatsapp` y `consentimiento = false`,
que es lo correcto.

Falta el procedimiento de regularización: cómo y en cuánto tiempo se obtiene la
autorización de esa familia, y qué pasa si no se logra.

### 6. Menores de edad

Se registran edades y sexo, nunca nombres de menores por separado. Las fotos son de la
vivienda y el daño, no de personas.

Confirmar que ese tratamiento es suficiente, y si el consentimiento del responsable del
hogar cubre a los menores que lo integran.

### 7. Qué pasa cuando entregamos el listado

Al entregar el listado nominal a una entidad, esa entidad pasa a ser responsable
independiente de esos datos.

El oficio de remisión debe declarar la finalidad y advertir que no autoriza uso
secundario. Ese texto es parte de este frente.

### 8. Después de la emergencia

Cuánto tiempo vive la base cuando la emergencia se cierre, quién la custodia si el
equipo se disuelve, y qué se hace con ella. Un censo sin fecha de caducidad y sin
responsable termina siendo una base de datos huérfana con información sensible de
cientos de familias.

---

## Lo que ya está aplicado en el sistema

Sirve como insumo y para que el documento describa la realidad, no un ideal.

- **La regla de consentimiento se aplica en el borde de salida hacia el servidor**, no
  en la interfaz. Sin autorización de la familia la identidad no viaja, y ninguna ruta
  de la aplicación puede saltarse esa validación.
- Sin autorización tampoco se persiste identidad **en el dispositivo**.
- Toda vista pública es agregada y con la coordenada redondeada a tres decimales, unos
  110 metros: ubica la afectación, no la vivienda.
- Políticas de acceso por fila activas en todas las tablas con datos personales. El
  líder solo ve lo que él mismo reportó; el digitador carga pero no exporta.
- El rol por defecto de un usuario nuevo es el menos privilegiado.
- Toda escritura sobre `familias` y `remisiones` queda auditada.
- El `.gitignore` bloquea `datos/`, `*.nominal.csv` y `exportes/`.

## Lo que NO está resuelto

- Nadie purga las bases locales de los dispositivos.
- No hay procedimiento escrito de atención a una solicitud de supresión.
- La auditoría guarda identidad, como se explicó arriba.
- No hay fecha de caducidad definida para la base.

---

## Poder de veto

Quien tenga la custodia de datos **puede frenar cualquier entrega** que exponga
información de familias. Es el único veto unilateral del proyecto y existe porque el
daño de una filtración no se revierte.
