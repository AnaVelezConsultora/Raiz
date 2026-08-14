#!/bin/bash
# =============================================================================
# BOOTSTRAP DEL ENTORNO LOCAL
#
# Crea con la CLI de AWS lo que en produccion crea Terraform: el bucket de
# fotografias y el User Pool de Cognito.
#
# Se usa la CLI a proposito. Lo que el dev ve en el log son los comandos reales
# de AWS, de modo que la forma del entorno local y la de produccion no se le
# vuelvan dos cosas distintas en la cabeza.
#
# Es idempotente: se puede correr las veces que haga falta.
# =============================================================================
set -euo pipefail

s3()      { aws --endpoint-url "$S3_ENDPOINT"      "$@"; }
cognito() { aws --endpoint-url "$COGNITO_ENDPOINT" "$@"; }

echo "==> esperando a Cognito en $COGNITO_ENDPOINT"
for _ in $(seq 1 60); do
  if cognito cognito-idp list-user-pools --max-results 1 >/dev/null 2>&1; then break; fi
  sleep 2
done
cognito cognito-idp list-user-pools --max-results 1 >/dev/null

# -----------------------------------------------------------------------------
# S3: bucket de fotografias.
#
# Las fotos son de la vivienda y el dano, nunca de personas, pero van asociadas a
# un hogar identificado. Un bucket publico las expondria por URL directa sin
# autenticacion: es el punto 6 de SEGURIDAD.md, el que el propio documento
# advierte que "es el que mas se olvida".
#
# Por eso el bloqueo de acceso publico se aplica aqui desde el primer arranque,
# aunque en local no proteja nada: para que nadie descubra en produccion que
# hacia falta.
# -----------------------------------------------------------------------------
echo "==> S3: bucket $S3_BUCKET_FOTOS"
s3 s3api create-bucket --bucket "$S3_BUCKET_FOTOS" >/dev/null 2>&1 || true

s3 s3api put-public-access-block \
  --bucket "$S3_BUCKET_FOTOS" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  >/dev/null

# CORS para que la PWA suba con URL prefirmada directamente a S3, sin que los
# 200 KB de cada foto atraviesen la API. Con 15.000 fotografias previstas, eso
# es la diferencia entre pagar transferencia y computo, o no pagarlos.
cat >/tmp/cors.json <<JSON
{
  "CORSRules": [{
    "AllowedOrigins": ["${ORIGEN_PWA}"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
JSON
s3 s3api put-bucket-cors --bucket "$S3_BUCKET_FOTOS" --cors-configuration file:///tmp/cors.json >/dev/null
echo "    bucket listo, acceso publico bloqueado, CORS para ${ORIGEN_PWA}"

# -----------------------------------------------------------------------------
# Cognito: User Pool y cliente para la PWA.
#
# Regla operativa de ESTADO.md que condiciona esta configuracion:
# "Iniciar sesion exige conexion, capturar no."
#
# El voluntario entra con senal en el casco urbano y sube a la vereda. Su token
# de acceso caduca alla arriba y NO puede costarle la jornada: la aplicacion
# sigue capturando contra la base local. Lo unico que exigira sesion vigente es
# sincronizar. Por eso el refresh token se configura largo.
# -----------------------------------------------------------------------------
echo "==> Cognito: user pool raiz-local"
POOL_ID="$(cognito cognito-idp list-user-pools --max-results 50 \
  --query "UserPools[?Name=='raiz-local'].Id | [0]" --output text)"

if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "None" ]; then
  POOL_ID="$(cognito cognito-idp create-user-pool \
    --pool-name raiz-local \
    --query 'UserPool.Id' --output text)"
fi
echo "    user pool: $POOL_ID"

CLIENT_ID="$(cognito cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" --max-results 50 \
  --query "UserPoolClients[?ClientName=='raiz-pwa'].ClientId | [0]" --output text)"

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "None" ]; then
  CLIENT_ID="$(cognito cognito-idp create-user-pool-client \
    --user-pool-id "$POOL_ID" \
    --client-name raiz-pwa \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --refresh-token-validity 30 \
    --query 'UserPoolClient.ClientId' --output text)"
fi
echo "    cliente PWA: $CLIENT_ID"

# -----------------------------------------------------------------------------
# Usuarios de prueba.
#
# Cognito genera el `sub`. Nosotros NO lo inventamos: se lee de vuelta y se
# escribe en usuarios.sql para que la base lo reciba. Es el mismo camino que en
# produccion recorre el Lambda de Post-Confirmation, y por eso las semillas no
# traen UUID escritos a mano.
#
# Los cinco correos cubren los cinco roles de la aplicacion. Ana y Beto quedan
# como lideres a proposito: son los sujetos de la prueba de aislamiento.
# -----------------------------------------------------------------------------
echo "==> Cognito: usuarios de prueba"
: >/generado/usuarios.sql
cat >>/generado/usuarios.sql <<'CAB'
-- Generado por entorno/aws/bootstrap.sh. No editar a mano.
-- El `sub` lo asigno Cognito; aqui solo se refleja en la base, igual que hara
-- el Lambda de Post-Confirmation en AWS.
CAB

crear_usuario() {
  local correo="$1" nombre="$2" sub=""

  sub="$(cognito cognito-idp admin-get-user \
        --user-pool-id "$POOL_ID" --username "$correo" \
        --query "UserAttributes[?Name=='sub'].Value | [0]" \
        --output text 2>/dev/null || true)"

  if [ -z "$sub" ] || [ "$sub" = "None" ]; then
    sub="$(cognito cognito-idp admin-create-user \
      --user-pool-id "$POOL_ID" --username "$correo" \
      --message-action SUPPRESS \
      --user-attributes Name=email,Value="$correo" Name=email_verified,Value=true \
      --query "User.Attributes[?Name=='sub'].Value | [0]" --output text)"

    cognito cognito-idp admin-set-user-password \
      --user-pool-id "$POOL_ID" --username "$correo" \
      --password 'Raiz.local.2026' --permanent >/dev/null
  fi

  printf "insert into auth.users (id, email, raw_user_meta_data)\n  values ('%s', '%s', jsonb_build_object('nombre', '%s'))\n  on conflict (id) do nothing;\n" \
    "$sub" "$correo" "$nombre" >>/generado/usuarios.sql

  echo "    $correo -> $sub"
}

crear_usuario 'ana@ejemplo.test'          'Ana Lider (prueba)'
crear_usuario 'beto@ejemplo.test'         'Beto Lider (prueba)'
crear_usuario 'coordinadora@ejemplo.test' 'Coordinadora (prueba)'
crear_usuario 'custodia@ejemplo.test'     'Custodia de datos (prueba)'
crear_usuario 'digitador@ejemplo.test'    'Digitador (prueba)'

# -----------------------------------------------------------------------------
# Variables generadas, para pegar en el .env de la API.
# -----------------------------------------------------------------------------
cat >/generado/entorno.generado.env <<ENV
# Generado por entorno/aws/bootstrap.sh. No editar a mano.
COGNITO_USER_POOL_ID=${POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}
ENV

echo ""
echo "==> listo"
echo "    contrasena de todos los usuarios de prueba: Raiz.local.2026"
echo "    identificadores del pool en entorno/generado/entorno.generado.env"
