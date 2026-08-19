# Autorización de la persona afectada

**Versión:** `1.0.0-borrador`
**Redactado por:** Miguel Arias · 18 de agosto de 2026
**Estado:** borrador jurídico, pendiente de revisión y de la decisión de granularidad (ver abajo)

Este es el texto que la aplicación muestra y que el voluntario lee a la familia
**antes** de empezar la caracterización.

---

## Por qué este archivo lleva versión

La Ley 1581 exige que la autorización pueda consultarse después y que el responsable
conserve prueba de haber informado. Eso significa que no basta con guardar «autorizó:
sí»: hay que poder responder **qué texto exacto** se le leyó a esa familia ese día.

Por eso el texto vive aquí con número de versión, y cada caso guarda la versión que
estaba vigente cuando se registró. Si mañana cambia una palabra, sube la versión y los
casos viejos siguen apuntando a la que les corresponde.

---

## Texto

### AUTORIZACIÓN PARA LA CARACTERIZACIÓN, TRATAMIENTO Y SUMINISTRO DE INFORMACIÓN EN SITUACIONES DE EMERGENCIA Y DESASTRE

Declaro que la información que suministro mediante esta herramienta corresponde, según
mi conocimiento y percepción directa, a mi situación personal, familiar, habitacional,
territorial o comunitaria derivada de la emergencia o desastre reportado.

Autorizo de manera previa, expresa e informada el tratamiento de los datos personales
que suministro, incluidos aquellos que puedan tener carácter sensible cuando resulte
estrictamente necesario para identificar necesidades de protección, atención
humanitaria, salud, alojamiento, seguridad, asistencia o recuperación.

La información será tratada exclusivamente para fines relacionados con: caracterización
preliminar de personas y comunidades afectadas; identificación de daños y necesidades;
orientación y priorización de la respuesta humanitaria; apoyo a los procesos de
conocimiento, reducción y manejo de desastres; suministro de información a las
autoridades y organismos competentes; verificación y actualización de la información
reportada; generación de información estadística y territorial agregada para la gestión
del riesgo.

Comprendo y acepto que esta caracterización comunitaria **no sustituye** los censos,
evaluaciones técnicas, registros administrativos, EDAN, certificaciones oficiales ni
demás procedimientos que correspondan legalmente a las autoridades competentes.

Autorizo que la información pueda ser suministrada, de manera segura y conforme a las
competencias legales de cada entidad, a las autoridades integrantes del Sistema Nacional
de Gestión del Riesgo de Desastres, organismos de socorro y demás entidades públicas
competentes que requieran conocerla para atender la emergencia.

La información será sometida a criterios de seguridad, confidencialidad, finalidad,
circulación restringida, veracidad y calidad, procurando que solamente se suministre
aquella información necesaria para la finalidad correspondiente.

Se me informa que puedo ejercer los derechos que me reconoce la legislación colombiana
en materia de protección de datos personales.

Cuando la información corresponda a datos de niñas, niños o adolescentes, datos de salud
u otros datos sensibles, se aplicarán las garantías especiales establecidas por la
Constitución y la Ley 1581 de 2012.

Declaro que la información suministrada es, según mi leal saber y entender, cierta y
corresponde a la situación que estoy reportando.

Acepto la caracterización y el tratamiento de la información para los fines
anteriormente descritos.

---

## Lo que la aplicación tiene que guardar, y no guarda hoy

No basta con un botón de aceptar. Por cada caso hay que poder reconstruir la
autorización:

| Dato | Hoy | Falta |
|---|---|---|
| Si autorizó | `familias.consentimiento` | — |
| Cuándo | Se infiere de `fecha_registro` | Marca de tiempo propia de la autorización |
| Qué texto se leyó | — | Versión de este archivo |
| Quién la tomó | `registrador_perfil_id` | — |
| Por qué medio | `fuente_dato` | Distinguir leída en persona de reportada por un tercero |

---

## La decisión pendiente: una autorización o varias

El texto de arriba es **uno solo y cubre todo**: datos personales, datos sensibles y
suministro a autoridades. Es correcto como pieza informativa y hay que leerlo completo.

La discusión es sobre **la aceptación**, no sobre el texto. Recomendación del frente de
sistemas, para que el frente jurídico decida:

La Ley 1581 trata los datos sensibles aparte y establece que nadie está obligado a
autorizarlos. Si la única forma de ser caracterizado es aceptar en bloque —incluidos
salud, discapacidad y gestación—, esa autorización es discutible por no ser libre. Y en
la práctica hay familias que quieren quedar contadas pero no quieren que su información
de salud salga hacia una entidad.

Por eso se propone **un texto y tres aceptaciones**:

1. **Caracterización y tratamiento de datos personales.** Sin esto no hay registro con
   identidad; el caso se guarda anónimo.
2. **Datos sensibles** —salud, discapacidad, gestación, condición de menores—. Separable.
   Si no se autoriza, esos campos no se capturan ni viajan.
3. **Suministro a autoridades competentes.** Separable. Sin esto el caso cuenta en el
   agregado pero no se remite nominalmente.

Las tres se guardan con su versión y su fecha. La decisión es del frente jurídico; lo
que sistemas afirma es que las tres son implementables y que hoy no existe ninguna.

---

## Estado actual del sistema, sin adornos

Hoy hay **una sola** casilla de consentimiento, y lo único que protege son cuatro
campos: nombres, apellidos, tipo y número de documento. Todo lo demás —incluidos
gestantes, discapacidad, enfermedad crónica, fallecidos y heridos— se guarda y viaja
igual, haya o no autorización.

Eso es lo que este documento tiene que corregir, y es la primera tarea de la ola 0.
