#!/bin/sh
# =============================================================================
# La API de Raiz corriendo en Fargate, detras de un balanceador. HU 1.1.1.
#
#   ./desplegar-api.sh
#
# Requiere red.env, base.env y cluster.env, y que ./aplicar-migraciones.sh haya
# terminado bien: el servicio no debe recibir trafico contra una base sin esquema.
#
# Es IDEMPOTENTE: si el servicio existe, registra una revision nueva de la tarea y
# actualiza el servicio en vez de crear otro. Ese es tambien el camino normal para
# desplegar una version nueva de la imagen.
#
# -----------------------------------------------------------------------------
# ESTE GUION DEJA EL BALANCEADOR EN HTTP. NO TERMINA AHI
# -----------------------------------------------------------------------------
#
# El escucha de 443, el certificado y el nombre propio los pone desplegar-tls.sh,
# que se corre INMEDIATAMENTE despues. Estan separados porque son dos
# preocupaciones —una es el servicio, la otra el borde publico— y porque el de TLS
# depende de la zona de Route 53, que el de la API no necesita para nada.
#
# Entre los dos hay una ventana en la que POST /sesion acepta claves en claro. No
# se usa con credenciales reales dentro de esa ventana.
#
# -----------------------------------------------------------------------------
# UNA SOLA TAREA
# -----------------------------------------------------------------------------
#
# Una replica, 0,25 vCPU. El ADR 001 calculo 0,03 escrituras por segundo en el dia
# pico. Poner dos tareas por costumbre duplica la parte que factura por hora sin
# atender a nadie mas, y este es dinero de donacion.
#
# La disponibilidad tampoco se juega aqui: la aplicacion captura sin servidor y la
# cola reintenta. Si esta tarea se cae, la sincronizacion se retrasa; no se pierde
# un caso.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"
REPO="raiz-api"
FAMILIA="raiz-api"
SERVICIO="raiz-api"
BALANCEADOR="raiz-alb"
GRUPO_DESTINO="raiz-api-8080"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"

for f in nube.env red.env base.env cluster.env fotos.env; do
  if [ ! -f "$SALIDA/$f" ]; then
    echo "ERROR: falta entorno/generado/$f" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$SALIDA/$f"
done

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

IMAGEN="$RAIZ_CUENTA.dkr.ecr.$REGION.amazonaws.com/$REPO:latest"

echo "==> cuenta y region"
echo "    cuenta: $RAIZ_CUENTA   region: $REGION"
echo "    imagen: $IMAGEN"

# -----------------------------------------------------------------------------
# 1. Balanceador
# -----------------------------------------------------------------------------
echo ""
echo "==> balanceador"
ARN_ALB="$(aws_ elbv2 describe-load-balancers --names "$BALANCEADOR" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)"

if [ -z "$ARN_ALB" ] || [ "$ARN_ALB" = "None" ]; then
  ARN_ALB="$(aws_ elbv2 create-load-balancer \
    --name "$BALANCEADOR" \
    --type application \
    --scheme internet-facing \
    --ip-address-type ipv4 \
    --subnets "$RAIZ_SUBRED_PUB_A" "$RAIZ_SUBRED_PUB_B" \
    --security-groups "$RAIZ_SG_BALANCEADOR" \
    --tags "Key=Proyecto,Value=Raiz" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
  echo "    creado"
else
  echo "    ya existia"
fi

DNS_ALB="$(aws_ elbv2 describe-load-balancers --load-balancer-arns "$ARN_ALB" \
  --query 'LoadBalancers[0].DNSName' --output text)"
echo "    $DNS_ALB"

# -----------------------------------------------------------------------------
# 2. Grupo de destino
# -----------------------------------------------------------------------------
# target-type ip y no instance: en Fargate no hay instancia que registrar, el
# destino es la interfaz de red de la tarea.
#
# La comprobacion de salud pega en /salud, que devuelve 200 AUNQUE la base no
# responda. Es a proposito y esta explicado en salud.controller.ts: el dispositivo
# necesita distinguir "el servidor esta caido" de "el servidor esta vivo pero su
# base no". La consecuencia para el balanceador es que no saca de rotacion una
# tarea por un fallo de base — correcto, porque sacarla no arregla la base y deja
# al cliente sin la respuesta que le dice que no envie.
echo ""
echo "==> grupo de destino"
ARN_GRUPO="$(aws_ elbv2 describe-target-groups --names "$GRUPO_DESTINO" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)"

if [ -z "$ARN_GRUPO" ] || [ "$ARN_GRUPO" = "None" ]; then
  ARN_GRUPO="$(aws_ elbv2 create-target-group \
    --name "$GRUPO_DESTINO" \
    --protocol HTTP --port 8080 \
    --vpc-id "$RAIZ_VPC_ID" \
    --target-type ip \
    --health-check-path /salud \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)"
  # 30 segundos y no 300, que es el valor por omision: una tarea que se recicla
  # deja de recibir trafico rapido, y con una sola replica eso se nota.
  aws_ elbv2 modify-target-group-attributes --target-group-arn "$ARN_GRUPO" \
    --attributes Key=deregistration_delay.timeout_seconds,Value=30 >/dev/null
  echo "    creado"
else
  echo "    ya existia"
fi

# -----------------------------------------------------------------------------
# 3. Escucha
# -----------------------------------------------------------------------------
echo ""
echo "==> escucha en 80"
ARN_ESCUCHA="$(aws_ elbv2 describe-listeners --load-balancer-arn "$ARN_ALB" \
  --query "Listeners[?Port==\`80\`] | [0].ListenerArn" --output text 2>/dev/null || true)"
if [ -z "$ARN_ESCUCHA" ] || [ "$ARN_ESCUCHA" = "None" ]; then
  aws_ elbv2 create-listener \
    --load-balancer-arn "$ARN_ALB" \
    --protocol HTTP --port 80 \
    --default-actions "Type=forward,TargetGroupArn=$ARN_GRUPO" >/dev/null
  echo "    creada"
else
  echo "    ya existia"
fi

# -----------------------------------------------------------------------------
# 4. Definicion de tarea
# -----------------------------------------------------------------------------
ARN_API="$(aws_ secretsmanager describe-secret --secret-id raiz/base-api --query 'ARN' --output text)"

# ORIGENES_PERMITIDOS es el unico valor de esta lista que no sale de la
# infraestructura sino de donde se sirva la PWA. Son los dos nombres del frente
# —CLAUDE.md los fija— mas los de desarrollo.
#
# Los de localhost se quedan a proposito: quien programa la PWA la levanta en su
# maquina y la apunta a esta API para probar contra datos reales de prueba. Si se
# quitan, ese ciclo se rompe y la unica forma de probar pasa a ser desplegar, que
# es justo lo que el ADR 004 no quiere.
ORIGENES="${ORIGENES_PERMITIDOS:-https://apoyo-colombia.com,https://www.apoyo-colombia.com,http://localhost:4200,http://localhost:4300}"

cat >"$TMP/tarea.json" <<JSON
{
  "family": "$FAMILIA",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "runtimePlatform": { "cpuArchitecture": "ARM64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "$RAIZ_ROL_EJECUCION",
  "taskRoleArn": "$RAIZ_ROL_TAREA",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "$IMAGEN",
      "essential": true,
      "portMappings": [ { "containerPort": 8080, "protocol": "tcp" } ],
      "environment": [
        { "name": "AWS_REGION",            "value": "$AWS_REGION" },
        { "name": "COGNITO_USER_POOL_ID",  "value": "$COGNITO_USER_POOL_ID" },
        { "name": "COGNITO_CLIENT_ID",     "value": "$COGNITO_CLIENT_ID" },
        { "name": "COGNITO_ISSUER",        "value": "$COGNITO_ISSUER" },
        { "name": "COGNITO_JWKS_URI",      "value": "$COGNITO_JWKS_URI" },
        { "name": "ORIGENES_PERMITIDOS",   "value": "$ORIGENES" },
        { "name": "S3_BUCKET_FOTOS",       "value": "$S3_BUCKET_FOTOS" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "$ARN_API" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/raiz/api",
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

# COGNITO_ENDPOINT NO se pone, y esa ausencia es la que hace que el adaptador
# arme la direccion real con la region. Ponerlo apuntaria a cognito-local, que en
# la nube no existe. S3_ENDPOINT se omite por lo mismo, y ademas no hay ninguna
# credencial de AWS entre estas variables: la tarea las toma de su rol.

# -----------------------------------------------------------------------------
# 5. Servicio
# -----------------------------------------------------------------------------
echo ""
echo "==> servicio"
ESTADO="$(aws_ ecs describe-services --cluster "$RAIZ_CLUSTER" --services "$SERVICIO" \
  --query 'services[0].status' --output text 2>/dev/null || true)"

RED="awsvpcConfiguration={subnets=[$RAIZ_SUBRED_PUB_A,$RAIZ_SUBRED_PUB_B],securityGroups=[$RAIZ_SG_API],assignPublicIp=ENABLED}"

if [ "$ESTADO" != "ACTIVE" ]; then
  aws_ ecs create-service \
    --cluster "$RAIZ_CLUSTER" \
    --service-name "$SERVICIO" \
    --task-definition "$FAMILIA:$REVISION" \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "$RED" \
    --load-balancers "targetGroupArn=$ARN_GRUPO,containerName=api,containerPort=8080" \
    --health-check-grace-period-seconds 60 \
    --tags "key=Proyecto,value=Raiz" >/dev/null
  echo "    creado: $SERVICIO"
else
  aws_ ecs update-service \
    --cluster "$RAIZ_CLUSTER" \
    --service "$SERVICIO" \
    --task-definition "$FAMILIA:$REVISION" \
    --desired-count 1 >/dev/null
  echo "    actualizado a la revision $REVISION"
fi

echo ""
echo "==> esperando a que el servicio quede estable (puede tardar 3 a 5 minutos)"
aws_ ecs wait services-stable --cluster "$RAIZ_CLUSTER" --services "$SERVICIO"
echo "    estable"

cat >"$SALIDA/api.env" <<ENV
# Generado por entorno/aws/desplegar-api.sh. No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
RAIZ_API_URL=http://$DNS_ALB
RAIZ_ALB_ARN=$ARN_ALB
RAIZ_GRUPO_DESTINO=$ARN_GRUPO
ENV

echo ""
echo "==> listo"

# Se consulta el estado real en vez de anunciar siempre lo mismo. Un guion que
# advierte "falta TLS" cuando TLS ya esta puesto ensena a no leer sus avisos, y
# entonces tampoco se lee el dia que el aviso es cierto.
HAY_443="$(aws_ elbv2 describe-listeners --load-balancer-arn "$ARN_ALB" \
  --query "Listeners[?Port==\`443\`] | [0].ListenerArn" --output text 2>/dev/null || true)"

if [ -z "$HAY_443" ] || [ "$HAY_443" = "None" ]; then
  echo "    Balanceador en: $DNS_ALB  (solo HTTP)"
  echo ""
  echo "    FALTA EL PASO DE TLS. Hasta que corra ./desplegar-tls.sh, la clave de"
  echo "    POST /sesion viaja en claro y esto no se usa con credenciales reales."
  echo ""
  echo "    Siguiente: ./desplegar-tls.sh"
else
  echo "    API en: https://api.apoyo-colombia.com"
  echo "    Salud:  curl https://api.apoyo-colombia.com/salud"
fi
