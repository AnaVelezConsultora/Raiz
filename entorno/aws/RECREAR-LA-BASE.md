# Recrear la base de produccion

**Escrito el 21 de agosto de 2026. Se hace UNA vez, y despues este archivo sobra.**

## Por que hay que hacerlo, y por que no se puede desplegar sin hacerlo

El esquema paso de dieciseis archivos SQL a uno solo, y en el camino se retiraron once
columnas que solo existian por compatibilidad. Como nada de lo capturado era todavia
real, era el momento mas barato de hacerlo.

La consecuencia es que **la base que hoy corre en produccion y la API nueva ya no se
entienden**, y no de una forma que se note al desplegar:

```
produccion:   viviendas.habitable  boolean NOT NULL      (sin valor por defecto)
API nueva:    no escribe esa columna
```

El despliegue terminaria bien. `/salud` responderia 200. Y el **primer caso con vivienda
que llegue de un telefono fallaria**, porque PostgreSQL rechaza el INSERT. En terreno eso
se ve como un caso que no sincroniza nunca, sin que nadie sepa por que.

Y el aplicador de migraciones NO lo arregla solo: en produccion ya estan registradas
`001` a `005` como aplicadas, asi que las salta todas y la base se queda como esta, para
siempre.

## Lo que cuesta, dicho antes y no despues

**Todo el mundo pierde el acceso.** Las cuentas siguen existiendo en Cognito, pero sus
perfiles viven en la base y se van con ella. Quien intente entrar vera:

> Su cuenta existe pero todavia no tiene perfil asignado.

Hay que volver a crear al custodio con el guion, y desde la aplicacion, al resto del
equipo. Con pocas cuentas son veinte minutos; conviene avisarle a la gente antes y no
mientras.

## Los pasos

Todo esto se corre con un perfil que apunte a la cuenta de Raiz. Los guiones lo
comprueban y se detienen si no es asi, pero conviene mirarlo primero:

```sh
aws sts get-caller-identity --profile raiz    # debe decir 303638556798
```

### 1. Que nadie escriba mientras tanto

```sh
aws ecs update-service --cluster raiz --service raiz-api --desired-count 0 --profile raiz
aws ecs wait services-stable --cluster raiz --services raiz-api --profile raiz
```

La aplicacion en los telefonos sigue capturando: eso no depende del servidor. Lo que se
detiene es el envio, y la cola reintenta despues sola.

### 2. Abrir el tunel y borrar el esquema

```sh
cd entorno/aws
AWS_PROFILE=raiz ./tunel-a-la-base.sh          # deja la base en localhost:5433
```

En otra terminal, con la clave de administrador que vive en el secreto
`raiz/base-admin`:

```sh
psql -h localhost -p 5433 -U raiz_admin -d raiz
```

```sql
-- Se van los dos esquemas: `public` lleva las tablas y tambien la tabla que registra
-- que migraciones se aplicaron —que es justo lo que hay que olvidar—, y `auth` es el
-- espejo local de Cognito, que el shim vuelve a crear.
drop schema if exists public cascade;
drop schema if exists auth   cascade;
create schema public;
```

### 3. Aplicar el esquema nuevo

Se dispara el despliegue desde GitHub Actions —o `Run workflow` a mano— y el aplicador
encuentra la base vacia, no ve ninguna migracion registrada y corre las cinco desde
cero. Los registros del paso quedan en el log de la tarea; si algo falla ahi, el flujo se
detiene y **no** despliega la version nueva, que es el comportamiento correcto.

### 4. Volver a levantar la API

```sh
aws ecs update-service --cluster raiz --service raiz-api --desired-count 1 --profile raiz
aws ecs wait services-stable --cluster raiz --services raiz-api --profile raiz
curl -s https://api.apoyo-colombia.com/salud
```

### 5. Volver a crear al custodio

```sh
cd entorno/aws
AWS_PROFILE=raiz ./crear-custodio.sh
```

El guion reutiliza la cuenta de Cognito si ya existe. Desde ahi, el custodio da de alta
a los coordinadores desde la propia aplicacion, y cada coordinador arma su equipo.

## Como saber que quedo bien

```sql
-- Las columnas muertas ya no estan:
select count(*) from information_schema.columns
 where table_schema = 'public'
   and column_name in ('habitable', 'riesgo_colapso', 'medicamento_cual',
                       'aplica_convenio', 'sensibles_segregados_en');
-- debe dar 0

-- Y las nuevas si:
select count(*) from information_schema.columns
 where table_schema = 'public'
   and column_name in ('habitabilidad', 'riesgo_visible', 'prioridad_motivos');
-- debe dar 3
```

Y la prueba que de verdad importa: registrar un caso desde la aplicacion, con vivienda,
y ver que llega. Es lo que fallaba.

## Y de aqui en adelante

**Esto no se repite.** El dia que haya un dato que no se pueda perder —y ese dia es
cualquiera a partir de la primera jornada real— cada cambio de estructura vuelve a ser
una migracion numerada: la proxima es la `006`, se agrega a la lista de
`entorno/aws/migraciones/aplicar.sh`, y el esquema deja de colapsarse nunca mas.
