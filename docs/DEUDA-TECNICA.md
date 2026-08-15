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
