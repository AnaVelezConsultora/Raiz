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

# Este guion exigia `cluster.env` y no usaba ni una variable de ese archivo: lo unico
# que sacaba de ahi era `RAIZ_CUENTA`, que hoy lo resuelve cuenta-correcta.sh
# preguntandole a AWS. El requisito sobrevivio a su motivo, y mientras tanto ataba el
# guion a la maquina donde ese archivo existe.

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
echo "==> entrando al registro"
aws_ ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRO" >/dev/null 2>&1
echo "    $REGISTRO"

# -----------------------------------------------------------------------------
# BUILDX Y NO `docker build`, Y NO ES UN DETALLE
# -----------------------------------------------------------------------------
#
# ARM64 es lo que corre en Fargate. En un portatil Apple eso es la arquitectura nativa
# y `docker build --platform linux/arm64` no hace nada especial. En el corredor de
# GitHub, que es x86, la MISMA linea es una compilacion cruzada: necesita QEMU y un
# constructor de buildx, y sin eso o falla o —peor— produce una imagen x86 con etiqueta
# de ARM64. Eso se descubre cuando la tarea muere con «exec format error», que no
# menciona la arquitectura por ningun lado.
#
# `buildx` funciona igual en los dos sitios, asi que se usa siempre. Es exactamente el
# motivo de que este guion sea la unica implementacion: la version del flujo usaba
# buildx y la del guion no, y esa diferencia solo se habria notado desplegando.
#
# `--push` sube directo desde el constructor. Sin eso habria que traerla al almacen
# local con `--load`, que en compilacion cruzada es justo lo que no siempre funciona.
CONSTRUCTOR="docker buildx build --platform linux/arm64"

# Las etiquetas: `latest` dice que hay desplegado ahora, y la del commit es lo que
# permite volver atras desplegando una anterior sin reconstruir. Lo pide el ADR 004.
#
# `RAIZ_COMMIT` lo pone quien llama —en Actions es el sha— y si no viene se lee de git.
# Sobre un arbol con cambios sin guardar NO se etiqueta: una etiqueta que dice ser un
# commit y no lo es miente justo el dia que hay que volver atras.
if [ -z "${RAIZ_COMMIT:-}" ] && git -C "$RAIZ_REPO" diff --quiet 2>/dev/null; then
  RAIZ_COMMIT="$(git -C "$RAIZ_REPO" rev-parse HEAD 2>/dev/null || true)"
fi

ETIQUETAS="-t $IMAGEN"
if [ -n "${RAIZ_COMMIT:-}" ]; then
  ETIQUETAS="$ETIQUETAS -t $REGISTRO/$REPO:$RAIZ_COMMIT"
else
  echo "    (sin etiqueta de commit: el arbol tiene cambios sin guardar)"
fi

echo ""
echo "==> construyendo y subiendo la API"
# El contexto es la raiz del repositorio, no api/: @raiz/dominio vive al lado y la API
# lo importa.
$CONSTRUCTOR -f "$RAIZ_REPO/api/Dockerfile" $ETIQUETAS --push "$RAIZ_REPO" >/dev/null
echo "    $IMAGEN"
[ -n "${RAIZ_COMMIT:-}" ] && echo "    $REGISTRO/$REPO:$RAIZ_COMMIT"

# LA IMAGEN DE MIGRACIONES VA AQUI Y NO EN OTRO GUION, porque se despliegan juntas y
# separarlas invita a subir una y olvidar la otra: entonces se aplica el esquema de la
# version anterior, y eso no da error hasta que una columna no existe.
echo ""
echo "==> construyendo y subiendo las migraciones"
$CONSTRUCTOR -f "$RAIZ_REPO/entorno/aws/migraciones/Dockerfile" -t "$REGISTRO/raiz-migraciones:latest" --push "$RAIZ_REPO" >/dev/null
echo "    $REGISTRO/raiz-migraciones:latest"

DIGESTO="$(aws_ ecr describe-images --repository-name "$REPO" --image-ids imageTag=latest \
  --query 'imageDetails[0].imageDigest' --output text)"
echo "    $DIGESTO"

echo ""
echo "==> listo"
echo "    Siguiente: ./desplegar-api.sh"
