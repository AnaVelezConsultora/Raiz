#!/bin/sh
# =============================================================================
# Aplica el esquema de Raiz sobre RDS, desde una tarea efimera DENTRO de la VPC.
# HU 1.1.3.
#
#   ./aplicar-migraciones.sh
#
# Construye la imagen, la sube a ECR, corre una tarea de Fargate y espera a que
# termine. Trae los registros y devuelve el codigo de salida del contenedor, de
# modo que si algo falla este guion falla.
#
# Es IDEMPOTENTE por partida doble: reconstruir y volver a correr es seguro, y el
# aplicador de adentro se salta lo que ya esta registrado como aplicado.
#
# POR QUE ADENTRO Y NO DESDE AQUI
#
# La base no tiene ruta a internet y su grupo de seguridad solo acepta al de la
# API. No se puede llegar desde esta maquina, y esa es la propiedad que se quiere
# conservar. Abrirla "un rato" es la puerta que despues nadie cierra.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"
REPO="raiz-migraciones"
FAMILIA="raiz-migraciones"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
RAIZ_REPO="$(cd "$AQUI/../.." && pwd)"

for f in red.env base.env cluster.env; do
  if [ ! -f "$SALIDA/$f" ]; then
    echo "ERROR: falta entorno/generado/$f" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$SALIDA/$f"
done

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

echo "==> cuenta y region"
echo "    cuenta: $RAIZ_CUENTA   region: $REGION"
echo "    base:   $RAIZ_BASE_ANFITRION"

REGISTRO="$RAIZ_CUENTA.dkr.ecr.$REGION.amazonaws.com"
IMAGEN="$REGISTRO/$REPO:latest"

# -----------------------------------------------------------------------------
# 1. Repositorio de imagenes
# -----------------------------------------------------------------------------
echo ""
echo "==> repositorio de imagenes"
if aws_ ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1; then
  echo "    ya existia: $REPO"
else
  aws_ ecr create-repository --repository-name "$REPO" \
    --image-scanning-configuration scanOnPush=true \
    --tags "Key=Proyecto,Value=Raiz" >/dev/null
  echo "    creado: $REPO"
fi

# -----------------------------------------------------------------------------
# 2. Construir y subir
# -----------------------------------------------------------------------------
echo ""
echo "==> construyendo"
# ARM64 a proposito: es la arquitectura de la imagen de la API y de la maquina
# donde se construye, y en Fargate cuesta cerca de un 20 % menos que x86. Que las
# dos imagenes compartan arquitectura evita el fallo mas aburrido de este
# despliegue, que es una tarea que no arranca con "exec format error".
docker build --platform linux/arm64 \
  -f "$RAIZ_REPO/entorno/aws/migraciones/Dockerfile" \
  -t "$REPO:latest" "$RAIZ_REPO" >/dev/null
echo "    lista"

echo ""
echo "==> subiendo a ECR"
aws_ ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRO" >/dev/null 2>&1
docker tag "$REPO:latest" "$IMAGEN"
docker push "$IMAGEN" >/dev/null
echo "    $IMAGEN"

# -----------------------------------------------------------------------------
# 3. Definicion de tarea
# -----------------------------------------------------------------------------
# Los secretos se inyectan por ARN y no se leen aqui: la clave de administrador de
# la base nunca pasa por esta maquina ni por el registro de este guion. La sintaxis
# `arn:...:clave::` es como ECS toma UNA llave de un secreto en JSON.
ARN_ADMIN="$(aws_ secretsmanager describe-secret --secret-id raiz/base-admin --query 'ARN' --output text)"
ARN_API="$(aws_ secretsmanager describe-secret --secret-id raiz/base-api --query 'ARN' --output text)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/tarea.json" <<JSON
{
  "family": "$FAMILIA",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "runtimePlatform": { "cpuArchitecture": "ARM64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "$RAIZ_ROL_EJECUCION",
  "containerDefinitions": [
    {
      "name": "migraciones",
      "image": "$IMAGEN",
      "essential": true,
      "environment": [
        { "name": "RAIZ_BASE_ANFITRION", "value": "$RAIZ_BASE_ANFITRION" },
        { "name": "RAIZ_BASE_PUERTO",    "value": "$RAIZ_BASE_PUERTO" },
        { "name": "RAIZ_BASE_NOMBRE",    "value": "$RAIZ_BASE_NOMBRE" }
      ],
      "secrets": [
        { "name": "ADMIN_USUARIO", "valueFrom": "$ARN_ADMIN:usuario::" },
        { "name": "ADMIN_CLAVE",   "valueFrom": "$ARN_ADMIN:clave::" },
        { "name": "API_URL",       "valueFrom": "$ARN_API" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/raiz/migraciones",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
JSON

echo ""
echo "==> definicion de tarea"
REVISION="$(aws_ ecs register-task-definition --cli-input-json "file://$TMP/tarea.json" \
  --query 'taskDefinition.revision' --output text)"
echo "    $FAMILIA revision $REVISION"

# -----------------------------------------------------------------------------
# 4. Correr
# -----------------------------------------------------------------------------
# En subred publica con IP publica: es como la tarea baja su propia imagen de ECR
# sin puerta de enlace NAT. Con el grupo de la API, que es el unico que la base
# acepta. No abre ningun puerto: nadie puede iniciar una conexion hacia ella.
echo ""
echo "==> corriendo la tarea"
TAREA="$(aws_ ecs run-task \
  --cluster "$RAIZ_CLUSTER" \
  --task-definition "$FAMILIA:$REVISION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$RAIZ_SUBRED_PUB_A],securityGroups=[$RAIZ_SG_API],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' --output text)"

if [ -z "$TAREA" ] || [ "$TAREA" = "None" ]; then
  echo "ERROR: la tarea no arranco" >&2
  exit 1
fi

ID="${TAREA##*/}"
echo "    $ID"
echo "    esperando..."
aws_ ecs wait tasks-stopped --cluster "$RAIZ_CLUSTER" --tasks "$TAREA"

# -----------------------------------------------------------------------------
# 5. Registros y resultado
# -----------------------------------------------------------------------------
echo ""
echo "==> registros"
aws_ logs get-log-events \
  --log-group-name /raiz/migraciones \
  --log-stream-name "ecs/migraciones/$ID" \
  --start-from-head \
  --query 'events[].message' --output text 2>/dev/null | sed 's/^/    /' || \
  echo "    (sin registros: la tarea puede haber muerto antes de arrancar el contenedor)"

CODIGO="$(aws_ ecs describe-tasks --cluster "$RAIZ_CLUSTER" --tasks "$TAREA" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
RAZON="$(aws_ ecs describe-tasks --cluster "$RAIZ_CLUSTER" --tasks "$TAREA" \
  --query 'tasks[0].stoppedReason' --output text)"

echo ""
echo "==> resultado"
echo "    codigo de salida: $CODIGO"
echo "    razon: $RAZON"

if [ "$CODIGO" != "0" ]; then
  echo ""
  echo "ERROR: las migraciones no terminaron bien." >&2
  exit 1
fi

echo ""
echo "==> listo"
echo "    Siguiente: ./desplegar-api.sh"
