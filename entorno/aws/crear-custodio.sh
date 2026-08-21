#!/bin/sh
# =============================================================================
# Crea el PRIMER custodio: la cuenta en Cognito y su perfil en la base.
#
#   ./crear-custodio.sh custodia@ejemplo.org "Nombre Apellido"
#
# Requiere que ./aplicar-migraciones.sh haya corrido: reutiliza esa imagen y esa
# definicion de tarea para llegar a la base desde dentro de la VPC.
#
# Es IDEMPOTENTE. Si la cuenta ya esta en Cognito la reutiliza, y la siembra no
# degrada a nadie que ya sea custodio o coordinador.
#
# -----------------------------------------------------------------------------
# EL PROBLEMA DEL PRIMERO
# -----------------------------------------------------------------------------
#
# `POST /voluntarios` exige que quien pide sea custodio. Eso deja al primer
# custodio sin quien lo cree: la API no puede fabricarlo sin abrir exactamente la
# puerta que decidio no abrir.
#
# Este guion es ese eslabon, y por eso vive aqui —en entorno/aws, del lado de
# plataforma— y no como una ruta de la API. Se usa una vez por despliegue. Del
# segundo voluntario en adelante, todo pasa por `POST /voluntarios` y queda
# registrado con el nombre de quien lo dio de alta.
#
# ANTES DE CORRERLO CON UNA PERSONA REAL: hoy el balanceador escucha en HTTP, de
# modo que la clave de esa persona viajaria en claro al iniciar sesion. Mientras
# no haya TLS, esto se usa con cuentas de prueba.
# =============================================================================
set -e

CORREO="$1"
NOMBRE="$2"

if [ -z "$CORREO" ] || [ -z "$NOMBRE" ]; then
  echo "Uso: ./crear-custodio.sh <correo> <\"Nombre Apellido\">" >&2
  exit 1
fi

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"
FAMILIA="raiz-migraciones"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"

for f in nube.env red.env base.env cluster.env; do
  if [ ! -f "$SALIDA/$f" ]; then
    echo "ERROR: falta entorno/generado/$f" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$SALIDA/$f"
done

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
. "$AQUI/cuenta-correcta.sh"
exigir_cuenta_de_raiz

# -----------------------------------------------------------------------------
# 1. La cuenta en Cognito
# -----------------------------------------------------------------------------
echo "==> cuenta en Cognito"
SUB="$(aws_ cognito-idp list-users --user-pool-id "$COGNITO_USER_POOL_ID" \
  --filter "email = \"$CORREO\"" \
  --query 'Users[0].Attributes[?Name==`sub`].Value | [0]' --output text)"

if [ -z "$SUB" ] || [ "$SUB" = "None" ]; then
  # Igual que crear-voluntario.sh: sin correo de Cognito —cae en spam sin dominio
  # propio— y con clave definitiva, porque una temporal obliga a un desafio de
  # cambio de clave que la API todavia no resuelve.
  SUB="$(aws_ cognito-idp admin-create-user \
    --user-pool-id "$COGNITO_USER_POOL_ID" \
    --username "$CORREO" \
    --user-attributes "Name=email,Value=$CORREO" "Name=email_verified,Value=true" \
                      "Name=name,Value=$NOMBRE" \
    --message-action SUPPRESS \
    --query 'User.Attributes[?Name==`sub`].Value | [0]' --output text)"

  CLAVE="${RAIZ_CLAVE_INICIAL:-Raiz.campo.2026}"
  aws_ cognito-idp admin-set-user-password \
    --user-pool-id "$COGNITO_USER_POOL_ID" \
    --username "$CORREO" --password "$CLAVE" --permanent
  echo "    creada: $CORREO"
  echo "    clave:  $CLAVE   (entreguela por el canal de la coordinacion)"
else
  echo "    ya existia: $CORREO"
fi
echo "    sub: $SUB"

# -----------------------------------------------------------------------------
# 2. El perfil, desde dentro de la VPC
# -----------------------------------------------------------------------------
# Se reutiliza la definicion de tarea de las migraciones y se sobrescribe el
# comando. La imagen tiene ENTRYPOINT /bin/sh justamente para que esto sea
# posible: ECS deja sobrescribir `command` pero no `entryPoint`.
echo ""
echo "==> perfil en la base"
REVISION="$(aws_ ecs describe-task-definition --task-definition "$FAMILIA" \
  --query 'taskDefinition.revision' --output text)"
echo "    usando $FAMILIA revision $REVISION"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/override.json" <<JSON
{
  "containerOverrides": [
    {
      "name": "migraciones",
      "command": ["/migraciones/custodio.sh"],
      "environment": [
        { "name": "CUSTODIO_SUB",    "value": "$SUB" },
        { "name": "CUSTODIO_CORREO", "value": "$CORREO" },
        { "name": "CUSTODIO_NOMBRE", "value": "$NOMBRE" }
      ]
    }
  ]
}
JSON

TAREA="$(aws_ ecs run-task \
  --cluster "$RAIZ_CLUSTER" \
  --task-definition "$FAMILIA:$REVISION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$RAIZ_SUBRED_PUB_A],securityGroups=[$RAIZ_SG_API],assignPublicIp=ENABLED}" \
  --overrides "file://$TMP/override.json" \
  --query 'tasks[0].taskArn' --output text)"

if [ -z "$TAREA" ] || [ "$TAREA" = "None" ]; then
  echo "ERROR: la tarea no arranco" >&2
  exit 1
fi

ID="${TAREA##*/}"
echo "    tarea $ID, esperando..."
aws_ ecs wait tasks-stopped --cluster "$RAIZ_CLUSTER" --tasks "$TAREA"

echo ""
echo "==> registros"
aws_ logs get-log-events \
  --log-group-name /raiz/migraciones \
  --log-stream-name "ecs/migraciones/$ID" \
  --start-from-head \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/    /' || true

CODIGO="$(aws_ ecs describe-tasks --cluster "$RAIZ_CLUSTER" --tasks "$TAREA" \
  --query 'tasks[0].containers[0].exitCode' --output text)"

if [ "$CODIGO" != "0" ]; then
  echo ""
  echo "ERROR: la siembra fallo (codigo $CODIGO)." >&2
  exit 1
fi

echo ""
echo "==> listo"
echo "    $CORREO ya puede iniciar sesion y dar de alta a los demas con"
echo "    POST /voluntarios. Este guion no se vuelve a necesitar."
