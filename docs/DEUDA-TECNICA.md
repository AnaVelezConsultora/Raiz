# Raíz — Deuda técnica controlada

Corte: 15 de agosto de 2026.

Aquí van los atajos que se tomaron **a sabiendas**. No es una lista de pendientes:
un pendiente es algo que falta, y esto es algo que se decidió no hacer todavía,
con un motivo y con una condición escrita que obliga a volver.

La diferencia entre deuda controlada y deuda a secas es esa condición. Sin ella,
«lo arreglamos después» significa «nunca», y nadie puede decir en qué momento
dejó de ser aceptable.

**Regla de esta tabla:** ninguna entrada entra sin *disparador*. Si no se puede
escribir qué hecho concreto obliga a pagarla, es que no se entiende bastante bien
como para postergarla.

---

## Resumen

| # | Deuda | Riesgo | Disparador que obliga a pagarla |
|---|---|---|---|
| D1 | La API no valida el certificado de RDS (`sslmode=no-verify`) | Bajo | Que el tráfico a la base salga de la VPC, o que aparezca un segundo entorno |
| D2 | Las claves de la base no rotan | Medio | Que alguien con acceso al secreto deje el equipo |
| D3 | Sigue viva una llave de larga vida de IAM | **Alto** | Que el pipeline despliegue solo, verificado una vez |
| D4 | Los guiones son CLI y no código declarativo | Medio | Que haya un segundo entorno, o un segundo municipio |
| D6 | Quien crea una cuenta conoce la clave de esa persona | **Alto** | La primera entrega nominal a una entidad, o el primer líder que no sea del equipo |
| D7 | No hay respaldo de la base | **Alto** | **Ya se cumplió**: hay datos de familias reales adentro |
| D8 | La base desplegada conserva `perfil_lee_en_login` | Bajo | El primer despliegue posterior al que llevó el código que la vuelve innecesaria |

El número D5 no se reutiliza: fue la vista previa por propuesta de cambio, que se
retiró de esta tabla y quedó explicada más abajo.

---

## D1 · La API no valida el certificado de RDS

**Qué se hizo.** La cadena de conexión termina en `sslmode=no-verify`. El tráfico
entre la API y PostgreSQL **va cifrado**, pero la API no comprueba que el
certificado del otro extremo sea de quien dice ser.

**Por qué.** RDS firma su certificado con una autoridad propia de Amazon que no
está en el almacén de confianza de Node. Validarlo de verdad —`verify-full`—
obliga a llevar el paquete de certificados de Amazon dentro de la imagen, a
copiarlo en la etapa de ejecución del `Dockerfile` y a mantenerlo actualizado
cuando Amazon lo rote.

**Qué protege hoy y qué no.** Protege contra escucha pasiva: nadie que observe el
tráfico lee la conexión. **No** protege contra alguien que ya esté dentro de la
VPC y pueda suplantar a la base. Esa es la diferencia exacta, y es la que hace
aceptable el atajo: el tráfico nunca sale de nuestra red, la base vive en subredes
sin ruta a internet y su grupo de seguridad solo acepta al de la API. Un atacante
capaz de explotar esto ya tendría que estar adentro, y si está adentro tiene
caminos peores.

**Por qué no se paga ahora.** Cuesta más que su riesgo actual, y hay tres cosas
por delante con riesgo mayor: la llave de larga vida (D3), que nadie haya probado
la aplicación en un teléfono real, y que no exista listado oficial de veredas.

**Disparador.** Se paga el día que ocurra cualquiera de estas dos:

- El tráfico hacia la base deje de estar contenido en la VPC — una réplica en otra
  región, un cliente fuera del clúster, un túnel para depurar.
- Aparezca un segundo entorno. Con dos, el riesgo deja de ser «alguien dentro de
  nuestra red» y pasa a ser «alguien dentro de la red equivocada».

**Cómo se paga.** Bajar el paquete de Amazon en la etapa de construcción del
`Dockerfile`, copiarlo a la de ejecución, y cambiar el secreto `raiz/base-api` a
`sslmode=verify-full&sslrootcert=<ruta>`. Es un cambio de una imagen y un secreto;
no toca código de la API.

---

## D2 · Las claves de la base no rotan

**Qué se hizo.** `raiz_admin` y `raiz_api` tienen claves generadas una vez, en
Secrets Manager, sin rotación automática.

**Por qué.** Rotar automáticamente en RDS exige una función Lambda de rotación y
una ventana en la que las conexiones vivas del pool se reconectan. Es
infraestructura adicional que hay que desplegar, auditar y mantener.

**Qué lo hace tolerable.** Rotarlas a mano ya es barato y no requiere tocar la
base: se cambia el valor del secreto y se corre `aplicar-migraciones.sh`, que
reconcilia la clave de `raiz_api` en cada corrida. O sea, la rotación existe; lo
que no existe es que ocurra sola.

**Disparador.** La primera persona con acceso a los secretos que deje el equipo.
Ese día se rota a mano, y si ese día llega más de una vez, se automatiza.

---

## D3 · Sigue viva una llave de larga vida de IAM

**Qué se hizo.** La HU 1.1.2 quedó montada —proveedor OIDC, rol por entorno,
confianza acotada a `refs/heads/main`— pero el usuario `yona-cli` y su llave de
acceso **siguen existiendo**, porque son los que se usaron para crear todo esto.

**Por qué sigue ahí.** Retirarla antes de comprobar que el pipeline despliega solo
dejaría el proyecto sin ninguna forma de desplegar. El orden correcto es:
desplegar una vez por el pipeline, comprobar, y entonces retirarla.

**Es la deuda de mayor riesgo de esta tabla.** Una llave de larga vida no caduca,
no dice quién la copió, y quien la tenga alcanza la base de familias damnificadas.
Todo lo que se montó en la HU 1.1.2 sirve para poder borrarla; mientras no se
borre, sigue siendo el camino más corto hacia los datos.

**Disparador.** El primer despliegue exitoso ejecutado por el flujo `Desplegar`.
No hay que esperar a nada más.

**Cómo se paga.**

```sh
aws iam list-access-keys --user-name yona-cli
aws iam delete-access-key --user-name yona-cli --access-key-id <la que salga>
```

Lo que quede después para operar a mano se hace con un rol asumido, no con una
llave.

---

## D4 · Los guiones son CLI y no código declarativo

**Qué se hizo.** La infraestructura vive en guiones de shell idempotentes en
`entorno/aws/`, no en Terraform ni CDK.

**Por qué.** Se eligió velocidad práctica sobre forma: había que llegar a una API
funcionando, y un guion que se lee de arriba abajo se revisa sin aprender una
herramienta. Cada uno explica **por qué** hace lo que hace, que es la parte que un
archivo declarativo no suele llevar.

**Qué lo hace tolerable.** Los guiones son idempotentes y buscan cada recurso por
etiqueta, así que describen el estado deseado casi tan bien como una herramienta
declarativa. Lo que no dan es un plan previo —no se puede ver qué va a cambiar
antes de que cambie— ni un destruir completo de una pieza.

**Lo que ya se sabe que va a doler.** No hay estado, así que un recurso creado a
mano en la consola es invisible para los guiones y no se detecta hasta que choca.

**Disparador.** El primero de estos dos:

- Un segundo entorno. Duplicar guiones a mano es cómo se separan los entornos sin
  que nadie se dé cuenta.
- Un segundo municipio (frente F8). Es la promesa de la HU 4.1.2 —«usar Raíz en
  otro municipio sin tocar código»— y con guiones no parametrizados no se sostiene.

**Cómo se paga.** Importando lo que ya existe, no reescribiendo desde cero: los
recursos están etiquetados con `Proyecto=Raiz` y `Gestion=<guion>` justamente para
poder inventariarlos y adoptarlos con un diff.

---

## D6 · Quien crea una cuenta conoce la clave de esa persona

**Qué se hizo.** El alta por `POST /voluntarios` fija una clave **definitiva**, que
escribe quien da de alta y le entrega al voluntario por WhatsApp.

**Por qué.** Una clave temporal obliga a cambiarla en el primer ingreso, y ese cambio
es un desafío de Cognito que la API todavía no resuelve: el voluntario quedaría creado
y sin poder entrar. Entre eso y que la coordinación pueda sumar líderes hoy, se eligió
lo segundo, a sabiendas.

**Qué cuesta, dicho sin adornos.** Cada caso queda firmado con quien lo reportó, y esa
firma es el argumento con el que se sustenta el censo ante una entidad: quién levantó
cada dato y cuándo. Mientras alguien más conozca esa clave, la firma no prueba autoría.
No es un riesgo hipotético de intrusos: es que nuestro propio registro no puede
sostener lo que afirma.

**Cómo se paga.** Lo mínimo es una ruta para cambiar la propia clave, y pedirle a cada
líder que lo haga al entrar. Lo correcto es forzar el cambio en el primer ingreso, que
es resolver el desafío de Cognito en la API.

**Disparador.** La primera entrega nominal a una entidad, o el primer líder de campo
que no sea del equipo. Lo que ocurra antes.

---

## D7 · No hay respaldo de la base

**Qué se hizo.** Nada, y ahí está el problema. RDS quedó con lo que trae por defecto y
no se verificó que exista una copia recuperable ni se ha probado restaurar una.

**Por qué.** El despliegue se hizo contra reloj y la base estaba vacía. Con la base
vacía, no tener respaldo no cuesta nada.

**Qué cuesta.** Ya no está vacía. Lo que hay adentro son familias damnificadas
caracterizadas una por una por líderes que subieron a la vereda, y ese trabajo no se
puede volver a hacer: la emergencia sigue y la gente se mueve. Un borrado accidental,
una migración mal aplicada o un fallo de la instancia, y no hay de dónde volver.

**Cómo se paga.** Confirmar que las copias automáticas de RDS están activas y con qué
retención, y **probar una restauración**. Un respaldo que nunca se restauró es una
suposición, no un respaldo.

**Disparador.** Ya se cumplió. Esta entrada nace vencida a propósito: entró a la tabla
el mismo día en que dejó de ser postergable, y se queda aquí hasta que alguien pueda
decir que restauró una copia y funcionó.

---

## D8 · La base desplegada conserva `perfil_lee_en_login`

**Qué se hizo.** Esa política le permitía a la API leer `perfiles` sin identidad, que
era como se resolvía el ingreso. El código ya no la necesita —la consulta pone
identidad—, y el archivo del esquema la retira. Pero el aplicador lleva registro por
nombre de archivo y ese ya figura como aplicado, así que en la base desplegada la
política **sigue existiendo**.

**Por qué.** Retirarla exige una migración nueva, y esa migración no puede salir en la
misma entrega que el código: el despliegue aplica migraciones **antes** de que la
versión nueva reciba tráfico, de modo que soltar el `drop` ahí dejaría unos minutos a
la versión vieja —la que lee sin identidad— sin poder resolver ningún ingreso, con
líderes trabajando.

**Qué cuesta.** Poco y conviene decirlo: mientras esté, la API puede leer `perfiles`
entera por el camino sin identidad. Hoy ninguna consulta lo hace. El riesgo no es lo
que pasa, es lo que quedaría abierto para la próxima consulta que alguien escriba por
ahí sin darse cuenta.

**Cómo se paga.** Una migración numerada con el `drop`, en el despliegue siguiente.

**Disparador.** El primer despliegue posterior al que llevó el código que la vuelve
innecesaria.

---

## Lo que NO es deuda, aunque lo parezca

Conviene decirlo para que nadie venga a «arreglarlo»:

- **Una sola tarea de la API, sin réplicas.** No es un ahorro provisional. La
  aplicación captura sin servidor y la cola reintenta: si la tarea se cae, la
  sincronización se retrasa y no se pierde un caso. Poner dos duplica lo que
  factura por hora sin atender a nadie más.
- **RDS sin Multi-AZ.** Lo mismo. El dato que no puede perderse vive en el celular
  del voluntario hasta que el servidor confirma.
- **El puerto 80 abierto.** No sirve la API: solo redirige a 443. Cerrarlo dejaría
  a quien llegue por un enlace viejo con una conexión rechazada y sin ninguna
  pista.
- **Sin puerta de enlace NAT.** Es una decisión de la HU 1.1.1 y del ADR 002, no
  un atajo.
- **Sin vista previa por propuesta de cambio.** Estuvo un rato en esta tabla como
  D5 y se retiró: quien responde por el proyecto decidió el 15 de agosto de 2026
  que no hace falta. Un segundo sitio publicado —el de Netlify— envejecía por su
  cuenta y se descubre el día que alguien reporta un error contra la versión
  equivocada.

  **Lo que cuesta, dicho igual.** El ADR 004 llamaba a esa vista previa la pieza
  que vuelve accionable el frente F6: probar un cambio en un Android antes de
  fusionarlo. Sin ella, quien no programa solo puede probar lo que ya está
  publicado. Es una decisión tomada sabiendo el precio, no un olvido, y por eso no
  lleva disparador: no hay nada que se esté postergando.

  Si algún día se quiere, no hace falta volver a Netlify: la distribución de
  CloudFront ya existe y admite un prefijo `/vista-previa/<rama>/` sobre el mismo
  bucket.
