#!/bin/sh
# =============================================================================
# Cluster de ECS, roles de IAM y grupos de registro. Parte de la HU 1.1.1.
#
#   ./desplegar-cluster.sh
#
# Lo comparten aplicar-migraciones.sh y desplegar-api.sh, por eso esta aparte.
# Es IDEMPOTENTE y no cuesta nada: un cluster de Fargate vacio no factura, lo que
# factura son las tareas que corren dentro.
#
# -----------------------------------------------------------------------------
# DOS ROLES, Y LA DIFERENCIA IMPORTA
# -----------------------------------------------------------------------------
#
#   raiz-ecs-ejecucion  lo usa la PLATAFORMA antes de que el contenedor arranque:
#                       baja la imagen de ECR, lee los secretos para inyectarlos
#                       y abre el flujo de registro. El codigo de la API nunca lo
#                       ve ni puede usarlo.
#
#   raiz-ecs-tarea      lo usa el CODIGO ya corriendo. Aqui adentro solo hay
#                       permiso para tres operaciones sobre un pool de Cognito.
#
# Separarlos es lo que hace que una falla en la API no alcance los secretos. Si
# alguien lograra ejecutar codigo dentro del contenedor, tendria el rol de tarea
# —tres llamadas a Cognito— y no el de ejecucion, que es el que puede leer la clave
# de la base. Con un rol unico, que es lo comodo, esa distincion no existe.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"
CLUSTER="raiz"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
mkdir -p "$SALIDA"

if [ ! -f "$SALIDA/nube.env" ]; then
  echo "ERROR: falta entorno/generado/nube.env. Corra antes ./desplegar-cognito.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$SALIDA/nube.env"

. "$AQUI/cuenta-correcta.sh"
aws_() { aws --region "$REGION" $PERFIL_FLAG "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
exigir_cuenta_de_raiz

echo "==> cuenta y region"
CUENTA="$(aws_ sts get-caller-identity --query 'Account' --output text)"
echo "    cuenta: $CUENTA   region: $REGION"

# -----------------------------------------------------------------------------
# 1. El cluster
# -----------------------------------------------------------------------------
echo ""
echo "==> cluster"
ESTADO="$(aws_ ecs describe-clusters --clusters "$CLUSTER" \
  --query 'clusters[0].status' --output text 2>/dev/null || true)"
if [ "$ESTADO" != "ACTIVE" ]; then
  aws_ ecs create-cluster --cluster-name "$CLUSTER" \
    --capacity-providers FARGATE \
    --tags "key=Proyecto,value=Raiz" >/dev/null
  echo "    creado: $CLUSTER"
else
  echo "    ya existia: $CLUSTER"
fi

# -----------------------------------------------------------------------------
# 2. Grupos de registro
# -----------------------------------------------------------------------------
# Con retencion, y eso no es ahorro de centavos: los registros de esta API pueden
# llevar identificadores de casos de familias. Guardarlos para siempre es acumular
# un rastro que nadie pidio y que hay que custodiar. Treinta dias alcanza para
# depurar un incidente.
echo ""
echo "==> grupos de registro"
for g in /raiz/api /raiz/migraciones; do
  if aws_ logs describe-log-groups --log-group-name-prefix "$g" \
      --query "logGroups[?logGroupName=='$g'] | [0].logGroupName" --output text 2>/dev/null | grep -q "$g"; then
    echo "    ya existia: $g"
  else
    aws_ logs create-log-group --log-group-name "$g" >/dev/null
    echo "    creado: $g"
  fi
  aws_ logs put-retention-policy --log-group-name "$g" --retention-in-days 30 >/dev/null
done
echo "    retencion: 30 dias"

# -----------------------------------------------------------------------------
# 3. Roles
# -----------------------------------------------------------------------------
CONFIANZA='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}'

rol() { # rol <nombre> <descripcion>
  if aws_ iam get-role --role-name "$1" >/dev/null 2>&1; then
    echo "    ya existia: $1" >&2
  else
    aws_ iam create-role --role-name "$1" \
      --assume-role-policy-document "$CONFIANZA" \
      --description "$2" \
      --tags "Key=Proyecto,Value=Raiz" >/dev/null
    echo "    creado: $1" >&2
  fi
  aws_ iam get-role --role-name "$1" --query 'Role.Arn' --output text
}

echo ""
echo "==> rol de ejecucion"
ARN_EJECUCION="$(rol raiz-ecs-ejecucion 'Baja la imagen, lee los secretos y escribe registros. No lo ve el codigo.')"

aws_ iam attach-role-policy --role-name raiz-ecs-ejecucion \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# La politica administrada cubre ECR y registros, pero NO los secretos. Se agrega
# aparte y limitada por nombre: el rol puede leer los dos secretos de Raiz y
# ninguno mas de la cuenta.
aws_ iam put-role-policy --role-name raiz-ecs-ejecucion \
  --policy-name raiz-leer-secretos \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"secretsmanager:GetSecretValue\"],
      \"Resource\": [
        \"arn:aws:secretsmanager:$REGION:$CUENTA:secret:raiz/base-admin-*\",
        \"arn:aws:secretsmanager:$REGION:$CUENTA:secret:raiz/base-api-*\"
      ]
    }]
  }"
echo "    politicas: ECR + registros + los dos secretos de Raiz"

echo ""
echo "==> rol de tarea"
ARN_TAREA="$(rol raiz-ecs-tarea 'Lo usa el codigo de la API. Tres operaciones sobre un pool de Cognito.')"

# Tres acciones, un recurso. Son exactamente las que hace POST /voluntarios
# (cognito-admin.ts) y ni una mas.
#
# AdminGetUser se agrego con la correccion del hallazgo H16: cuando el correo ya
# existe, el alta ya no se rinde — consulta la cuenta para saber su identificador y
# si quedo a medias. Sin este permiso, reparar un alta interrumpida seria imposible.
# Es de LECTURA sobre el mismo pool que la API ya puede escribir, asi que no amplia
# lo que alcanza: solo le deja mirar antes de escribir.
#
# InitiateAuth NO esta aqui, y no es un olvido: es una API sin firmar —quien se
# autentica es el voluntario, no la cuenta— asi que no consume este rol. Por eso
# el adaptador de sesion no usa el SDK.
aws_ iam put-role-policy --role-name raiz-ecs-tarea \
  --policy-name raiz-alta-de-voluntarios \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [
        \"cognito-idp:AdminCreateUser\",
        \"cognito-idp:AdminSetUserPassword\",
        \"cognito-idp:AdminGetUser\"
      ],
      \"Resource\": \"arn:aws:cognito-idp:$REGION:$CUENTA:userpool/$COGNITO_USER_POOL_ID\"
    }]
  }"
echo "    politicas: alta de voluntarios sobre $COGNITO_USER_POOL_ID"

# -----------------------------------------------------------------------------
# 4. Variables
# -----------------------------------------------------------------------------
cat >"$SALIDA/cluster.env" <<ENV
# Generado por entorno/aws/desplegar-cluster.sh. No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
RAIZ_CUENTA=$CUENTA
RAIZ_CLUSTER=$CLUSTER
RAIZ_ROL_EJECUCION=$ARN_EJECUCION
RAIZ_ROL_TAREA=$ARN_TAREA
ENV

echo ""
echo "==> variables en entorno/generado/cluster.env"
sed 's/^/    /' "$SALIDA/cluster.env"

echo ""
echo "==> listo"
echo "    Un cluster de Fargate vacio no factura. Lo que factura son las tareas."
