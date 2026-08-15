# Raíz — Hallazgos de revisión

Corte: 13 de agosto de 2026. Revisión de la documentación contra el código.

Se leyó toda la documentación del repositorio y se contrastó contra `frontend/src`
y `supabase/schema.sql`. **La documentación es precisa en la gran mayoría de lo
que afirma.** Este documento recoge únicamente los puntos donde el código no
sostiene lo que un documento declara resuelto, más una lista corta de desajustes
menores.

Se escribe en el formato de [SEGURIDAD.md](../supabase/SEGURIDAD.md) —hallazgo,
evidencia, consecuencia, corrección propuesta— y por la misma razón que aquel:
porque el próximo cambio puede reintroducirlos.

**Salvo H14, ninguno de estos hallazgos se corrige en esta propuesta.** Se reportan
para que la mesa decida cuáles toma y en qué orden; varios son decisiones del
frente F7 y no de quien programa. H14 es la excepción porque impedía que el
esquema se creara, y sin eso no había nada que verificar.

---

## Lo que sí se verificó y se sostiene

Para que la lista de abajo se lea en proporción:

| Afirmación | Verificado |
|---|---|
| Idempotencia por `origen_id` | `unique` en el esquema y `onConflict` en el envío |
| Casos antes que fotos, P0 primero, secuencial, se detiene al caer la red | `sincronizacion.service.ts` |
| La sincronización nunca es automática | al recuperar conexión solo refresca contadores |
| Nunca el tipo `any` | cero ocurrencias en `src/` |
| `security_invoker` en las vistas con identidad; RLS en auditoría | `schema.sql` |
| `default auth.uid()` en `registrador_perfil_id` | `schema.sql:99` |
| Las columnas replican el XLSForm | 85 de 100 nombres coinciden; el resto son metadatos y fotos |
| Guardado incremental paso a paso | `caso-form.service.ts` |

---

## H14 · Bloqueante · El esquema no se podía crear — CORREGIDO

Se descubrió al levantar el entorno local: **`supabase/schema.sql` fallaba al
ejecutarse y nunca llegó a crearse por completo, en ningún entorno.**

```
ERROR:  generation expression is not immutable
STATEMENT:  create table remisiones (...)
```

La tabla `remisiones` declaraba `dias_sin_respuesta` como columna generada y
almacenada sobre `current_date`. PostgreSQL exige que una expresión generada sea
inmutable, y `current_date` no lo es. La creación aborta ahí, y con ella **todo lo
que venía después en el archivo**: las tablas de ayudas y seguimientos, las cinco
vistas, las políticas RLS, la auditoría y el disparador de perfiles.

**Consecuencia.** ESTADO.md reporta el modelo de datos como "Funcionando y
verificado" y la fase 2 como "Esquema listo". El esquema no estaba listo: no
compilaba. Nadie lo había ejecutado nunca, ni contra Supabase ni contra nada. Es
la confirmación más directa del hallazgo H13: sin una sola ejecución automática,
un archivo puede vivir meses en el repositorio y estar roto de principio a fin.

**El segundo problema, que importa más.** Aunque PostgreSQL lo hubiera aceptado, el
valor habría quedado **congelado el día de la inserción**. Y el sentido del dato es
exactamente el opuesto: mide cuánto lleva una entidad sin responder, así que tiene
que crecer cada día que pasa. Almacenado, `v_estado_gestion` habría mostrado
siempre cero días de mora.

Eso no es un detalle: [FRENTES.md](FRENTES.md) describe F5 como el diferenciador
del proyecto —*"Sin este frente, Raíz es una base de datos más. Con él, es un
instrumento de exigibilidad"*— y la mora de las entidades es precisamente la
palanca. Un tablero que siempre marca cero días no presiona a nadie.

**Corrección aplicada.** Se eliminó la columna almacenada y el cálculo se movió a
`v_estado_gestion`, donde se evalúa al consultar. Con eso el esquema completo se
crea sin errores: 12 tablas, 5 vistas, 19 políticas y PostGIS activo, verificado
en el entorno local.

---

## H7 · Grave · El teléfono viaja sin autorización de la familia

El README afirma: *"Sin autorización se registra el caso agregado, sin identidad
ni fotografías."* [FRENTES.md](FRENTES.md) y
[cumplimiento/README.md](cumplimiento/README.md) lo repiten.

Cuatro campos se anulan correctamente sin consentimiento: nombres, apellidos, tipo
y número de documento. **El teléfono no.**

**Evidencia**

- `frontend/src/app/core/services/caso-form.service.ts:141-146` — los cuatro
  campos nominales pasan por el condicional de consentimiento; `tel1` y `tel2`
  quedan fuera y se persisten siempre.
- `frontend/src/app/core/infra/supabase-sync.adapter.ts:188-193` — lo mismo en el
  borde de salida hacia el servidor.
- `frontend/src/app/features/formulario/paso-hogar.component.ts:56-64` — el
  teléfono se pide **fuera** del bloque condicionado por consentimiento y es
  obligatorio: *"El telefono es obligatorio: sin el no se puede verificar el
  caso."*
- `supabase/schema.sql` — `tel_1 text not null`.

**Consecuencia.** Un número de celular es dato personal identificante y de
contacto directo. Un registro con teléfono no es un registro agregado sin
identidad. La afirmación del README no describe lo que hace el sistema.

**Tensión real, no descuido.** El texto de la interfaz da la razón operativa: sin
teléfono no se puede verificar el caso ni avisarle a la familia que la ayuda va en
camino. Es una tensión legítima entre utilidad y minimización de datos, y por eso
es decisión de F7 y no un arreglo de código.

**Salidas posibles**

1. Que el teléfono entre en la regla de consentimiento, aceptando que un caso sin
   autorización quede sin vía de contacto.
2. Mantenerlo, y **corregir la documentación**: el registro sin autorización es
   anónimo en cuanto a nombre y documento, no en cuanto a contacto.
3. Pedir una autorización específica y separada para el dato de contacto.

Lo que no puede quedarse es la contradicción entre lo que se promete y lo que se
guarda.

---

## H8 · Grave · La regla de consentimiento sí está en la interfaz, para las fotografías

[FRENTES.md](FRENTES.md) y [cumplimiento/README.md](cumplimiento/README.md)
afirman, en los dos casos con énfasis:

> La regla de consentimiento se aplica en el borde de salida hacia el servidor, no
> en la interfaz: sin autorización de la familia, la identidad no viaja, y
> **ninguna ruta de la aplicación puede saltarse esa validación**.

Para los cuatro campos nominales es exacto. **Para las fotografías es falso.**

**Evidencia**

- `frontend/src/app/features/formulario/paso-cierre.component.ts:31` — el único
  control es un condicional de plantilla que oculta los botones de cámara.
- `frontend/src/app/core/infra/supabase-sync.adapter.ts` — `enviarFoto()` sube
  cualquier fotografía en cola sin consultar el consentimiento del caso.
- `frontend/src/app/core/infra/dexie-foto-storage.service.ts` — tampoco lo evalúa
  al guardar.

**Escenario que lo dispara, sin mala intención.** El voluntario marca la
autorización, avanza al paso 4, toma las dos fotografías, vuelve al paso 1 porque
la familia se retracta y desmarca la casilla. Las fotografías siguen en el
dispositivo y se suben en la siguiente sincronización.

**Consecuencia.** Además del incumplimiento, contradice el principio que el propio
`SEGURIDAD.md` declara: *"El cliente no es la seguridad. Las guardas de ruta y los
botones ocultos son comodidad de navegación."*

**Corrección propuesta.** Evaluar el consentimiento del caso dentro de
`enviarFoto()` y al persistir la fotografía, y descartar las huérfanas al
desmarcar la autorización.

---

## H9 · Alto · La regla de consentimiento no existe en la base — CORREGIDO

`supabase/schema.sql:122` comenta *"bloque 2: hogar. Identidad solo si
consentimiento = true"*, pero **ninguna restricción lo impone**. La regla vive
únicamente en una función del cliente.

**Consecuencia.** Cualquier ruta que no sea esa función puede escribir identidad
sin autorización: la carga desde Kobo, un adaptador futuro, un script de la mesa,
o cualquier cliente con sesión válida. Es exactamente el patrón que
`SEGURIDAD.md` corrige en sus seis hallazgos: *"Ninguna ruta alterna."*

**Corrección propuesta**

```sql
alter table familias add constraint identidad_exige_consentimiento
  check (consentimiento
         or (jefe_nombres is null and jefe_apellidos is null
             and num_doc is null and tipo_doc is null));
```

Conviene aplicarla **antes** de que haya datos: después es una migración con filas
adentro. Si se resuelve H7 incluyendo el teléfono, entra en la misma restricción.

**Aplicado en la HU 1.5.2**, con la tabla todavía vacía, y comparando además contra
cadena vacía: un cliente que "limpia" escribiendo `''` cumpliría la letra y no la
regla. La restricción viajó a RDS con la migración `003-schema.sql`.

---

## H10 · Grave · La cola se queda muda cuando la sesión vence

Es el hallazgo con mayor impacto en campo y no tiene componente jurídico: es un
defecto.

**Evidencia**

- `frontend/src/app/core/services/sesion.service.ts:99` — existe
  `puedeSincronizar()`, documentado como *"Lo usa la cola de sincronizacion"*.
  **Nunca se invoca.**
- `frontend/src/app/core/services/sincronizacion.service.ts:62` — hay una
  propiedad homónima que solo comprueba conexión y pendientes, sin mirar la
  sesión. La colisión de nombres es lo que hace que el hueco pase desapercibido.
- `frontend/src/app/core/infra/supabase-sync.adapter.ts:217` — un error con código
  de PostgreSQL se clasifica como no reintentable. El rechazo por política de
  acceso trae código, así que se trata como dato inválido en lugar de como falta
  de sesión.
- `frontend/src/app/core/infra/dexie-caso-storage.service.ts:19` — a los 8
  intentos el caso sale de la cola de envío…
- …pero `contarPendientes()` lo sigue contando.

**Secuencia.** Sesión vencida → cada caso falla con código → no se detiene la
pasada → recorre todo el pendiente marcando error → el voluntario vuelve a pulsar
Sincronizar varias veces, que es lo que haría cualquiera → a la octava, los casos
salen del envío. El botón sigue diciendo "12 pendientes" y no manda nada, sin
explicación.

**Consecuencia.** Es precisamente el escenario que la decisión *"iniciar sesión
exige conexión, capturar no"* buscaba proteger, y el resultado es el que esa
decisión quería evitar: la jornada de trabajo se queda en el teléfono.

**Corrección propuesta.** La taxonomía de error del
[ADR 003](adr/003-contrato-de-sincronizacion.md) §4: verificar la sesión antes de
la pasada, tratar 401/403 como clase *sesión* —detiene y no consume intentos—, y
que el contador distingue "pendiente" de "agotó reintentos".

---

## H11 · Grave · Lo que se guarda en el dispositivo es desalojable

Toda la promesa offline descansa sobre la base local, y **nadie solicita cuota
persistente**. No hay una sola llamada a la API de almacenamiento persistente en
`frontend/src`.

**Consecuencia.** En un Android de gama baja con la memoria llena —que es el
teléfono descrito en F6— el sistema puede borrar la base local para liberar
espacio. Los casos capturados y no sincronizados desaparecen sin aviso.

**Corrección propuesta.** Solicitar cuota persistente al arrancar y vigilar el
espacio disponible para avisar antes de que falle una captura. Es la corrección
más barata de esta lista y protege lo más difícil de recuperar: el trabajo de un
voluntario que caminó hasta una vereda.

---

## H12 · Medio · "Toda vista pública es agregada" no es exacto

README, ESTADO.md y FRENTES.md afirman que toda vista pública es agregada.
`v_estadisticas` y `v_estado_gestion` lo son. **`v_mapa_publico` no**: es una fila
por familia con código, vereda o barrio, total de personas, menores, adultos
mayores, prioridad, afectación y coordenada a ~110 m (`supabase/schema.sql:368`,
con `grant select` a `anon`).

**Consecuencia.** En una vereda con pocos hogares, "5 personas, 2 menores, daño
severo, a 110 metros de aquí" puede identificar a una familia. La coordenada está
degradada, pero el registro sigue siendo individual y el `codigo` es un
identificador estable que permite cruzar con cualquier otra fuente.

**Nota.** `tablero/datos.geojson` está versionado, se describe a sí mismo como
"Vista publica agregada" y contiene una fila de hogar cuyas coordenadas coinciden
con las de la prueba de campo registrada en ESTADO.md §3. Conviene confirmar que
es dato inventado.

**Salidas posibles.** Umbral de anonimato por vereda (no publicar lugares con
menos de N hogares), retirar el código y el desglose por edades de la vista
pública, o agregar por vereda en lugar de por hogar. Es decisión de F7.

---

## H13 · Medio · No hay pruebas automáticas

Cero archivos de prueba en `frontend/src`. `npm test` está configurado y no hay
nada que ejecutar.

**Consecuencia.** La función que decide qué identidad viaja al servidor —de la que
depende toda la promesa de protección de datos— no tiene red de regresión. Las
seis verificaciones de `SEGURIDAD.md` dependen de que alguien se acuerde de
correrlas a mano.

**Avance en esta propuesta.** [`entorno/pruebas/seguridad.sql`](../entorno/pruebas/seguridad.sql)
convierte esas seis verificaciones en suite ejecutable contra el mismo esquema que
va al servidor. Queda pendiente la parte del cliente: la regla de consentimiento y
el comportamiento de la cola.

---

## H15 · Grave · La API no podía leer perfiles ni escribir en auth.users — CORREGIDO

Apareció al desplegar, no antes, y esa es la parte que conviene entender: el entorno
local nunca lo ejercitó porque nadie había iniciado sesión contra la base.

La API se conecta como `raiz_api` y por cada petición hace `SET LOCAL ROLE
authenticated`. Pero dos operaciones ocurren **antes** de que exista sesión que poner,
y corren con el rol crudo (`pool.ts`, `sinIdentidad`):

**Leer el perfil de quien acaba de autenticarse.** La política `perfil_lee` exige
`id = auth.uid()`, y `auth.uid()` es `NULL` mientras `app.user_id` no esté puesto. RLS
no daba error: devolvía **cero filas**. El voluntario veía «su cuenta existe pero
todavía no tiene perfil asignado» —un mensaje correcto para un problema que no era el
suyo— y **ningún inicio de sesión podía completarse**.

**Escribir en `auth.users` al dar de alta.** `raiz_api` no tenía ningún permiso sobre
esa tabla: `60-grants.sql` concede sobre el esquema `public` y `auth.users` vive en
`auth`. La cuenta se creaba en Cognito y el reflejo fallaba.

Corregido en [`entorno/postgres/65-acceso-api.sql`](../entorno/postgres/65-acceso-api.sql),
que corre en la nube y en el entorno local.

**El detalle que costó encontrar:** hizo falta conceder `select` además de `insert`
sobre `auth.users`. Lo exige `on conflict (id) do nothing`. Con `insert` a secas,
PostgreSQL responde `permission denied for table users` a la sentencia completa
mientras `has_table_privilege(...,'insert')` sigue devolviendo verdadero. Se comprobó
que el mismo INSERT sin la cláusula entra sin problema.

---

## H16 · Medio · El alta de voluntarios no es idempotente, aunque su documentación lo afirme — CORREGIDO

`registrar-voluntario.service.ts` dice, sobre el fallo a mitad de camino:

> Repetir el alta lo arregla, porque las dos escrituras son idempotentes.

**No es cierto.** Comprobado contra el despliegue: si Cognito crea la cuenta y la
escritura en `auth.users` falla, repetir el alta no la repara. La primera escritura es
la que rechaza — Cognito responde que el correo ya existe y la API devuelve `422 · Ya
hay un voluntario con ese correo`, sin llegar nunca a reintentar la segunda.

El resultado es una cuenta que puede autenticarse y no puede entrar, y que solo se
arregla borrándola del proveedor y empezando de nuevo. Es exactamente el estado que el
propio comentario decía que no iba a quedar.

Es de código, no de esquema, y hay dos salidas: que el alta tolere el «ya existe» de
Cognito y siga hasta la segunda escritura, o que el mensaje de error diga qué hacer en
vez de prometer que repetir alcanza. La primera es la que resuelve el problema.

**Corregido con la primera.** El adaptador de Cognito ya no se rinde: consulta la cuenta
existente y devuelve su identificador. Quien decide qué significa eso es el servicio,
que es el único que sabe si la persona tiene perfil — con perfil es un duplicado y se
rechaza; sin perfil es el alta rota y se completa.

**La parte delicada fue la clave.** Reponerla siempre habría convertido «dar de alta» en
«restablecer la clave de quien sea» sin decirlo: el custodio que da de alta por descuido
a alguien que ya existe le cambiaría la clave, y esa persona no podría entrar al día
siguiente sin saber por qué. Se distingue por el estado que escribe el propio Cognito:
`FORCE_CHANGE_PASSWORD` significa que la clave nunca llegó a fijarse y hay que
terminarla; `CONFIRMED` significa que la cuenta está completa y su clave es de su dueño.

Verificado contra el despliegue provocando un alta a medias a propósito: repetirla
devuelve 201 y la cuenta entra; repetirla otra vez devuelve 422; y la clave del intento
duplicado **no** se aplicó.

---

## H17 · Grave · CORS no permitía DELETE: cerrar sesión no habría funcionado — CORREGIDO

`main.ts` declaraba `methods: ['GET', 'POST']`, pero `sesion.controller.ts` expone
`DELETE /sesion`. Un navegador consulta antes de mandar una petición así, y esa
consulta previa habría respondido `access-control-allow-methods: GET,POST`: el
navegador cancela la petición y **cerrar sesión desde la PWA falla**.

**Por qué no se había visto.** Todas las pruebas de las rutas se hicieron con `curl`,
que no aplica CORS — es una regla que impone el navegador, no el servidor. `DELETE
/sesion` respondía 204 en cada prueba y seguiría respondiendo 204 para siempre, sin
que ningún voluntario pudiera usarla.

Apareció al consultar las cabeceras contra el despliegue con un origen real. La lista
sigue sin `PUT` ni `PATCH`: ninguna ruta los usa.

---

## Desajustes menores

No cambian ninguna decisión; se anotan para que quien llegue no se confunda.

| Dónde | Decía | Es | Estado |
|---|---|---|---|
| ESTADO.md §3 | 11 tablas | 13 tablas, 7 vistas, 19 políticas | Corregido, HU 1.6.2 |
| FRENTES.md / ROLES-Y-ESFUERZO.md | ocho frentes / lista nueve | F9 no está en FRENTES.md | Pendiente |
| ROLES-Y-ESFUERZO.md | F9 pendiente | El despliegue del frontend ya está configurado; falta integración continua | Pendiente |
| ESTADO.md §3 | XLSForm de 125 preguntas | 125 filas de la hoja; ~97 preguntas reales, el resto son grupos, notas y calculados | Corregido, HU 1.6.2 |
| `tablero/datos.geojson` | código `SV-2026-000001` | El esquema genera `RZ-AAAA-NNNNNN` | Corregido, HU 1.6.2 |
| Configuración de despliegue | endurecimiento de cabeceras | Sin política de seguridad de contenido | Corregido, HU 1.6.2 |
| ESTADO.md §2 y ADR 002 | la sincronización nunca es automática | El caso viaja solo al reconectar; la fotografía espera el botón | Corregido, HU 1.6.2 |
| `tablero/datos.geojson` | vista pública agregada, con dato de muestra | Era una fila por familia y el dato era **real**: coordenada y vereda de un caso llegado por WhatsApp | Corregido: dato inventado y nota rehecha |

---

## Orden sugerido

| Cuándo | Qué | Por qué |
|---|---|---|
| Hecho | H14 | Sin esto el esquema no existía |
| Ya | H11 y H10 | Defectos operativos puros, sin decisión de por medio. Protegen el trabajo del voluntario |
| Hecho | H9 | Se aplicó con la tabla vacía, HU 1.5.2 |
| F7 decide | H7, H8, H12 | Tienen consecuencia jurídica y de operación; no son llamadas de quien programa |
| Continuo | H13 | Empieza con las pruebas de acceso ya incluidas |
| Hecho | H15 | Sin esto no había inicio de sesión posible contra la nube |
| Hecho | H17 | Cerrar sesión desde la PWA no habría funcionado nunca |
| Hecho | H16 | Un alta interrumpida ya se repara repitiendola |

---

Documento de revisión técnica. No contiene datos personales.
