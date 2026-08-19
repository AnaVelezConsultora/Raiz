# Entorno local

Emula la forma que tendrá AWS, para que nadie tenga que imaginársela.

Existe para servir al flujo operativo descrito en [ESTADO.md](../docs/ESTADO.md) y
[FRENTES.md](../docs/FRENTES.md), no al revés: el líder captura en la vereda sin
señal, baja al pueblo, sincroniza, y el caso llega a la base para ser remitido con
radicado y seguido hasta que alguien responda. Todo lo que hay aquí está al
servicio de que ese ciclo funcione y se pueda probar.

---

## Lo primero: no hace falta para trabajar

```bash
cd frontend && npm install && npm start
```

La PWA arranca **sin nada de esto** y seguirá arrancando. Captura, guarda en el
dispositivo y lista casos, en modo local. Quien trabaje el formulario, el listado,
el tablero o el mapa —F1, F4, F6— no necesita levantar un solo contenedor.

Eso no es una comodidad, es un requisito de arquitectura: el equipo aporta dos a
cuatro horas por semana y **el ciclo de desarrollo no puede depender de que haya
infraestructura levantada**. Si algún día deja de ser cierto, se rompió la
propiedad que hace viable el proyecto.

Este entorno es para quien trabaje contra la base o el servidor: F3, F5 y F7.

---

## Niveles

| Nivel | Qué levanta | Para quién |
|---|---|---|
| 0 | nada, `npm start` | F1, F4, F6 y cualquiera que llegue |
| 1 | `db` | F3, F5, F7: esquema, políticas, consultas |
| 2 | `db` + `aws` + `cognito` | quien toque subida de fotos o autenticación |
| 3 | preproducción real en AWS | IAM, políticas de bucket, Cognito de verdad |

Nadie levanta más de lo que su frente necesita.

---

## Arrancar

```bash
cd entorno
make arriba      # o: docker compose up -d
make pruebas     # verificaciones de control de acceso
```

Requiere Docker. La primera vez baja las imágenes y tarda un par de minutos.

Usuarios de prueba, todos con contraseña `Raiz.local.2026`:

| Correo | Rol | Para qué |
|---|---|---|
| `ana@ejemplo.test` | líder | sujeto A de la prueba de aislamiento |
| `beto@ejemplo.test` | líder | sujeto B: no debe ver los casos de Ana |
| `coordinadora@ejemplo.test` | coordinador | ve todo |
| `custodia@ejemplo.test` | custodio | único que lee auditoría y exporta nominal |
| `digitador@ejemplo.test` | digitador | carga pero no exporta |

**Los datos son inventados.** Regla de [ESTADO.md](../docs/ESTADO.md) §6: para
desarrollar y probar se usan datos inventados, nunca datos reales. Las semillas
llevan la palabra "prueba" o "ficticia" en el nombre justamente para que nadie
confunda una cosa con la otra.

---

## Qué emula qué

| Aquí | En AWS | Nota |
|---|---|---|
| `db` — PostgreSQL 16 + PostGIS | RDS PostgreSQL | **no se emula, es el mismo motor** |
| `aws` — LocalStack | S3 | solo S3 habilitado |
| `cognito` — cognito-local | Cognito User Pool | LocalStack solo trae Cognito en el plan pago |
| `bootstrap` — CLI de AWS | Terraform | los comandos son los mismos |
| `siembra` — psql | `POST /voluntarios` de la API | mismo camino: Cognito asigna el `sub`, la base lo recibe |

### El esquema no se bifurca

`docker-compose.yml` monta **`../supabase/schema.sql` sin modificarlo**. El mismo
archivo que corre aquí es el que va a RDS.

Lo único que traduce entre proveedores es
[`postgres/00-shim-auth.sql`](postgres/00-shim-auth.sql): crea el esquema `auth`
que Supabase daba hecho y AWS no. Con eso, las 12 tablas, las 5 vistas, todas las
políticas RLS y los seis hallazgos de [SEGURIDAD.md](../supabase/SEGURIDAD.md)
sobreviven al cambio de proveedor **sin reescribirse**.

La identidad llega por transacción:

```sql
BEGIN;
  SELECT set_config('app.user_id', '<sub del JWT>', true);
  SET LOCAL ROLE authenticated;
  -- las políticas corren igual que en Supabase
COMMIT;
```

El `true` de `set_config` la hace local a la transacción: una conexión reutilizada
del pool no arrastra la identidad del usuario anterior. Es lo que impide que el
voluntario A lea los casos del voluntario B por reúso de conexión.

### El rol vive en la base, no en el token

`perfiles.rol` es la autoridad, y `mi_rol()` lo lee de ahí. Cognito no guarda
roles. Es deliberado: el custodio asciende o degrada a alguien y surte efecto en
la consulta siguiente, sin tocar el proveedor de identidad y sin esperar a que
caduque un token.

---

## Las pruebas de control de acceso

`make pruebas` ejecuta [`pruebas/seguridad.sql`](pruebas/seguridad.sql), que
convierte en suite ejecutable la lista de verificación que
[SEGURIDAD.md](../supabase/SEGURIDAD.md) dejaba para "quien tome F3":

```
P0   ninguna tabla del esquema público sin RLS          (H6)
P1   las vistas con identidad llevan security_invoker   (H1)
P2   ningún líder ve los casos de otro                  (H4)
P3   el anónimo no alcanza familias, vista ni auditoría (H2)
P3c  la vista pública, sin identidad y con coordenada degradada
P4   no se puede firmar un registro a nombre de otro    (H3)
P5   un líder no puede cambiarse el rol                 (H5)
P6   la auditoría no es puerta trasera                  (H2)
```

Falla al primer error y devuelve código distinto de cero, así que sirve como
compuerta de merge en la pipeline.

Dos detalles que valen la pena:

- **P5 no espera una excepción.** Cuando la política filtra un `UPDATE`, la
  sentencia no falla: afecta cero filas en silencio. Una prueba escrita al revés
  pasaría estando el sistema roto, así que verifica el rol después.
- **P0 y P1 no dependen de que haya datos.** Detectan la regresión aunque la base
  esté vacía, que es cuando más fácil se cuela.

### Evidencia

Ejecutado el 13 de agosto de 2026 sobre esta configuración, de cero:

```
==> Cognito: usuarios de prueba
    ana@ejemplo.test -> b7d1453a-eef9-43ab-806f-903717146cb3
    beto@ejemplo.test -> 8694c1c4-bfed-4b7f-889d-1b64bec70dc0
    ...
==> reflejando los usuarios de Cognito en auth.users
==> perfiles y casos de prueba
    5 perfiles creados por el disparador, 2 casos sembrados

OK  P0   todas las tablas del esquema publico tienen RLS activo
OK  P1   las vistas con identidad llevan security_invoker
OK  P2a  Ana ve su caso y solo el suyo, en tabla y en vista
OK  P2b  Beto ve su caso y solo el suyo
OK  P3a  el anonimo no alcanza familias, ni la vista con identidad, ni auditoria
OK  P3b  v_mapa_publico responde al anonimo (2 filas)
OK  P3c  v_mapa_publico sin identidad y con coordenada degradada a ~110 m
OK  P4   no se puede firmar un registro a nombre de otro
OK  P5   un lider no puede cambiarse el rol
OK  P6a  un lider no lee ni escribe auditoria
OK  P6b  la custodia si lee auditoria (2 filas)

codigo de salida: 0
```

Estado final de la base: **12 tablas, 5 vistas, 19 políticas, PostGIS 3.4**, y el
disparador `tr_crear_perfil` funcionando sin modificaciones sobre PostgreSQL puro.

La suite se verificó **en negativo**: recreando `v_familias_tablero` sin
`security_invoker` dentro de una transacción, P1 falla como debe. No pasa en
vacío.

Levantar esto reveló además que `schema.sql` **no se podía crear**: fallaba en la
tabla `remisiones` y abortaba el resto del archivo. Ver
[hallazgos-revision.md](../docs/hallazgos-revision.md) §H14. Es el argumento más
concreto a favor de que este entorno exista.

### Lo que estas pruebas NO cubren

El punto 6 de SEGURIDAD.md: **las políticas del bucket de fotografías**. Es un
sistema aparte y LocalStack no aplica IAM con el rigor de AWS. Que algo funcione
aquí no significa que esté bien allá. Esa verificación es de preproducción,
siempre. En palabras del propio documento, es "el que más se olvida".

---

## Comandos

```bash
make arriba     # levanta todo y siembra
make pruebas    # verificaciones de acceso
make psql       # consola contra la base
make estado     # qué está corriendo
make logs       # seguir registros
make abajo      # apagar conservando datos
make limpio     # apagar y BORRAR datos
```

**Si cambia `schema.sql`, `55-fotos-subida.sql`, el shim o las semillas, hace falta
`make limpio`.** Los scripts de inicialización de PostgreSQL solo corren con el volumen
vacío; sin borrarlo, los cambios no se aplican y se depura un fantasma.

**`make pruebas` va sobre una base recién sembrada.** Varias de sus comprobaciones
cuentan filas —«Ana ve exactamente un caso»—, así que si antes se corrió el ciclo de la
API, que registra casos de prueba, falla por datos y no por un defecto. El orden que no
engaña es `make limpio && make arriba && make pruebas`, y el ciclo de la API después.

---

## Puertos

| Servicio | Puerto |
|---|---|
| PostgreSQL | 5432 |
| S3 (LocalStack) | 4566 |
| Cognito | 9229 |
| PWA (`npm start`) | 4200 |
| API | 3000 |

La API y la PWA corren en la máquina, no en Docker: así el ciclo de edición y
recarga es inmediato y el depurador del editor funciona sin configuración.
