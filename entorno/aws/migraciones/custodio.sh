#!/bin/sh
# =============================================================================
# Siembra el PRIMER custodio. Corre DENTRO de la VPC, como tarea efimera.
#
# Lo lanza entorno/aws/crear-custodio.sh; no se corre a mano.
#
# -----------------------------------------------------------------------------
# POR QUE HACE FALTA ESTO Y NO ES UNA PUERTA TRASERA
# -----------------------------------------------------------------------------
#
# `POST /voluntarios` exige que quien pide sea custodio o coordinador
# (registrar-voluntario.service.ts). Es la decision de no tener registro abierto,
# y esta bien: lo que se escribe con esas cuentas es el padron de familias
# damnificadas.
#
# Pero deja un problema que solo aparece la primera vez: no hay custodio que pueda
# dar de alta al primer custodio. La API no puede resolverlo sin abrir justo la
# puerta que decidio no abrir.
#
# Asi que se resuelve FUERA de la API, una sola vez, con acceso de administrador a
# la base, desde dentro de la VPC y dejando rastro. No es un atajo alrededor de la
# regla: es el unico eslabon que la regla no puede fabricar sola.
#
# Es idempotente y NO degrada a nadie: si el perfil ya es custodio o coordinador,
# lo deja como esta. Volver a correrlo por error no puede quitarle el rol a nadie.
#
# Variables que espera —las inyecta la definicion de tarea:
#   RAIZ_BASE_*, ADMIN_USUARIO, ADMIN_CLAVE   igual que aplicar.sh
#   CUSTODIO_SUB       el `sub` que Cognito asigno
#   CUSTODIO_CORREO    su correo
#   CUSTODIO_NOMBRE    su nombre
# =============================================================================
set -e

export PGHOST="$RAIZ_BASE_ANFITRION"
export PGPORT="${RAIZ_BASE_PUERTO:-5432}"
export PGDATABASE="$RAIZ_BASE_NOMBRE"
export PGUSER="$ADMIN_USUARIO"
export PGPASSWORD="$ADMIN_CLAVE"
export PGSSLMODE=require

psql_() { psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc "$@"; }

for v in CUSTODIO_SUB CUSTODIO_CORREO CUSTODIO_NOMBRE; do
  eval "valor=\$$v"
  if [ -z "$valor" ]; then
    echo "ERROR: falta $v" >&2
    exit 1
  fi
done

echo "==> sembrando custodio $CUSTODIO_CORREO"

# Una sola transaccion. La insercion en auth.users dispara tr_crear_perfil, que
# crea el perfil con rol 'lider'; el ascenso a custodio va inmediatamente despues.
# Si se hicieran por separado y fallara la segunda, quedaria un custodio que en
# realidad es lider y nadie lo sabria hasta que intentara dar de alta a alguien.
psql_ --single-transaction \
  -v sub="$CUSTODIO_SUB" \
  -v correo="$CUSTODIO_CORREO" \
  -v nombre="$CUSTODIO_NOMBRE" <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values (:'sub', :'correo', jsonb_build_object('nombre', :'nombre'))
on conflict (id) do nothing;

-- No se degrada a nadie. Si esta fila ya era custodio o coordinador, se queda
-- como esta: correr esto dos veces no puede quitarle el rol a quien lo tiene.
update perfiles
   set rol = 'custodio'
 where id = :'sub'
   and rol not in ('custodio', 'coordinador');
SQL

echo ""
echo "==> estado"
psql_ -c "
  select u.email, p.nombre, p.rol, p.activo
  from perfiles p join auth.users u on u.id = p.id
  where p.id = '$CUSTODIO_SUB';"

echo ""
echo "==> custodio sembrado"
