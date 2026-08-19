#!/bin/sh
# =============================================================================
# Aplica el esquema de Raiz. Corre DENTRO de la VPC, como tarea efimera.
#
# Variables que espera —las inyecta la definicion de tarea, ninguna se escribe
# aqui ni viaja en la imagen:
#
#   RAIZ_BASE_ANFITRION   nombre de la instancia de RDS
#   RAIZ_BASE_PUERTO      5432
#   RAIZ_BASE_NOMBRE      raiz
#   ADMIN_USUARIO         raiz_admin        (del secreto raiz/base-admin)
#   ADMIN_CLAVE           clave             (del secreto raiz/base-admin)
#   API_URL               DATABASE_URL      (del secreto raiz/base-api)
#
# -----------------------------------------------------------------------------
# UNA SOLA VEZ, Y COMO SE SABE
# -----------------------------------------------------------------------------
#
# La HU 1.1.3 pide migraciones "aplicadas una sola vez y antes de que la version
# nueva reciba trafico". Lo primero se resuelve con una tabla de registro; lo
# segundo, con que esta tarea corra y termine antes de crear el servicio.
#
# El registro no es decoracion: supabase/schema.sql NO es idempotente —crea
# tablas y secuencias sin `if not exists`— asi que aplicarlo dos veces falla a
# media carga y deja la base en un estado que hay que mirar a mano. La tabla es
# lo que hace que volver a correr esta tarea sea seguro y aburrido.
#
# Cada archivo va dentro de su propia transaccion con ON_ERROR_STOP: o entra
# entero o no entra nada. PostgreSQL admite DDL transaccional, que es justo lo
# que hace esto posible y lo que no se podria hacer con otros motores.
# =============================================================================
set -e

export PGHOST="$RAIZ_BASE_ANFITRION"
export PGPORT="${RAIZ_BASE_PUERTO:-5432}"
export PGDATABASE="$RAIZ_BASE_NOMBRE"
export PGUSER="$ADMIN_USUARIO"
export PGPASSWORD="$ADMIN_CLAVE"

# RDS cifra en transito y rechaza conexiones en claro. `require` cifra sin
# validar la autoridad; el certificado de RDS lo firma Amazon y ese paquete no
# esta en esta imagen. Es la misma salvedad anotada en desplegar-base.sh.
export PGSSLMODE=require

psql_() { psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc "$@"; }

echo "==> base: $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"

# Reintento corto. La tarea puede arrancar mientras RDS todavia esta terminando
# de aceptar conexiones, y morir por eso obligaria a mirar registros para
# descubrir que no pasaba nada malo.
intento=1
until pg_isready --quiet 2>/dev/null; do
  if [ "$intento" -ge 30 ]; then
    echo "ERROR: la base no acepta conexiones despues de 30 intentos" >&2
    exit 1
  fi
  echo "    esperando a la base... ($intento)"
  intento=$((intento + 1))
  sleep 2
done

# -----------------------------------------------------------------------------
# 1. El registro de migraciones
# -----------------------------------------------------------------------------
echo ""
echo "==> registro de migraciones"
psql_ -c "
  create table if not exists public.migraciones_aplicadas (
    archivo     text primary key,
    aplicada_en timestamptz not null default now()
  );"
echo "    listo"

# -----------------------------------------------------------------------------
# 2. Las migraciones, en orden
# -----------------------------------------------------------------------------
echo ""
echo "==> migraciones"
# El numero es el ORDEN de aplicacion y tambien la clave con la que queda
# registrado. Los archivos del entorno local llevan otra numeracion —alli todo se
# carga de una vez sobre una base vacia— y aqui van en el orden en que llegaron a
# una base que ya existia. El contenido es el mismo archivo, sin copia.
for archivo in 001-shim-auth.sql 002-roles.sql 003-schema.sql 004-grants.sql 005-acceso-api.sql \
               006-fotos-subida.sql 007-perfiles-alta.sql 008-campos-de-terreno.sql 009-autorizaciones.sql; do
  YA="$(psql_ --tuples-only --no-align \
    -c "select 1 from public.migraciones_aplicadas where archivo = '$archivo';")"

  if [ "$YA" = "1" ]; then
    echo "    ya aplicada: $archivo"
    continue
  fi

  echo "    aplicando:   $archivo"
  # --single-transaction es lo que hace que un fallo a mitad no deje media
  # migracion adentro. El registro se inserta en la MISMA transaccion: si el
  # archivo falla, tampoco queda anotado como aplicado.
  psql_ --single-transaction \
    -f "/migraciones/$archivo" \
    -c "insert into public.migraciones_aplicadas (archivo) values ('$archivo');"
  echo "    aplicada:    $archivo"
done

# -----------------------------------------------------------------------------
# 3. La clave de la API
# -----------------------------------------------------------------------------
# 002-roles.sql crea raiz_api con la clave del entorno local, que esta escrita en
# el repositorio y por lo tanto no es una clave. Aqui se reemplaza por la que vive
# en Secrets Manager.
#
# Se hace en CADA corrida y no solo la primera: es lo que permite rotar la clave
# cambiando el secreto y volviendo a desplegar, sin tocar la base a mano.
#
# La clave se extrae de la URL con sed y se pasa por variable de psql en vez de
# interpolarla en el SQL, para que no termine en el registro de sentencias.
echo ""
echo "==> clave de la API"
CLAVE_API="$(printf '%s' "$API_URL" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*|\1|p')"
if [ -z "$CLAVE_API" ]; then
  echo "ERROR: no se pudo leer la clave de API_URL" >&2
  exit 1
fi

# La sentencia entra por la ENTRADA ESTANDAR y no por -c. psql solo interpola
# variables en archivos y en lo que le llega por stdin; en el argumento de -c las
# deja tal cual y PostgreSQL se encuentra con un `:'clave'` literal. El delimitador
# va entre comillas para que el shell no toque nada: quien sustituye es psql.
psql_ -v clave="$CLAVE_API" >/dev/null <<'SQL'
alter role raiz_api with login password :'clave';
SQL
echo "    puesta la del secreto raiz/base-api"

# -----------------------------------------------------------------------------
# 4. Catalogos
# -----------------------------------------------------------------------------
# No son migracion. Se reconcilian siempre; el archivo es idempotente.
echo ""
echo "==> catalogos"
psql_ --single-transaction -f /migraciones/catalogos.sql
echo "    reconciliados"

# -----------------------------------------------------------------------------
# 5. Que quedo
# -----------------------------------------------------------------------------
echo ""
echo "==> estado"
psql_ -c "
  select count(*) filter (where table_type = 'BASE TABLE') as tablas,
         count(*) filter (where table_type = 'VIEW')       as vistas
  from information_schema.tables
  where table_schema = 'public';"

psql_ -c "select count(*) as politicas from pg_policies where schemaname = 'public';"
psql_ -c "select archivo, aplicada_en from public.migraciones_aplicadas order by archivo;"

echo ""
echo "==> migraciones completas"
