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

. "$AQUI/cuenta-correcta.sh"
aws_() { aws --region "$REGION" $PERFIL_FLAG "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
exigir_cuenta_de_raiz

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

# ADEMAS CON EL COMMIT, cuando se sabe cual es. `latest` dice que hay desplegado
# ahora; la etiqueta con el commit es lo que permite volver atras desplegando una
# anterior, sin reconstruir. Lo pide el ADR 004.
#
# `RAIZ_COMMIT` lo pone quien llama —en GitHub Actions es el sha del commit— y si no
# viene se intenta leer de git. Corriendo a mano sobre un arbol sucio no se etiqueta:
# una etiqueta que dice ser un commit y no lo es, miente justo el dia que hay que
# volver atras.
if [ -z "${RAIZ_COMMIT:-}" ] && git -C "$RAIZ_REPO" diff --quiet 2>/dev/null; then
  RAIZ_COMMIT="$(git -C "$RAIZ_REPO" rev-parse HEAD 2>/dev/null || true)"
fi

if [ -n "${RAIZ_COMMIT:-}" ]; then
  docker tag "$REPO:latest" "$REGISTRO/$REPO:$RAIZ_COMMIT"
  docker push "$REGISTRO/$REPO:$RAIZ_COMMIT" >/dev/null
  echo "    $REGISTRO/$REPO:$RAIZ_COMMIT"
else
  echo "    sin etiqueta de commit (arbol con cambios sin guardar)"
fi

# LA IMAGEN DE MIGRACIONES VA AQUI Y NO EN OTRO GUION, porque se despliegan juntas y
# separarlas invita a subir una y olvidar la otra: entonces el esquema que se aplica es
# el de la version anterior, y eso no da error hasta que una columna no existe.
echo ""
echo "==> construyendo y subiendo la imagen de migraciones"
docker build --platform linux/arm64   -f "$RAIZ_REPO/entorno/aws/migraciones/Dockerfile"   -t "raiz-migraciones:latest" "$RAIZ_REPO" >/dev/null
docker tag "raiz-migraciones:latest" "$REGISTRO/raiz-migraciones:latest"
docker push "$REGISTRO/raiz-migraciones:latest" >/dev/null
echo "    $REGISTRO/raiz-migraciones:latest"

DIGESTO="$(aws_ ecr describe-images --repository-name "$REPO" --image-ids imageTag=latest \
  --query 'imageDetails[0].imageDigest' --output text)"
echo "    $DIGESTO"

echo ""
echo "==> listo"
echo "    Siguiente: ./desplegar-api.sh"
