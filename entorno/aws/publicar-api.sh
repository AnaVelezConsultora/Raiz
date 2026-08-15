#!/bin/sh
# =============================================================================
# Construye la imagen de la API y la sube a ECR.
#
#   ./publicar-api.sh
#
# NO despliega nada. Eso lo hace ./desplegar-api.sh, que es un paso aparte.
#
# POR QUE SEPARADOS
#
# Porque el ADR 004 dice que la promocion NO reconstruye: lo aprobado en
# preproduccion tiene que ser byte por byte lo que entra a produccion. Un guion
# que construye y despliega en el mismo gesto hace imposible cumplir eso, porque
# cada despliegue produce una imagen distinta aunque el codigo sea el mismo.
#
# Aqui se publica una vez y se despliega esa misma imagen las veces que haga
# falta. Volver atras es desplegar la etiqueta anterior, no reconstruir.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"
REPO="raiz-api"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
RAIZ_REPO="$(cd "$AQUI/../.." && pwd)"

if [ ! -f "$SALIDA/cluster.env" ]; then
  echo "ERROR: falta entorno/generado/cluster.env. Corra antes ./desplegar-cluster.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$SALIDA/cluster.env"

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

REGISTRO="$RAIZ_CUENTA.dkr.ecr.$REGION.amazonaws.com"
IMAGEN="$REGISTRO/$REPO:latest"

echo "==> repositorio"
if aws_ ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1; then
  echo "    ya existia: $REPO"
else
  aws_ ecr create-repository --repository-name "$REPO" \
    --image-scanning-configuration scanOnPush=true \
    --tags "Key=Proyecto,Value=Raiz" >/dev/null
  echo "    creado: $REPO"
fi

echo ""
echo "==> construyendo"
# El contexto es la raiz del repositorio, no api/: @raiz/dominio vive al lado y la
# API lo importa. ARM64 porque es lo que corre en Fargate y lo que evita el fallo
# mas aburrido de este despliegue, "exec format error".
docker build --platform linux/arm64 \
  -f "$RAIZ_REPO/api/Dockerfile" \
  -t "$REPO:latest" "$RAIZ_REPO" >/dev/null
echo "    lista"

echo ""
echo "==> subiendo"
aws_ ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRO" >/dev/null 2>&1
docker tag "$REPO:latest" "$IMAGEN"
docker push "$IMAGEN" >/dev/null
echo "    $IMAGEN"

DIGESTO="$(aws_ ecr describe-images --repository-name "$REPO" --image-ids imageTag=latest \
  --query 'imageDetails[0].imageDigest' --output text)"
echo "    $DIGESTO"

echo ""
echo "==> listo"
echo "    Siguiente: ./desplegar-api.sh"
