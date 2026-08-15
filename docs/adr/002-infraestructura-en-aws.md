# ADR 002 — Infraestructura en AWS

Fecha: 13 de agosto de 2026
Estado: **Propuesta**
Reemplaza a: [ADR 001 — Supabase frente a nube propia](001-supabase-frente-a-nube-propia.md)

## Qué cambió

El ADR 001 no cerró la puerta: dejó seis condiciones para reabrirse. La sexta
decía, textualmente:

> El equipo tiene alguien con capacidad real de operar infraestructura, con
> turnos y monitoreo, no de montarla y desaparecer.

Y agregaba: *"La sexta es la más importante y la que más se subestima.
Infraestructura propia sin quien la opere es peor que un servicio administrado."*

Esa condición se cumplió. Aparece una capacidad de plataforma separada del equipo
de desarrollo, con un modelo de trabajo explícito: **la infraestructura no depende
de quien programa**. Existe antes o en paralelo, los voluntarios proponen cambios
por PR y los despliegues ocurren de forma controlada y transparente para ellos.
Ese modelo se describe en [ADR 004](004-modelo-de-entrega.md).

Por eso esta decisión no contradice al ADR 001: lo continúa por la vía que él
mismo dejó abierta.

## Lo que NO cambió, y conviene decirlo

**Ninguno de los otros cinco disparadores se cumplió.** El cálculo de carga del
ADR 001 sigue siendo válido: 0,03 escrituras por segundo en el día pico, unas
30.000 filas, 3 GB de fotografías. La capacidad de cómputo seguía sobrando por
tres órdenes de magnitud y sigue sobrando.

Esto no es una migración por rendimiento, por escala ni por límites alcanzados.
Es un cambio de custodia de la infraestructura. Confundir una cosa con la otra
llevaría a sobredimensionar el diseño, que es el error más caro disponible aquí.

## La necesidad operativa manda

Antes de cualquier servicio, lo que este sistema tiene que lograr, según
[ESTADO.md](../ESTADO.md):

> Caracterizar a cada familia afectada **una sola vez**, con datos que la entidad
> competente pueda usar, y acompañar cada caso hasta que alguien responda por él.

Y la restricción que define el diseño:

> No hay capacidad de ir al terreno y en la zona veredal no hay señal. Quien
> captura es un líder que ya vive allá, con el celular que ya tiene. Cualquier
> decisión técnica que rompa eso está mal, por elegante que sea.

De ahí se derivan los requisitos que la infraestructura debe respetar, y ninguno
es negociable por conveniencia de la nube:

1. **La aplicación funciona sin el servidor.** La captura ocurre en el
   dispositivo. La disponibilidad del backend no es crítica.
2. **La sincronización nunca es automática.** El botón es explícito porque los
   datos móviles los paga el voluntario.
3. **Iniciar sesión exige conexión; capturar, no.** Un token vencido en el monte
   no puede costar una jornada.
4. **Una sola base de datos, tres reportes.** El total consolidado es la palanca
   de negociación; si no cuadra, se pierde.
5. **Sin autorización de la familia, la identidad no viaja.** Y la regla se
   aplica en el borde de salida, no en la interfaz.

## Qué se conserva del trabajo hecho

Esta es la parte que hace barata la decisión. El acople a Supabase resultó estar
contenido en cuatro puntos:

| Acople | Reemplazo |
|---|---|
| `auth.uid()`, en 9 usos, todos dentro de políticas | Función que lee `current_setting('app.user_id')` |
| `references auth.users(id)` | Tabla local `auth.users`, espejo de Cognito |
| Roles `anon` y `authenticated` | Son roles corrientes de PostgreSQL |
| Disparador `after insert on auth.users` | Lambda de Post-Confirmation de Cognito |

Con un shim de unas 40 líneas —[`entorno/postgres/00-shim-auth.sql`](../../entorno/postgres/00-shim-auth.sql)—
**las 12 tablas, las 5 vistas, todas las políticas RLS y los seis hallazgos
corregidos en [SEGURIDAD.md](../../supabase/SEGURIDAD.md) sobreviven sin
reescribirse.** El disparador que crea el perfil con el rol menos privilegiado
sigue funcionando tal cual.

Se conserva también el contrato con KoboToolbox: las columnas siguen replicando
los nombres del XLSForm, así que la vía paralela de la fase 0 no se interrumpe y
migrar de Kobo sigue siendo una carga, no una reescritura.

### Qué tiene que traer el pool de Cognito

La API ya está escrita contra Cognito, así que el pool no se puede configurar «como
salga»: hay cuatro cosas que si no coinciden, el ingreso falla. Se dejan aquí para que
quien monte la infraestructura (HU 1.1.1) no las adivine, y porque el entorno local ya
las cumple y sirve de referencia — ver [`entorno/aws/bootstrap.sh`](../../entorno/aws/bootstrap.sh).

| Qué | Por qué |
|---|---|
| Cliente con `ALLOW_USER_PASSWORD_AUTH` | Es el flujo que usa `POST /sesion`. Sin él, Cognito rechaza todo ingreso |
| Correo como nombre de usuario | El voluntario escribe su correo, no un alias |
| Si el cliente lleva **secreto**, hay que darle `COGNITO_CLIENT_SECRET` a la API | Con secreto, Cognito exige `SECRET_HASH`. El entorno local crea el cliente **sin** secreto, así que este es el punto donde algo funciona en la máquina de quien programa y falla en la nube |
| Sin segundo factor, por ahora | La API detecta el desafío y responde con un mensaje claro, pero no lo resuelve |

Variables que la API espera: `COGNITO_CLIENT_ID`, `COGNITO_JWKS_URI`, `COGNITO_ISSUER`,
`AWS_REGION`, y `COGNITO_CLIENT_SECRET` solo si aplica. En local basta con
`COGNITO_ENDPOINT` apuntando a cognito-local.

### La pieza que hoy falta y bloquea el ingreso real

En Supabase, crear un usuario disparaba solo la fila de `perfiles`. En AWS esa cadena
tiene un eslabón que **todavía no está construido**:

```
usuario confirmado en Cognito
   └─> Lambda de post-confirmación        ← NO EXISTE
         └─> insert en auth.users
               └─> disparador tr_crear_perfil
                     └─> fila en perfiles, con rol lider
```

Sin ese primer paso, `perfiles` queda vacía y **todo ingreso real falla**, aunque las
credenciales sean correctas. La API lo dice con todas las letras —«su cuenta existe
pero todavía no tiene perfil asignado»— en vez de dejar entrar a alguien sin rol, que
sería peor. Pero conviene saber que ese mensaje no es un caso raro: hoy es lo que
recibiría el primer voluntario que entre en la nube.

Es **HU 1.2.7**, y es requisito de HU 1.2.8. En el entorno local no se nota porque
`bootstrap.sh` inserta los usuarios de prueba directamente en `auth.users`, que es
justamente lo que la Lambda tendrá que hacer.

## Arquitectura

```
PWA (estática)
   │  JWT de Cognito
   ▼
API en contenedor ── set_config(app.user_id) ──► RDS PostgreSQL + PostGIS
   │                                              (RLS intacto)
   ├── URL prefirmada ─────────► S3 privado (fotografías)
   └── webhook de Kobo ────────► misma base, idempotente por kobo_uuid

Mapa público: JSON agregado regenerado a CDN. La base no recibe tráfico anónimo.
```

### Contenedor, no funciones

Un servicio pequeño en contenedor, no Lambda. Tres razones, todas operativas:

- **Sin arranque en frío en la ruta de sincronización.** El voluntario tiene una
  ventana de señal de minutos y la cola hace una petición por caso. Pagar arranque
  en frío en cada una es cobrarle su tiempo y sus datos.
- **Conexiones persistentes a PostgreSQL**, con lo que no hace falta un
  intermediario de conexiones que cuesta más que la propia base.
- **Un solo código y desarrollo local trivial**, que es lo que permite que un
  voluntario con dos horas semanales aporte sin aprenderse la nube.

Lambda queda para lo episódico: el disparador post-confirmación de Cognito y la
regeneración del JSON del mapa.

### La frontera no se mueve

El dominio sigue dependiendo de `SincronizacionPort` y `AuthPort`. AWS vive
detrás de esas interfaces, igual que vivía Supabase. La propiedad que el ADR 001
describía como seguro sigue intacta, y ahora quedó demostrada: se usó.

### El rol vive en la base, no en el token

`perfiles.rol` es la autoridad y `mi_rol()` lo lee de ahí. Cognito no guarda
roles. Así el custodio de datos asciende o degrada a alguien y surte efecto en la
consulta siguiente, sin tocar el proveedor de identidad y sin esperar a que
caduque un token. Es coherente con que el custodio tenga poder de veto.

## Dos mejoras que el cambio habilita

- **Bloqueo de acceso público a nivel de cuenta en S3** cierra por diseño el
  punto 6 de SEGURIDAD.md —el bucket público—, que el propio documento señala
  como "el que más se olvida" y anticipa como el H7 de la próxima revisión.
- **Servir el mapa público como JSON estático** elimina la superficie anónima
  contra la base. Hoy el rol `anon` tiene `grant select` sobre tres vistas; con el
  JSON regenerado, no necesita ninguno.

## Costo

| Concepto | Mensual |
|---|---|
| RDS PostgreSQL `t4g.micro` | ~15 USD (gratis los primeros 12 meses) |
| Contenedor de la API, 0,25 vCPU | ~9 USD |
| S3, 3 GB más peticiones | ~1 USD |
| CDN y Cognito | dentro de capa gratuita a esta escala |
| Secretos y observabilidad | ~5 USD |
| **Total** | **~30 a 50 USD** |

Comparable a los ~26 USD del ADR 001. El ofrecimiento de financiación lo cubre.

### Tres trampas que multiplican la factura

Se anotan porque son las que aparecen por inercia, no por decisión:

1. **Puerta de enlace NAT, ~32 USD/mes.** Evitable con endpoints de VPC.
2. **Intermediario de conexiones a la base, ~21 USD/mes.** Innecesario con
   conexiones persistentes; costaría más que la base que protege.
3. **Base de datos sin servidor con mínimo de capacidad, ~44 USD/mes.** No hace
   falta a esta carga.

Presupuesto con alerta desde el primer día. Es infraestructura financiada por
donación para atender una emergencia: una factura sorpresa no es un problema
técnico, es un problema de confianza.

## Condiciones que esta decisión exige

No es una decisión gratuita. Se acepta con estas obligaciones:

1. **Infraestructura como código desde el primer recurso.** En Supabase el estado
   vivía en un panel. En AWS, sin código, el sistema queda irreproducible el día
   que la persona que lo montó no esté — que es el escenario base de un equipo
   voluntario, no el excepcional.
2. **La responsabilidad de plataforma tiene dueño con nombre.** No es "dueño de
   F9": F9 se termina, la plataforma se opera siempre. Ver
   [ROLES-Y-ESFUERZO.md](../ROLES-Y-ESFUERZO.md).
3. **Preproducción nunca recibe datos reales.** Garantía del pipeline, no
   disciplina de las personas.
4. **El ciclo de desarrollo no depende de infraestructura levantada.** Hoy es
   cierto y hay que defenderlo: ver [`entorno/`](../../entorno/).

## Cuándo se revisa

1. La factura mensual supera 150 USD sin que haya crecido el uso.
2. La responsabilidad de plataforma queda sin dueño más de un mes.
3. Una entidad exige por escrito que los datos residan en Colombia.
4. El tiempo del equipo se va en operar y no en construir, dos ciclos seguidos.

La cuarta es la que hay que vigilar. El ADR 001 advertía que el costo real no es
la factura sino el tiempo del equipo, y ese riesgo no desapareció: se trasladó a
la persona de plataforma.

## Lo que esta decisión NO dice

No dice que AWS sea superior a Supabase. Para un equipo sin capacidad de
operación, Supabase seguía siendo la respuesta correcta, y el ADR 001 sigue siendo
un buen documento.

Dice que apareció quien opere la infraestructura, que eso era exactamente lo que
faltaba, y que la salida estaba construida de antemano — que era el punto de haber
puesto los puertos.

Y no dice nada sobre el modelo de datos. Sigue siendo PostgreSQL relacional, sigue
siendo una sola base, y las tres bases separadas siguen sin existir.
