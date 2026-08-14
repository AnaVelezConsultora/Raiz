#!/bin/sh
# =============================================================================
# SIEMBRA
#
# Este script hace, en miniatura, lo que en AWS hara el Lambda de
# Post-Confirmation de Cognito:
#
#   Cognito crea el usuario
#     -> se inserta en auth.users con el `sub` que Cognito asigno
#        -> el disparador tr_crear_perfil (schema.sql, 10.b) crea el perfil
#           con el rol MENOS privilegiado
#
# Despues ajusta los roles de prueba y siembra dos casos, uno por lider.
#
# Solo entorno local. En produccion nadie siembra nada: los datos entran por
# donde deben entrar, que es la captura del voluntario en la vereda.
# =============================================================================
set -e

echo "==> esperando a la base"
until pg_isready -h db -U postgres -d raiz >/dev/null 2>&1; do sleep 1; done

echo "==> reflejando los usuarios de Cognito en auth.users"
psql -h db -U postgres -d raiz -v ON_ERROR_STOP=1 -q -f /generado/usuarios.sql

echo "==> perfiles y casos de prueba"
psql -h db -U postgres -d raiz -v ON_ERROR_STOP=1 -q -f /siembra/80-semillas-casos.sql

echo "==> resumen"
psql -h db -U postgres -d raiz -q -c "
  select p.nombre, p.rol, u.email
  from perfiles p join auth.users u on u.id = p.id
  order by p.rol::text, u.email;"

psql -h db -U postgres -d raiz -q -c "
  select count(*) as casos_sembrados from familias;"

echo "==> siembra completa"
