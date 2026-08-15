#!/bin/sh
# =============================================================================
# Compila la PWA y la publica en CloudFront.
#
#   ./publicar-front.sh
#
# Requiere que ./desplegar-front.sh haya corrido. Es el guion que se repite en
# cada entrega; el otro se corre una vez.
#
# -----------------------------------------------------------------------------
# EL ORDEN DE SUBIDA NO ES ARBITRARIO
# -----------------------------------------------------------------------------
#
# Primero lo que lleva hash en el nombre, despues lo que no.
#
# Si se subiera index.html primero, durante unos segundos habria un index nuevo
# apuntando a paquetes que todavia no existen. Cualquiera que abra la aplicacion en
# esa ventana recibe una pagina rota. Al reves no pasa nada: los paquetes nuevos
# quedan ahi sin que nadie los pida hasta que el index los nombra.
#
# Es una ventana de segundos y en campo no se notaria casi nunca. "Casi nunca" es
# exactamente la clase de fallo que aparece el dia de la jornada.
#
# -----------------------------------------------------------------------------
# DOS POLITICAS DE CACHE, Y LA DEL SERVICE WORKER ES LA QUE IMPORTA
# -----------------------------------------------------------------------------
#
# Los paquetes llevan un hash en el nombre: si el contenido cambia, cambia el
# nombre. Se pueden guardar para siempre porque nunca cambian bajo el mismo nombre.
#
# index.html, ngsw.json y ngsw-worker.js NO llevan hash, y ahi esta el riesgo. Si
# un punto de presencia guarda un ngsw.json viejo, el dispositivo del voluntario se
# queda con una version anterior de la aplicacion y NO HAY FORMA de corregir un
# error en campo sin que la desinstale. Por eso van con no-store y por eso la
# politica de cache de la distribucion tiene MinTTL 0: para que ese no-store sea de
# verdad y no una sugerencia.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
RAIZ_REPO="$(cd "$AQUI/../.." && pwd)"

if [ ! -f "$SALIDA/front.env" ]; then
  echo "ERROR: falta entorno/generado/front.env. Corra antes ./desplegar-front.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$SALIDA/front.env"

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

DIST="$RAIZ_REPO/frontend/dist/frontend/browser"

echo "==> compilando la PWA"
# El contrato compartido primero: la PWA lo importa y si no esta compilado, el
# build de Angular falla con un error que habla de modulos y no de esto.
( cd "$RAIZ_REPO" && npm run build --workspace @raiz/dominio >/dev/null )
( cd "$RAIZ_REPO/frontend" && npm run build >/dev/null )

if [ ! -f "$DIST/index.html" ]; then
  echo "ERROR: no se genero $DIST/index.html" >&2
  exit 1
fi
echo "    lista"

# La comprobacion vale la pena porque el fallo contrario es silencioso: una PWA
# publicada con apiUrl vacio funciona —captura y guarda— y no sincroniza nunca.
# Nadie ve un error; simplemente los casos no llegan.
echo ""
echo "==> comprobando que apunta a la API"
if grep -rq "api.apoyo-colombia.com" "$DIST"; then
  echo "    si: la direccion de la API esta dentro del paquete"
else
  echo "ERROR: el paquete no contiene la direccion de la API." >&2
  echo "       Se compilo en modo local y no sincronizaria nunca." >&2
  echo "       Revise fileReplacements en frontend/angular.json." >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. Primero lo inmutable
# -----------------------------------------------------------------------------
echo ""
echo "==> subiendo lo que lleva hash en el nombre"
aws_ s3 sync "$DIST" "s3://$RAIZ_FRONT_BUCKET/" \
  --exclude "index.html" \
  --exclude "ngsw.json" \
  --exclude "ngsw-worker.js" \
  --exclude "safety-worker.js" \
  --exclude "worker-basic.min.js" \
  --cache-control "public, max-age=31536000, immutable" \
  --only-show-errors
echo "    subido"

# -----------------------------------------------------------------------------
# 2. Despues lo que no se puede cachear
# -----------------------------------------------------------------------------
echo ""
echo "==> subiendo el index y el service worker"
for archivo in index.html ngsw.json ngsw-worker.js safety-worker.js worker-basic.min.js; do
  [ -f "$DIST/$archivo" ] || continue
  case "$archivo" in
    *.html) TIPO="text/html; charset=utf-8" ;;
    *.json) TIPO="application/json" ;;
    *.js)   TIPO="text/javascript; charset=utf-8" ;;
    *)      TIPO="application/octet-stream" ;;
  esac
  aws_ s3 cp "$DIST/$archivo" "s3://$RAIZ_FRONT_BUCKET/$archivo" \
    --cache-control "no-store, must-revalidate" \
    --content-type "$TIPO" \
    --only-show-errors
  echo "    $archivo"
done

# -----------------------------------------------------------------------------
# 3. LO VIEJO NO SE BORRA, Y ES DELIBERADO
# -----------------------------------------------------------------------------
# Aqui habia un `sync --delete` que retiraba los paquetes de la version anterior.
# Se quito, porque hacia dano justo a quien peor lo pasa.
#
# Un celular que quedo abierto en la vereda sigue corriendo la version anterior.
# Si pide un fragmento que ya se borro, recibe un 404 —que nuestra regla convierte
# en index.html con codigo 200— y el navegador intenta interpretar HTML como
# JavaScript. La aplicacion se rompe en la mano del voluntario por una limpieza
# que no le hacia falta a nadie.
#
# Conservarlos cuesta unos cientos de kilobytes por entrega. El bucket puede
# acumular cien versiones y seguir siendo irrelevante frente a los 50 USD del
# presupuesto. El dia que estorbe, se retiran las de hace meses a mano, mirando.
#
# Que los nombres lleven hash es lo que hace esto seguro: nada se pisa, todo
# convive.

# -----------------------------------------------------------------------------
# 4. Invalidar
# -----------------------------------------------------------------------------
# Solo los tres sin hash. Invalidar "/*" tambien funcionaria, pero AWS regala mil
# rutas al mes y cobra las siguientes: con "/*" cada publicacion gasta una, y con
# esta lista tambien — la diferencia es que si algun dia hay que invalidar de
# verdad, no se llego al limite publicando.
#
# Los paquetes con hash NO se invalidan y no hace falta: su nombre ya cambio, asi
# que el punto de presencia no tiene nada guardado bajo ese nombre.
echo ""
echo "==> invalidando"
INV="$(aws_ cloudfront create-invalidation \
  --distribution-id "$RAIZ_FRONT_DISTRIBUCION" \
  --paths "/index.html" "/ngsw.json" "/ngsw-worker.js" \
  --query 'Invalidation.Id' --output text)"
echo "    $INV, esperando..."
aws_ cloudfront wait invalidation-completed \
  --distribution-id "$RAIZ_FRONT_DISTRIBUCION" --id "$INV"
echo "    completada"

echo ""
echo "==> listo"
echo "    $RAIZ_FRONT_URL"
