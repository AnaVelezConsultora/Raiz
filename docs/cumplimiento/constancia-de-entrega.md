# Constancia de entrega y recepción institucional

**Versión:** `1.0.0-borrador`
**Redactado por:** Miguel Arias · 18 de agosto de 2026
**Estado:** borrador jurídico, pendiente de revisión

Reemplaza a lo que la carpeta llamaba `oficio-remision.md`.

---

## Por qué este documento destraba la entrega

No se le pide a la entidad que **certifique** que los datos son verdaderos. Se le pide
que **reciba** formalmente una fuente comunitaria de información.

Esa diferencia es la que evita la respuesta que hoy bloquea todo: «no tenemos
competencia para certificar información producida por un particular». Recibir sí pueden,
y evaluar también.

---

## Texto

### CONSTANCIA DE ENTREGA Y RECEPCIÓN DE INFORMACIÓN COMUNITARIA PARA LA GESTIÓN DEL RIESGO

Entre la iniciativa comunitaria **RAÍZ**, en calidad de mecanismo ciudadano de
caracterización y documentación de afectaciones derivadas de situaciones de emergencia y
desastre, y **[ENTIDAD RECEPTORA]**, representada por **[funcionario competente]**, en
calidad de **[cargo]**, se deja constancia de que RAÍZ realiza entrega formal de
información obtenida mediante procesos comunitarios de caracterización territorial.

La información entregada tiene naturaleza de **fuente comunitaria de información
preliminar, documentada y susceptible de verificación**, y tiene como finalidad
contribuir a los procesos institucionales de conocimiento del riesgo, preparación,
respuesta, recuperación y toma de decisiones.

La recepción de esta información **no implica certificación automática de la veracidad
material de cada registro**, ni constituye sustitución de las competencias legales,
técnicas o administrativas de la entidad receptora.

La entidad receptora conservará la facultad y responsabilidad de realizar las
verificaciones, cruces, evaluaciones técnicas y procedimientos administrativos que
correspondan.

A su vez, RAÍZ manifiesta que la información ha sido recopilada mediante una metodología
previamente definida, procurando garantizar: identificación de la fuente; fecha y hora
del reporte; localización; trazabilidad; integridad del registro; documentación
disponible; identificación de modificaciones; y diferenciación entre información
reportada, observada y verificada.

La información será suministrada respetando las normas constitucionales y legales sobre
protección de datos personales, privacidad, reserva y seguridad de la información.

La presente constancia tiene como propósito formalizar la recepción institucional de la
información, facilitar su análisis y permitir que la entidad competente determine su
incorporación, corroboración o utilización dentro de los procedimientos oficiales
correspondientes.

---

## Campos de la constancia

| Campo | De dónde sale |
|---|---|
| Fecha | Del sistema |
| Entidad, dependencia, funcionario receptor, cargo | Se diligencia al entregar |
| Medio de entrega | Se diligencia al entregar |
| Número de registros | **Lo cuenta el sistema** |
| Periodo de caracterización | **Lo calcula el sistema** |
| Territorio | **Lo calcula el sistema** |
| Identificador o mecanismo de integridad | **Lo genera el sistema** |
| Observaciones, firmas | Se diligencia al entregar |

---

## Lo que esto le pide a sistemas

Cinco de esos campos no se escriben a mano: los produce la exportación. Eso convierte la
constancia en algo que se genera con la entrega y no en un formato que alguien llena
después de memoria.

**El identificador de integridad es la pieza técnica.** Es un resumen criptográfico del
archivo entregado. Sirve para que, meses después, se pueda demostrar que el archivo que
tiene la entidad es exactamente el que se entregó, sin una fila más ni una menos. Es la
recomendación G3 del [estándar probatorio](../ESTANDAR-PROBATORIO.md), aplicada a la
entrega en vez de a la fotografía.

Y cada exportación queda registrada: quién, cuándo, con qué filtro, cuántas filas y con
qué resumen. Eso ya estaba previsto en la HU 3.2.1 y ahora tiene su documento.
