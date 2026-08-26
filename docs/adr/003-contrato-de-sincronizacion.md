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

### 5. Fotografías por bloques, con permiso firmado

*Reescrito el 15 de agosto de 2026, al construirlo. Lo que había antes describía un
envío único con política de subida por navegador; lo que sigue describe lo que
existe.*

El dispositivo pide autorización, sube **directo al almacenamiento de objetos** y
luego **confirma contra la API**.

**Son tres pasos, no dos.** El tercero no es opcional:

| | Quién | Qué |
|---|---|---|
| 1 | Dispositivo → API | Declara `fotoId`, `casoOrigenId`, `tipo`, `bytes`, `tipoMime` y la **suma SHA-256** de la imagen |
| 2 | Dispositivo → almacenamiento | Sube los bloques que falten, uno por uno, cada uno con su permiso |
| 3 | Dispositivo → API | Confirma; **la API une los bloques, verifica la suma** y responde la ruta definitiva |

#### Toda fotografía se parte, incluso una de 200 KB

La red de una vereda no se cae cuando el archivo es grande: se cae cuando se cae. Un
envío de 200 KB cortado al 80 % no deja nada, y el siguiente intento vuelve a
transmitir —y a cobrarle al voluntario— los mismos 160 KB. Tres intentos así son
800 KB de un plan de datos ajeno, y la fotografía sigue sin llegar.

Partida en bloques, **cada pedazo que llega se queda**. Los bloques van de 64 KiB a
1 MiB, apuntando a unos ocho por imagen: pocos bloques dejan mucho que repetir cuando
uno falla, y muchos gastan peticiones sobre la red que ya está mal.

**Qué bloques llegaron se le pregunta al almacenamiento, no al celular.** Se consulta
objeto por objeto en cada autorización. Por eso un teléfono que se quedó sin batería a
mitad, o al que le reinstalaron la aplicación, retoma exactamente donde iba.

#### Lo que NO se usa: la subida multiparte de S3

Y no es una preferencia. Exige que toda parte salvo la última pese al menos 5 MiB, de
modo que con ella una fotografía de 200 KB **no se puede partir**: sería una sola parte
y no habría nada que reanudar. Aquí cada bloque es su propio objeto, bajo el prefijo
`partes/`, y la API los une al confirmar.

**El precio de esa decisión, dicho en voz alta:** unir hace pasar los bytes por la
API. Ocurre dentro de la nube, una vez por fotografía, sobre unos cientos de kilobytes
y **en flujo** —la memoria que ocupa unir 25 MB es la misma que la de unir 200 KB—.
Lo que sigue sin pasar por la API es la subida desde el celular, que es la parte lenta
y la que costaría de verdad: un teléfono subiendo por una red rural tendría ocupado
varios minutos un contenedor que debería estar recibiendo casos.

#### Por qué el permiso lleva el tamaño dentro de la firma

`content-length` va entre las cabeceras firmadas de cada bloque. Si el cuerpo que llega
no pesa exactamente lo declarado, la firma no cuadra y el almacenamiento rechaza. Sin
esa atadura, un permiso interceptado sería espacio ilimitado a cargo del proyecto.

El tipo de contenido **no** se firma en los bloques: un bloque no es una imagen, son
bytes sueltos, y `Blob.slice` pierde el tipo del original. Firmarlo haría fallar la
subida por una cabecera que el celular no controla. El tipo se fija al unir.

#### Por qué el paso 3 existe, y por qué no basta con contar

Que el almacenamiento haya aceptado los bloques no es que la imagen esté completa. La
única afirmación que vale es la de la API. Sin ese paso el dispositivo podría liberar
la fotografía de su memoria creyendo que ya viajó, y la evidencia del daño de una
familia desaparecería sin que nadie se entere.

Y **contar bloques y sumar tamaños no alcanza**: una imagen corrupta, unos bloques
pegados en el orden equivocado y la imagen buena pesan exactamente lo mismo. Por eso el
dispositivo declara el SHA-256 de la imagen en el paso 1, y la API lo vuelve a calcular
sobre lo que unió —en la misma pasada en que lo escribe, no releyéndolo después—. Si no
coinciden, se borra lo unido y se borran los bloques: el voluntario vuelve a subir la
fotografía. Es duro, y es lo correcto; dejar guardada una imagen que no se abre sería
peor, porque nadie se enteraría hasta el día en que la entidad pida ver la evidencia.

Quien junta los bloques es la API, con los que ella misma verificó, **no con la lista
que reporte el cliente**. Así una versión defectuosa de la aplicación no puede dar por
completa una imagen a la que le falta un pedazo.

Confirmar es **idempotente**: repetirlo no sube nada de nuevo, así que el dispositivo
puede reintentarlo cuando se le cae la señal justo después del último bloque.

#### Una fotografía no viaja sola

Es parte del registro de la familia, no un adjunto. De ahí tres reglas:

- **No se sube una fotografía cuyo caso todavía no llegó al servidor.** No hay a qué
  colgarla, y descubrirlo gastando —pedir permiso, subir bloques, recibir un rechazo—
  quemaba datos del voluntario y los reintentos de esa foto, que después ya no volvía
  a subir aunque su caso llegara.
- **Un caso con fotografías pendientes no está entregado**, aunque su parte de texto sí
  lo esté. Ni se muestra como enviado, ni la limpieza por retención lo borra del
  dispositivo.
- **Sin autorización de la familia no se emite permiso de subida.** La comprobación
  está en el borde, contra la base, no en la interfaz.

#### Consistencia eventual

La escritura de un objeto nuevo es de lectura inmediata, pero el listado no. Por eso
nunca se lista un prefijo: se pregunta por cada objeto concreto, y por eso el estado de
una fotografía lo dicta la API y no lo infiere el dispositivo.

> **Advertencia que cuesta dinero.** Los bloques de una fotografía que nunca se
> completó se quedan ocupando espacio facturable. La API los borra al unir y al
> cancelar; para lo que quede —un celular perdido, una foto descartada sin señal— el
> bucket tiene una regla que barre `partes/` a los siete días. Siete es holgado a
> propósito: alguien puede subir a la vereda el lunes y no volver a tener señal hasta
> el sábado, y su fotografía a medias tiene que seguir ahí para reanudarse.

**Lo que el dispositivo sí calcula, y por qué.** Cuánto pesa lo que está **por subir**
sale del dispositivo, porque esos bytes todavía no existen en ninguna otra parte: es
el número que se le muestra al voluntario antes de gastarle el plan. Lo que el
dispositivo **no** decide es si algo ya llegó; eso lo dice la API.

### 6. Persistencia local, explícita

- Se solicita **cuota persistente** al navegador al arrancar. Sin eso, el sistema
  operativo puede desalojar la base local del voluntario para liberar espacio, y
  la promesa de "guarda aunque no haya señal" es solo una sugerencia.
- Se vigila el espacio disponible y se avisa **antes** de que falle una captura.
- Solo se borra del dispositivo lo confirmado por el servidor, y con el plazo que
  defina el frente F7.

### 7. Automática mientras la aplicación está abierta, con una válvula explícita

La prueba de campo del 15 de agosto cambió esta decisión: pedir un botón para las
fotografías no protegía al voluntario, sino que le dejaba una tarea fácil de olvidar.
Una foto retenida en el celular no es ahorro; es evidencia del daño que todavía no
puede sustentar la atención de la familia.

Al abrir Raíz, recuperar conexión o terminar un caso mientras ya hay red, la cola sale
sola. El tipo de conexión se informa, pero no decide qué viaja:

| Red | Se envía |
|---|---|
| Datos móviles | Casos y fotografías |
| WiFi | Casos y fotografías |
| Tipo desconocido —iOS y Firefox— | Casos y fotografías |
| Ahorro de datos activado | Nada hasta que el voluntario lo pida explícitamente |

La pantalla dice cuánto pesan las fotografías antes de gastarlo, sin pedir permiso en
cada pasada. El ahorro de datos es la válvula de la persona: pesa más que cualquier
heurística sobre si una red parece gratis.

Esto **no es sincronización con la aplicación cerrada**. No se registra Background
Sync ni se delega trabajo al service worker; al cerrar Raíz no sale nada. Dentro de la
cola se conserva el orden de casos antes que fotografías, el envío secuencial y el
límite de intentos. Una pasada automática nunca revive una fotografía detenida; tocar
«Volver a intentar» sí expresa una decisión nueva y la devuelve a la cola.

> La intensidad de señal (barras, dBm) **no existe en la web**. Ningún navegador
> la expone. Leerla exigiría empaquetar la PWA como aplicación nativa, y eso cambiaría
> el modelo de distribución: dejaría de ser "abra este enlace" y pasaría a ser un
> archivo que hay que instalar. La intensidad no se usa para bloquear el envío.

### 8. Sesión

Iniciar sesión exige conexión. Capturar, no. La sesión se guarda en el dispositivo
y sobrevive sin red: un voluntario que entró en el casco urbano y subió a la
vereda sigue registrando aunque su token haya expirado.

Lo único que exige sesión vigente es sincronizar, y esa verificación ocurre
**antes** de empezar la pasada, no descubriéndolo error por error.

**Las tres rutas.** El navegador nunca habla con el proveedor de identidad: le habla
a la API, y la API decide.

| Ruta | Qué hace | Respuesta |
|---|---|---|
| `POST /sesion` | Valida correo y clave contra el proveedor | `{ token, expiraEn, correo, perfil }` |
| `GET /sesion` | ¿El token sirve para enviar? | `200` sirve · `401` no |
| `DELETE /sesion` | Cierra sesión del lado del servidor | `204` |

**El perfil viaja resuelto en la respuesta**, no se pide aparte. El dispositivo necesita
nombre y rol para pintar la interfaz, y pedirlos en una segunda llamada significa que un
corte de señal entre las dos deja a alguien autenticado y sin perfil, mirando una
pantalla que no sabe qué mostrarle.

**El rol NO se lee del token.** Se lee de `perfiles` en cada petición. Si viviera en el
token, ascender o retirar a un voluntario no surtiría efecto hasta que su token
caducara, y en una emergencia ese retraso es justo lo que no se puede tener. Es también
lo que permite desactivar a alguien de inmediato.

**Un usuario con `activo = false` no entra**, aunque sus credenciales sean correctas. Es
la forma de retirar a un voluntario sin borrar los casos que levantó ni romper la
trazabilidad de quién reportó qué.

**Cerrar sesión no puede depender de la red.** El dispositivo avisa al servidor si
puede, pero borra su copia local pase lo que pase: si el voluntario presta el celular,
cerrar sesión tiene que funcionar sin señal.

> `GET /sesion` responde `401` como respuesta legítima, no como fallo. Es la diferencia
> entre «el servidor dice que su sesión ya no sirve» y «no alcancé el servidor». Sin esa
> distinción, un corte de red expulsaría al voluntario en plena vereda. Ver la
> taxonomía de error de la sección 4.

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
