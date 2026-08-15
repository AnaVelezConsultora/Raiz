# ADR 003 — Contrato de sincronización

Fecha: 13 de agosto de 2026
Estado: **Propuesta**

## Por qué un contrato y no una implementación

La sincronización es el punto donde el trabajo de un voluntario se pierde o se
salva. Todo lo demás del sistema tiene reintento humano: si un formulario queda a
medias, se vuelve a llenar. Si la cola pierde un caso, **nadie se entera**, y una
familia caracterizada queda fuera del listado que se radica.

Por eso esta parte se fija como contrato, independiente del proveedor. Vale igual
para Supabase, para AWS o para el backend propio de la fase 3.

## La realidad que hay que respetar

De [ESTADO.md](../ESTADO.md) y [FRENTES.md](../FRENTES.md):

- En la zona veredal **no hay señal**. La captura ocurre completa en el
  dispositivo y la transmisión ocurre después, en el pueblo, cuando el voluntario
  decide.
- La señal **aparece y desaparece**. Una ventana de conectividad puede durar
  minutos y cortarse a la mitad de la cola.
- Los datos móviles **los paga el voluntario**. Un envío que consume su plan sin
  que él lo decida es una razón para desinstalar la aplicación.
- El teléfono es **el que ya tiene**: gama baja, memoria escasa, batería incierta.

## El contrato

### 1. Unidad y clave

La unidad atómica de transmisión es el **caso**. Las fotografías son adjuntos
independientes que lo referencian.

La clave de idempotencia es `origen_id`, un UUID generado en el dispositivo en el
momento de crear el caso. El servidor garantiza **efecto exactamente una vez**
ante una entrega **al menos una vez**.

Esto no es teoría: el escenario ocurre. El envío llega al servidor, la respuesta
se pierde por corte de señal, el dispositivo reintenta. Sin clave de idempotencia
el censo gana un duplicado silencioso, y un duplicado silencioso es peor que un
fallo visible — infla los totales que sustentan la petición ante la entidad.

### 2. El código lo asigna el servidor

El dispositivo usa un código local `L-XXXX-NNN` hasta que el servidor confirme y
devuelva el consecutivo institucional `RZ-AAAA-NNNNNN`. Dos voluntarios sin señal
generarían el mismo consecutivo; por eso la autoridad es única y está en el
servidor.

### 3. Orden

1. Casos antes que fotografías. El texto es lo que permite atender a la familia;
   la foto es evidencia. Si la ventana de señal alcanza para una sola cosa, que
   sea el caso.
2. Prioridad P0 primero dentro de los casos.
3. Envío secuencial, nunca en paralelo: una conexión móvil débil se degrada con
   peticiones concurrentes y termina fallando todas.

### 4. Taxonomía de error

Es la parte del contrato que hoy no se cumple y la que más daño hace. Tres clases,
con tres respuestas distintas:

| Clase | Qué es | Qué hace la cola |
|---|---|---|
| **Transporte** | red caída, 5xx, tiempo agotado | Detiene la pasada, conserva el pendiente, espera con backoff |
| **Sesión** | 401, 403, política de acceso | Detiene la pasada, pide reconectar, **no consume intentos** |
| **Rechazo** | 422, validación de datos | Marca para revisión humana, no reintenta, **no bloquea la cola** |

Confundir *sesión* con *rechazo* es el defecto descrito en
[hallazgos-revision.md](../hallazgos-revision.md) §3: con la sesión vencida, la
cola recorre todo el pendiente marcando error, agota el contador de intentos y
deja los casos fuera del envío **sin decírselo a nadie**. El botón muestra
pendientes y no manda nada. En campo eso se lee como "la aplicación perdió mi
trabajo".

### 5. Fotografías por URL prefirmada

El dispositivo pide una URL, sube **directo al almacenamiento de objetos** y luego
confirma. Las fotografías no atraviesan la API.

Con 15.000 fotos previstas a 200 KB, hacerlas pasar por el servidor es pagar
cómputo y transferencia por mover bytes que no se procesan.

### 6. Persistencia local, explícita

- Se solicita **cuota persistente** al navegador al arrancar. Sin eso, el sistema
  operativo puede desalojar la base local del voluntario para liberar espacio, y
  la promesa de "guarda aunque no haya señal" es solo una sugerencia.
- Se vigila el espacio disponible y se avisa **antes** de que falle una captura.
- Solo se borra del dispositivo lo confirmado por el servidor, y con el plazo que
  defina el frente F7.

### 7. Consciente de la red, nunca automática

La sincronización **la dispara siempre una persona**. Nada de sincronización en
segundo plano, aunque el navegador la ofrezca: consumiría los datos del voluntario
sin que él lo decida.

Lo que sí se hace es modular **qué** se envía según la red disponible:

| Red | Se envía |
|---|---|
| Datos móviles | Solo casos |
| WiFi | Casos y fotografías |
| Ahorro de datos activado | Nada hasta que el voluntario lo pida explícitamente |

Es la regla "casos antes que fotos" llevada del orden al contenido. Y el botón
dice qué va a mandar y cuánto pesa, antes de mandarlo.

> La intensidad de señal (barras, dBm) **no existe en la web**. Ningún navegador
> la expone. Se usa la calidad estimada de conexión, que alcanza para decidir si
> se mandan fotografías. Leer la señal real exigiría empaquetar la PWA como
> aplicación nativa, y eso cambiaría el modelo de distribución: dejaría de ser
> "abra este enlace" y pasaría a ser un archivo que hay que instalar.

### 8. Sesión

Iniciar sesión exige conexión. Capturar, no. La sesión se guarda en el dispositivo
y sobrevive sin red: un voluntario que entró en el casco urbano y subió a la
vereda sigue registrando aunque su token haya expirado.

Lo único que exige sesión vigente es sincronizar, y esa verificación ocurre
**antes** de empezar la pasada, no descubriéndolo error por error.

## Qué queda fuera, a propósito

**No hay descarga.** El contrato es de un solo sentido: el dispositivo empuja.

Esto tiene una consecuencia que conviene tener presente y decidir a conciencia: si
la mesa verifica un caso o le asigna radicado, **el líder que lo reportó no se
entera**. Para el objetivo de "acompañar cada caso hasta que alguien responda por
él", eso es una limitación real.

Cerrarlo no exige cambiar de motor ni de proveedor: es agregar un método de
descarga al puerto y aprovechar `actualizado_en`, que ya existe en la tabla. Se
deja fuera de este ADR porque hoy no hay servidor con datos, no porque no haga
falta.

## Cuándo se revisa

1. La mesa necesita devolver información al líder (radicado, estado, respuesta de
   la entidad).
2. Un mismo caso empieza a editarse desde dos dispositivos.
3. El volumen por voluntario crece al punto de que una pasada de cola no cabe en
   una ventana de señal.

## Lo que este contrato NO dice

No dice cómo se implementa la cola, ni con qué biblioteca, ni contra qué API. Dice
qué garantías tiene que ofrecer para que el trabajo de un líder que caminó dos
horas hasta una vereda no se pierda entre el celular y la base.

## Por que la idempotencia esta en los dos lados

Hay dos barreras contra el duplicado y no son redundantes: atacan casos distintos.

**En el dispositivo.** El `origenId` es el UUID que se genero al crear el caso y no se
regenera nunca; el reintento viaja con el mismo. Y la cola solo devuelve casos en estado
`Pendiente` o `Error`, asi que un caso ya confirmado no vuelve a enviarse.

**En la API.** Upsert por `origen_id`, que tiene indice unico, devolviendo `xmax = 0`
para distinguir alta de actualizacion, y respondiendo `yaExistia` al dispositivo.

### La primera falla justo en el caso que importa

Si el envio **llega al servidor pero la respuesta se pierde** —el corte de senal a mitad,
que en zona veredal es lo corriente— el dispositivo no recibe confirmacion, marca el caso
como `Error` y **vuelve a enviarlo**. La barrera del dispositivo esta disenada para no
reenviar lo confirmado, y este caso nunca se confirmo.

Ahi entra el upsert. Sin el, ese reintento crea una segunda fila para la misma familia,
el total se infla, y el total consolidado es la palanca ante la entidad.

Dicho corto: **la del dispositivo evita trafico innecesario en el caso normal; la de la
API evita el duplicado en el caso anormal, que es el unico donde puede ocurrir.**

Queda escrito porque es de las cosas que alguien quita en seis meses por parecer
duplicada. La prueba `entorno/pruebas/idempotencia.sql` falla si se quita.
