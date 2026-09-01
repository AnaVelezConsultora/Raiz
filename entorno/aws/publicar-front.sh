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

. "$AQUI/cuenta-correcta.sh"
aws_() { aws --region "$REGION" $PERFIL_FLAG "$@"; }
exigir_cuenta_de_raiz

# -----------------------------------------------------------------------------
# DONDE PUBLICAR: SE PREGUNTA, NO SE LEE DE UN ARCHIVO
# -----------------------------------------------------------------------------
#
# Esto leia `entorno/generado/front.env`, que lo escribe `desplegar-front.sh` y que por
# lo tanto vive en UNA maquina: la de quien levanto la infraestructura. El efecto era
# que solo esa persona podia publicar la aplicacion, y cuando no estaba disponible no
# habia despliegue. Tampoco servia desde un corredor de CI, que empieza siempre en
# blanco.
#
# El bucket se llama por la cuenta y la distribucion se reconoce por su comentario, que
# es como ya se buscaban la subred y el grupo de seguridad para las migraciones. Un
# archivo generado menos es una persona indispensable menos.
#
# Si alguna vez hace falta apuntar a otro sitio —una copia, una prueba— se declara al
# llamar y entonces es una decision:
#
#   RAIZ_FRONT_BUCKET=otro ./publicar-front.sh
if [ -z "${RAIZ_FRONT_BUCKET:-}" ]; then
  RAIZ_FRONT_BUCKET="raiz-front-$RAIZ_CUENTA"
fi

if [ -z "${RAIZ_FRONT_DISTRIBUCION:-}" ]; then
  RAIZ_FRONT_DISTRIBUCION="$(aws_ cloudfront list-distributions     --query "DistributionList.Items[?Comment=='PWA de Raiz'] | [0].Id" --output text 2>/dev/null || true)"
fi

if [ -z "$RAIZ_FRONT_DISTRIBUCION" ] || [ "$RAIZ_FRONT_DISTRIBUCION" = "None" ]; then
  echo "ERROR: no se encontro la distribucion de CloudFront de la PWA." >&2
  echo "       Corra antes ./desplegar-front.sh, o declare RAIZ_FRONT_DISTRIBUCION." >&2
  exit 1
fi

RAIZ_FRONT_URL="${RAIZ_FRONT_URL:-https://apoyo-colombia.com}"

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

# La version que va a quedar publicada, para que quede en el registro de la entrega.
# Sale del mismo sitio que el pie de la aplicacion, asi que lo que se lee aqui es
# exactamente lo que va a leer el voluntario en el celular.
VERSION="$(node -p "require('$RAIZ_REPO/frontend/package.json').version")"

# -----------------------------------------------------------------------------
# La aplicacion no se publica adelantada a su servidor
# -----------------------------------------------------------------------------
#
# POR QUE ESTA COMPROBACION
#
# El despliegue de la API corre por su propio flujo y aplica migraciones antes de
# recibir trafico. Este guion, en cambio, lo lanza una persona. Nada impedia subir
# una aplicacion nueva contra un servidor viejo, y el fallo de eso no se ve: los
# campos que el servidor no conoce NO dan error, se ignoran en silencio. El
# voluntario llena "personas fallecidas", ve que guarda, sincroniza sin aviso, y el
# dato no queda en ninguna parte. Nadie se entera hasta que alguien pregunta por
# una cifra que nunca existio.
#
# Por eso se compara con lo que responde /salud, que desde la version 0.2.0 dice
# que version esta corriendo alla.
#
# COMO SALTARSELA, CUANDO DE VERDAD TOCA
#
#   RAIZ_PUBLICAR_ADELANTADO=1 ./publicar-front.sh
#
# Sirve para una correccion que solo toca la interfaz. Se pide a proposito escribir
# eso: la decision queda tomada por alguien y no por omision.
API_URL="$(grep -oE "https://[a-z0-9.-]+" "$RAIZ_REPO/frontend/src/environments/environment.prod.ts" | head -1)"

if [ -n "$API_URL" ] && [ "${RAIZ_PUBLICAR_ADELANTADO:-0}" != "1" ]; then
  echo ""
  echo "==> comprobando la version que corre en la API"
  VERSION_API="$(curl -s -m 20 "$API_URL/salud" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).version ?? ""' 2>/dev/null || true)"

  if [ -z "$VERSION_API" ]; then
    echo "ERROR: no se pudo leer la version de $API_URL/salud." >&2
    echo "       O la API no responde, o corre una version anterior a la 0.2.0." >&2
    echo "       Despliegue primero la API. Para publicar igual:" >&2
    echo "         RAIZ_PUBLICAR_ADELANTADO=1 $0" >&2
    exit 1
  fi

  if [ "$VERSION_API" != "$VERSION" ]; then
    echo "ERROR: la aplicacion es la $VERSION y la API que responde es la $VERSION_API." >&2
    echo "       Publicarla asi haria que los campos nuevos se pierdan en silencio." >&2
    echo "       Despliegue primero la API. Si el cambio es solo de interfaz:" >&2
    echo "         RAIZ_PUBLICAR_ADELANTADO=1 $0" >&2
    exit 1
  fi

  echo "    la API responde la $VERSION_API: coinciden"
fi

echo ""
echo "==> publicando la version $VERSION"

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
# -----------------------------------------------------------------------------
# EL SERVICE WORKER LLEVA LA VERSION ADENTRO, Y NO ES DECORACION
# -----------------------------------------------------------------------------
#
# `ngsw-worker.js` es identico byte a byte en todas las compilaciones: es codigo de
# Angular, no de esta aplicacion. El navegador solo reinstala un service worker
# cuando su ARCHIVO cambia, asi que un worker instalado hace semanas se queda
# corriendo para siempre, aunque la aplicacion se actualice a diario.
#
# Eso importa porque UN SERVICE WORKER CONSERVA LA POLITICA DE SEGURIDAD CON LA QUE
# SE INSTALO. Cuando se agrego el bucket de fotografias a `connect-src`, los
# telefonos recibieron la aplicacion nueva y siguieron con el worker viejo: las
# peticiones al almacenamiento se bloqueaban dentro del worker, y como Angular
# convierte un fetch fallido en un `504 Gateway Timeout` sintetico y sin cuerpo, lo
# que se veia en la vereda era «el almacenamiento respondio 504» — un mensaje que
# no menciona ni la politica ni el worker.
#
# Con la version escrita dentro, cada entrega produce un archivo distinto, el
# navegador instala el worker nuevo y la politica viaja con el.
echo ""
echo "==> sellando el service worker con la version"
printf '\n// Raiz %s — esta linea existe para que el navegador reinstale el worker.\n' \
  "$VERSION" >> "$DIST/ngsw-worker.js"
echo "    ngsw-worker.js lleva $VERSION"

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

# QUE EL GUION TERMINE SIN ERROR NO DICE QUE LA APLICACION ABRA. Esto si lo dice, y es
# la ultima oportunidad de enterarse antes que un voluntario en una vereda.
echo ""
echo "==> comprobando que la aplicacion abre"
CODIGO="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$RAIZ_FRONT_URL/" || true)"
if [ "$CODIGO" != "200" ]; then
  echo "ERROR: $RAIZ_FRONT_URL respondio $CODIGO despues de publicar." >&2
  exit 1
fi
echo "    abre"

echo ""
echo "==> listo"
echo "    $RAIZ_FRONT_URL   (version $VERSION)"
