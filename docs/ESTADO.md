# Raíz — Estado del proyecto

Corte: 15 de agosto de 2026. Sevilla, Valle del Cauca.

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
| **El caso viaja solo; la fotografía espera el botón** | Reemplaza a «la sincronización nunca es automática», que trataba igual un caso de 3 KB y una fotografía de 200 KB. El costo de olvidar el botón no lo pagaba el voluntario sino la familia: el caso se quedaba en el celular y nadie sabía que existía. El caso se envía al reconectar y al abrir la aplicación; la fotografía sí espera una decisión explícita, y en wifi se ofrece mandarla. Con el ahorro de datos activo no se manda nada sin pedirlo, y nunca hay envío en segundo plano con la aplicación cerrada. |
| **KoboToolbox corre en paralelo y no se detiene** | La emergencia no espera a que terminemos. Las columnas de PostgreSQL replican los nombres del formulario de Kobo, así que migrar es una carga, no una reescritura. |
| **La infraestructura va sobre AWS, no sobre Supabase** | [ADR 002](adr/002-infraestructura-en-aws.md). El acoplamiento a Supabase estaba contenido en cuatro puntos, de modo que las tablas, vistas y políticas se portan con un adaptador de unas cuarenta líneas. |
| **El contrato de sincronización no depende del proveedor** | [ADR 003](adr/003-contrato-de-sincronizacion.md). Incluye la taxonomía de error —transporte, sesión, rechazo— que el cliente necesita para saber si reintentar, detenerse o marcar para revisión. |
| **La infraestructura no depende de quien programa** | [ADR 004](adr/004-modelo-de-entrega.md). Quien contribuye levanta todo en su máquina con un comando, envía su propuesta de cambio y el despliegue ocurre aparte. |

---

## 3. Dónde estamos

### Construido y probado en laboratorio

Probado significa aqui: navegador de escritorio emulando un celular con ubicacion
simulada, y la API corriendo contra PostgreSQL y Cognito reales — desde el 15 de agosto,
tambien contra la infraestructura desplegada en AWS y no solo contra el entorno local.
**Lo que sigue sin ejecutarse es en un telefono real, en la vereda, con senal
intermitente.** Eso es lo mas urgente que hay y no depende de nadie mas.

**Captura sin conexión.** Formulario de cuatro pasos con guardado incremental: si se
cierra la aplicación en el paso 3, al volver el registro sigue ahí. Fotos comprimidas
en el dispositivo a unos 200 KB, y coordenada GPS por satélite, que no requiere
internet.

**Cola de sincronización.** Envía casos antes que fotos, prioridad de riesgo de vida
primero, secuencial y no en paralelo, con idempotencia por `origen_id`: si el envío
llega al servidor pero la respuesta se pierde por corte de señal, el reintento
actualiza la misma fila en lugar de crear un duplicado. Los dos lados están escritos y
el reintento está verificado contra la API y la base reales.

**Servicio de sincronización.** Recibe el caso, fija la identidad del usuario dentro de
la transacción para que las políticas de acceso sigan corriendo, asigna el consecutivo
institucional y traduce cualquier fallo a las tres clases del contrato: transporte,
sesión y rechazo. Desde el 15 de agosto corre desplegado en AWS, no solo en el entorno
local.

**Identidad y roles (F2).** Cinco roles, guardas de ruta, pantalla de acceso, permisos
derivados del rol y disparador que crea el perfil al dar de alta un usuario, con el rol
menos privilegiado por defecto. Las tres rutas de sesión —entrar, comprobar y salir—
responden contra Cognito, y el rol se lee del perfil en cada petición, nunca del token,
para que la custodia pueda cambiarlo sin esperar a que caduque nada. Desde el 15 de
agosto el pool de Cognito existe en AWS real, y el alta de voluntarios también pasa por
la API; ver más abajo.

**Modelo de datos.** 13 tablas, 7 vistas, 20 políticas de acceso por fila y auditoría de
cambios. Sin autorización de la familia, la identidad no entra: además del cliente y del
servidor, la base la rechaza con una restricción propia. La vista del mapa entrega la coordenada redondeada a tres decimales (~111 m).
Ver la salvedad importante en «Lo que la documentación decía de más».

**Entorno local completo.** `cd entorno && make arriba` levanta PostgreSQL con PostGIS,
LocalStack emulando el almacenamiento de objetos, Cognito local, el esquema cargado sin
modificar, catálogos, casos de ejemplo y cinco usuarios de prueba. **Se contribuye sin
credenciales de AWS y sin tocar nada compartido**, que era el bloqueo anterior.

**Pruebas de control de acceso.** `make pruebas` comprueba sobre la base que ninguna
tabla quede sin políticas, que las vistas no las salten, que un líder no vea los casos
de otro y que nadie pueda escribir en la auditoría, y falla si alguien lo rompe. Antes
eran una lista para revisar a mano.

**Prueba de punta a punta.** `make e2e` recorre el camino completo en diez pasos con
veintiún asertos —entrar, sincronizar, reintentar tras un corte, subir la fotografía,
verificar, remitir, medir la mora, registrar la respuesta y comprobar la auditoría—,
es repetible y se limpia sola.

**Paquete de dominio compartido.** El contrato que cruza la red y la regla de
consentimiento viven en `dominio/` y los usan los dos lados. Cuando alguien agregue un
campo de un solo lado, deja de compilar en vez de perder el dato en silencio.

**Vía paralela operativa.** Formulario XLSForm de 125 filas —unas 97 preguntas
reales; el resto son grupos, notas y campos calculados— listo para
KoboToolbox, plantilla fija de reporte por WhatsApp y tablero estático con mapa. Eso
permite capturar hoy mientras la aplicación propia madura.

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
GPS capturado: 4.2712345, -75.9412345 · precision 12 m
caso en la lista: L-B833-001 P0 SIN ENVIAR ... Vereda Ficticia Uno · Rural
tras recargar la pagina siguen 1 caso(s) en IndexedDB
SIN CONEXION: la app abre y muestra 1 caso(s)
errores de consola: ninguno
```

Bundle inicial: 100 kB de transferencia. El formulario, la pantalla de acceso y el
cliente de datos se descargan aparte.

### Lo que NO está probado

**No se ha probado en un celular Android real.** Todo lo anterior es un navegador de
escritorio emulando un celular. Un teléfono de gama baja con poca memoria, pantalla
bajo el sol y un pulgar de verdad es otra cosa. Ese es el frente F6 y **es lo más
urgente que hay**: no depende del servidor ni de la nube, y se puede empezar hoy.

**El dato nunca ha viajado desde un celular real por una red real.** Dentro del entorno
local sí recorre el camino completo —cliente, API, base, con reintento y sin duplicar—,
pero eso ocurre en una sola máquina. Falta el servidor desplegado y falta la señal
intermitente de la vereda, que es donde este sistema tiene que aguantar.

### Revisión independiente

Un integrante del equipo revisó la documentación contra el código y encontró ocho
defectos, todos válidos. El despliegue del 15 de agosto destapó tres más: dos que solo se
ven cuando la API corre contra una base donde no es dueña de las tablas, y uno que solo
se ve desde un navegador. Están en [hallazgos-revision.md](hallazgos-revision.md) y en
[SEGURIDAD.md](../supabase/SEGURIDAD.md).

| | Hallazgo | Estado |
|---|---|---|
| H14 | El esquema no se podía crear: columna generada sobre una expresión no inmutable | **Corregido** |
| H11 | El navegador podía desalojar los casos sin sincronizar, en silencio | **Corregido** |
| H7 | El teléfono viajaba sin autorización de la familia | Pendiente |
| H9 | La regla de consentimiento no existe en la base, solo en el cliente | **Corregido**, HU 1.5.2 |
| H10 | La cola no consulta si la sesión sigue vigente | Pendiente |
| H8, H12, H13 | Imprecisiones de documentación y ausencia de pruebas automáticas | Pendiente |
| H15 | La API no podía leer perfiles ni escribir en `auth.users`: ningún inicio de sesión contra la nube era posible | **Corregido** |
| H16 | El alta de voluntarios no es idempotente, aunque su documentación lo afirma | **Corregido** |
| H17 | CORS no permitía `DELETE`, así que cerrar sesión desde la PWA no habría funcionado | **Corregido** |

H14 era bloqueante: el esquema completo habría fallado al ejecutarse el día que alguien
creara la base.

---

## 4. Qué falta

| Frente | Estado | Depende de |
|---|---|---|
| F1 Captura offline | Funcionando | — |
| F2 Identidad y acceso | **Registro y acceso funcionando contra la nube real** | — |
| F3 Sincronización y servidor | **Desplegada en `api.apoyo-colombia.com`, con TLS** | — |
| F4 Tablero y mapa | Abierto, bloqueado por una decisión | F7 |
| F5 Remisiones y seguimiento | Abierto | F3 |
| F6 Calidad y prueba en campo | **Empieza ya, no depende de nada** | — |
| F7 Datos y cumplimiento | Abierto, con cuatro decisiones pendientes | — |
| F8 Multi-municipio | Abierto | — |

El estándar de confiabilidad que debe cumplir la información está en
[ESTANDAR-PROBATORIO.md](ESTANDAR-PROBATORIO.md), con nueve brechas identificadas y su
prioridad. Los atajos que se tomaron a sabiendas están en
[DEUDA-TECNICA.md](DEUDA-TECNICA.md), cada uno con la condición escrita que obliga a
volver sobre él.

Detalle de cada frente en [FRENTES.md](FRENTES.md). El desglose en historias está en
Trello, organizado en cinco hitos con 43 historias; la fuente es
[docs/backlog/tablero-raiz.json](backlog/tablero-raiz.json).

**No hay sprints.** Los hitos son estados a los que llega el producto, no iteraciones
con fecha. Quien queda libre toma la siguiente historia sin bloquear del hito más bajo
y avisa en el grupo que la tomó.

### Lo que la documentación decía de más

Una revisión contra el código encontró ocho puntos donde la documentación afirmaba algo
que el código no sostenía. Están en [hallazgos-revision.md](hallazgos-revision.md).
Cuatro importan para lo que se dice por fuera del equipo:

- **La vista pública del mapa no es agregada** (H12). `v_estadisticas` y
  `v_estado_gestion` sí lo son. `v_mapa_publico` es **una fila por familia** con vereda,
  prioridad, personas, menores, adultos mayores y la coordenada redondeada. Redondear
  una coordenada no la agrega: en una vereda de vivienda dispersa ese conjunto describe
  una vivienda y a quién hay dentro. Decidir qué se publica es la HU 2.1.1.
- **El teléfono viaja sin autorización** (H7). Es obligatorio y no está en la regla de
  consentimiento. Sin él no se puede verificar el caso ni avisarle a la familia; con él,
  el registro no es anónimo. Hay que escoger. Es la HU 1.5.1.
- **La regla de consentimiento existe una sola vez, pero todavía no la llama nadie**
  (H8, H9). Está en `dominio/src/consentimiento.ts` como función pura compartida, que es
  lo que permite que «ninguna ruta puede saltársela» llegue a ser cierto. El frontend
  aún no la usa y el servidor no existe.
- **La auditoría no registra consultas.** Los disparadores son de escritura sobre
  `familias` y `remisiones`; PostgreSQL no dispara sobre lecturas.

El contraste completo entre la presentación a autoridades y lo que el código sostiene
está en [pitch-contraste.md](pitch-contraste.md).

Un noveno hallazgo ya se corrigió: **el esquema no se podía crear** (H14). Una columna
generada usaba una expresión no inmutable y abortaba el archivo completo a media
carga. Nunca se detectó porque nadie lo había ejecutado.

### Identidad: qué quedó montado el 15 de agosto

**Cognito existe en AWS real**, no emulado. Pool `raiz-voluntarios`, cliente `raiz-pwa`
sin secreto, con flujo de usuario y clave. Se creó desde
[`entorno/aws/desplegar-cognito.sh`](../entorno/aws/desplegar-cognito.sh), que es
idempotente: correrlo otra vez no duplica nada. Los identificadores quedan en
`entorno/generado/nube.env`, que no se versiona.

Verificado contra AWS, no supuesto: el inicio de sesión devuelve un token de acceso de
12 horas —una jornada de campo completa—, con el emisor correcto, y las llaves públicas
responden. Es el mismo protocolo que usa el adaptador de la API, así que lo probado es
el camino real.

**La API tiene registro y acceso.** Cuatro rutas: abrir sesión, comprobar si el token
sirve, cerrarla, y dar de alta voluntarios. Toda ruta pide token salvo tres marcadas
explícitamente, y el valor por defecto está invertido a propósito: si alguien olvida
marcar una ruta nueva, el resultado es que pide token, no que quede abierta.

**No hay registro abierto**, y es deliberado. Da de alta el custodio, o el coordinador.
Lo que se escribe con esa cuenta es el padrón de familias damnificadas: un formulario
público significa que cualquiera con el enlace mete casos, y un censo contaminado no se
limpia — se descarta, y con él el trabajo de quienes sí fueron a la vereda.

El alta desde la API crea la cuenta en Cognito **y** refleja el usuario en `auth.users`,
de donde el disparador crea el perfil con el rol menos privilegiado. Eso resuelve de
paso el eslabón que el ADR 002 proponía resolver con una Lambda de post-confirmación.
Esa Lambda ya no se necesita: no hay registro abierto, así que no hay ningún alta que
ocurra fuera de la API. No usamos funciones para nada del flujo de identidad.

### La API está desplegada. Qué quedó montado el 15 de agosto

La infraestructura existe en AWS real, hecha con guiones idempotentes en
[`entorno/aws/`](../entorno/aws/): red, base, clúster y servicio. Cada guion se puede
correr las veces que haga falta sin duplicar nada.

| Pieza | Qué es |
|---|---|
| Red | VPC propia, dos zonas. **Sin puerta de enlace NAT** y sin endpoints de interfaz: los dos cuestan cerca de 30 USD/mes y ninguno hace falta. |
| Base | RDS PostgreSQL 16.14, `db.t4g.micro`, cifrada, en subredes **sin ruta a internet**. |
| Esquema | Lo aplica una tarea efímera **dentro** de la VPC, no una persona. Migraciones numeradas con registro: aplicar dos veces no repite ninguna. |
| API | Fargate, ARM64, una réplica de 0,25 vCPU, detrás de un balanceador. |
| Borde | HTTPS con certificado comodín; el 80 solo redirige. Nombre propio en Route 53. |
| PWA | CloudFront sobre bucket privado, en `apoyo-colombia.com` y `www`. |
| Presupuesto | 50 USD/mes con cuatro avisos, configurado **antes** del primer recurso. |

Verificado contra el despliegue real y sobre HTTPS, no supuesto: el custodio inicia
sesión y recibe un token de 12 horas con su rol leído del perfil; da de alta un
voluntario, que nace con el rol menos privilegiado; ese voluntario inicia sesión y
**no** puede dar de alta a nadie. `GET /salud` responde `disponible: true`, y un
origen que no está en la lista no recibe permiso de CORS.

**La API tiene nombre propio y TLS: `https://api.apoyo-colombia.com`.** Certificado
comodín de ACM, TLS 1.3, y el puerto 80 dejó de servir la API — su única acción es
redirigir con 301. No se cierra, porque un enlace viejo pegado en el grupo de WhatsApp
acabaría en una conexión rechazada sin ninguna pista; con la redirección esa petición
llega cifrada. No queda ninguna ruta por la que una clave viaje en claro.

El dominio se administra en Route 53 y el certificado lo renueva ACM solo, mientras el
registro CNAME de validación siga en la zona.

**La PWA está publicada en `https://apoyo-colombia.com`** (y `www`), servida por
CloudFront desde un bucket privado con los cuatro bloqueos de acceso público. Hasta hoy
la aplicación se compilaba con `apiUrl` vacío —modo local, captura y guarda sin enviar—
y por eso no habría sincronizado nunca aunque estuviera publicada. Ahora la compilación
de producción apunta a la API, y el guion de publicación **falla** si el paquete no
lleva esa dirección adentro: una PWA publicada en modo local no da ningún error, los
casos simplemente no llegan.

La política de seguridad de contenido se cerró de paso. Decía `connect-src 'self'
https:` con una nota que pedía reemplazarlo cuando la dirección de la API estuviera
decidida; ahora dice `https://api.apoyo-colombia.com`. La diferencia práctica: antes
impedía que un script inyectado robara los casos, ahora impide además que los mande a
un servidor ajeno.

Dos cosas quedaron decididas y conviene que no se reabran por error:

- **La API va en contenedor sobre Fargate, no en la máquina de nadie.** Se intentó lo
  segundo por celeridad y se descartó: obligaba a exponer la base a internet.
- **La base no recibe tráfico público.** Su grupo de seguridad solo acepta al
  contenedor. Por eso el esquema se carga desde adentro: abrir la base «un rato» es la
  puerta que después nadie cierra.
- **La base tiene protección contra borrado.** Esto atiende una emergencia humanitaria:
  un borrado accidental no cuesta una tarde de trabajo sino el padrón de familias que
  ya fueron caracterizadas una vez. Destruir el entorno sigue siendo posible, pero exige
  apagarla a propósito primero — ese paso extra **es** la protección.

**El pipeline se autentica sin llaves.** GitHub firma un token que dice de qué rama
viene; AWS lo verifica y entrega credenciales que duran una hora. No hay ningún secreto
de AWS en el repositorio, y la confianza está acotada a `refs/heads/main`: una propuesta
de cambio no puede asumir el rol por mucho que altere el flujo. Queda una llave de larga
vida —la de quien montó todo esto— y retirarla es la deuda [D3](DEUDA-TECNICA.md), la de
mayor riesgo que hay abierta.

### El bloqueo real que queda

**Nadie ha probado esto en campo.** El código puede estar perfecto y el formulario
seguir siendo inusable de pie, bajo el sol, con la familia esperando. Eso no lo detecta
ninguna prueba automática. Ya no hay excusa técnica: no requiere servidor, y ahora
tampoco espera a nadie.

El bloqueo anterior —«no hay proyecto de Supabase»— ya no aplica: el entorno local
levanta todo lo necesario para trabajar, y la infraestructura de producción es trabajo
de plataforma que ocurre aparte de quien programa.

### Pendientes que no son técnicos y bloquean la entrega

- Nombre exacto de la dependencia responsable de vivienda urbana.
- Entidades y contactos identificados por Miguel.
- Sigla y nombre de la organización internacional bajo la cual se hace la
  representación.
- Listado oficial de veredas de Sevilla, para normalizar nombres. Sin él, la misma
  vereda entra escrita de cuatro formas y las cifras por vereda no se sostienen.
- Formato oficial de censo de damnificados del consejo municipal de gestión del
  riesgo, para que ninguna entidad devuelva el reporte por forma.

Los dos últimos dependen de gestión ante la alcaldía y las entidades, y la
presentación a autoridades civiles es la ocasión de pedirlos.

---

## 5. Qué necesitamos ahora

**Prioridad 1 — cualquiera con un Android.** Instalar la aplicación, ponerla en modo
avión, registrar un caso de prueba y contar todo lo que incomodó. No requiere escribir
código, no depende del servidor y es lo de mayor impacto.

**Prioridad 2 — quien quiera hacer el servidor.** El contrato, los puertos y el
paquete de dominio están listos, y el entorno local levanta la base con un comando.
Desbloquea la mitad del tablero.

**Prioridad 3 — Angular y visualización.** El tablero y el mapa no tocan el núcleo: se
pueden construir en paralelo desde hoy con los datos de ejemplo del entorno local. Ojo
con la decisión pendiente sobre qué puede mostrar el mapa público.

Con dos horas a la semana se aporta. Escoja una historia del tablero y avise cuál toma,
para no repetir trabajo.

---

## 6. Reglas que no se negocian

- En el grupo de chat **no** se publican nombres, cédulas, teléfonos ni fotografías de
  familias afectadas. Son datos sensibles bajo la Ley 1581 de 2012.
- Para desarrollar y probar se usan datos inventados. Nunca datos reales.
- Ninguna vista pública lleva nombre, documento ni teléfono, y la coordenada va
  degradada. **No todas son agregadas**, y hasta que se resuelva la HU 2.1.1 no se
  afirma que lo sean.
- No se prometen ayudas, plazos ni cobertura a nombre del equipo.
- Aquí no se recauda ni se administra dinero.
- Las decisiones técnicas se escriben en el repositorio, no solo en el chat.

---

Repositorio: <https://github.com/anavelezconsultoria/raiz>
