#!/bin/sh
# =============================================================================
# La PWA servida desde CloudFront: apoyo-colombia.com y www.
#
#   ./desplegar-front.sh
#
# Crea el bucket, la distribucion y los registros DNS. NO sube la aplicacion:
# eso lo hace ./publicar-front.sh, que es un paso aparte y se repite en cada
# entrega.
#
# Es IDEMPOTENTE. La distribucion se reconcilia con lo que dice este archivo, de
# modo que un cambio hecho a mano en la consola se revierte al volver a correrlo.
#
# TARDA. Crear o modificar una distribucion son entre 5 y 15 minutos mientras
# CloudFront la propaga a sus puntos de presencia.
#
# -----------------------------------------------------------------------------
# EL BUCKET NO ES PUBLICO, Y LA DISTRIBUCION NO ES UN DETALLE DE RENDIMIENTO
# -----------------------------------------------------------------------------
#
# Un bucket de S3 servido directo al mundo es la forma corta de publicar un sitio
# estatico, y aqui no se usa. El bucket lleva los cuatro bloqueos de acceso
# publico —criterio de la HU 1.1.1— y la unica forma de leerlo es a traves de
# CloudFront, que se identifica con un control de acceso de origen.
#
# La razon no es el rendimiento. Es que sobre un bucket publico no se pueden poner
# las cabeceras que esta aplicacion necesita: la politica de seguridad de contenido
# que impide que un script ajeno lea los casos guardados en el dispositivo, y HTTPS
# obligatorio. Eso vive en la distribucion, y la distribucion solo tiene sentido si
# el bucket no se puede saltar.
#
# -----------------------------------------------------------------------------
# POR QUE 403 Y 404 DEVUELVEN index.html CON CODIGO 200
# -----------------------------------------------------------------------------
#
# Angular resuelve las rutas en el navegador. Si alguien recarga estando en
# /casos, S3 busca un archivo llamado "casos" y no existe. Sin esta regla el
# voluntario ve un error al recargar, que en campo se lee como "la aplicacion se
# dano".
#
# Se atienden los DOS codigos: con el control de acceso de origen, S3 responde 403
# —y no 404— a una clave que no existe, porque no se le concede permiso de listar
# el bucket. Atender solo el 404 dejaria el problema intacto.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

DOMINIO="apoyo-colombia.com"
ALIAS_WWW="www.$DOMINIO"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
mkdir -p "$SALIDA"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

echo "==> cuenta"
CUENTA="$(aws_ sts get-caller-identity --query 'Account' --output text)"
BUCKET="raiz-front-$CUENTA"
echo "    cuenta: $CUENTA"
echo "    bucket: $BUCKET"

# -----------------------------------------------------------------------------
# 1. El bucket
# -----------------------------------------------------------------------------
echo ""
echo "==> bucket"
if aws_ s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "    ya existia"
else
  # us-east-1 es la unica region donde create-bucket NO lleva
  # LocationConstraint. Mandarselo ahi es un error, y no mandarselo en cualquier
  # otra region crea el bucket en el sitio equivocado.
  if [ "$REGION" = "us-east-1" ]; then
    aws_ s3api create-bucket --bucket "$BUCKET" >/dev/null
  else
    aws_ s3api create-bucket --bucket "$BUCKET" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
  echo "    creado"
fi

# Los CUATRO bloqueos, que es el criterio de la HU 1.1.1 escrito con esas
# palabras. Son cuatro y no uno porque cubren cosas distintas: dos impiden poner
# permisos publicos nuevos y dos ignoran los que ya hubiera. Con solo los primeros,
# un permiso puesto ayer seguiria surtiendo efecto.
aws_ s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
echo "    los cuatro bloqueos de acceso publico, activos"

aws_ s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Versionado: aqui no hay datos de familias, pero si una publicacion mala. Poder
# volver al objeto anterior es la diferencia entre corregir en un minuto y
# reconstruir bajo presion.
aws_ s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
echo "    cifrado y versionado"

# -----------------------------------------------------------------------------
# 2. Control de acceso de origen
# -----------------------------------------------------------------------------
# Reemplaza a la identidad de acceso de origen, que es lo que sale en los tutoriales
# viejos. Firma con SigV4 y es lo unico que S3 va a aceptar.
echo ""
echo "==> control de acceso de origen"
OAC_ID="$(aws_ cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='raiz-front'].Id | [0]" --output text 2>/dev/null || true)"
if [ -z "$OAC_ID" ] || [ "$OAC_ID" = "None" ]; then
  OAC_ID="$(aws_ cloudfront create-origin-access-control \
    --origin-access-control-config "{
      \"Name\": \"raiz-front\",
      \"Description\": \"CloudFront leyendo el bucket de la PWA de Raiz\",
      \"SigningProtocol\": \"sigv4\",
      \"SigningBehavior\": \"always\",
      \"OriginAccessControlOriginType\": \"s3\"
    }" --query 'OriginAccessControl.Id' --output text)"
  echo "    creado: $OAC_ID"
else
  echo "    ya existia: $OAC_ID"
fi

# -----------------------------------------------------------------------------
# 3. Politica de cache
# -----------------------------------------------------------------------------
# MinTTL en 0 A PROPOSITO, y es la linea que mas importa de este bloque.
#
# Las politicas administradas de AWS traen MinTTL 1. Con eso, un objeto marcado
# `no-cache` se guarda igual un segundo en cada punto de presencia. Para ngsw.json
# eso significa que un dispositivo puede recibir un manifiesto viejo, y entonces la
# aplicacion se queda en una version anterior sin forma de corregirla en campo sin
# que el voluntario desinstale.
#
# Con MinTTL 0, CloudFront respeta el Cache-Control que trae cada objeto desde S3.
# Quien decide cuanto dura cada cosa es publicar-front.sh al subirla, que es donde
# se sabe si el archivo lleva hash en el nombre o no.
echo ""
echo "==> politica de cache"
CACHE_ID="$(aws_ cloudfront list-cache-policies --type custom \
  --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='raiz-front'].CachePolicy.Id | [0]" \
  --output text 2>/dev/null || true)"
if [ -z "$CACHE_ID" ] || [ "$CACHE_ID" = "None" ]; then
  CACHE_ID="$(aws_ cloudfront create-cache-policy --cache-policy-config '{
    "Name": "raiz-front",
    "Comment": "Respeta el Cache-Control del origen. MinTTL 0 para que no-cache sea de verdad.",
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "MinTTL": 0,
    "ParametersInCacheKeyAndForwardedToOrigin": {
      "EnableAcceptEncodingGzip": true,
      "EnableAcceptEncodingBrotli": true,
      "HeadersConfig": { "HeaderBehavior": "none" },
      "CookiesConfig": { "CookieBehavior": "none" },
      "QueryStringsConfig": { "QueryStringBehavior": "none" }
    }
  }' --query 'CachePolicy.Id' --output text)"
  echo "    creada: $CACHE_ID"
else
  echo "    ya existia: $CACHE_ID"
fi

# -----------------------------------------------------------------------------
# 4. Cabeceras de respuesta
# -----------------------------------------------------------------------------
# Es la traduccion de lo que netlify.toml declaraba, con dos cambios. Ese archivo se
# retiro al salir Netlify; las cabeceras estaban bien pensadas y se conservan aqui,
# que ahora es el unico sitio donde viven.
#
# connect-src SE CIERRA. Decia `https:` con este comentario: "la direccion de la
# API todavia no esta decidida. Cuando lo este, se reemplaza por ese origen y nada
# mas". Ya esta decidida. Con `https:` la politica evitaba el robo por script
# inyectado; con el origen fijo evita ademas que ese script MANDE los casos a un
# servidor ajeno, que es la mitad que faltaba.
#
# HSTS SE AGREGA, con subdominios y sin preload. Sin preload a proposito: la lista
# de precarga de los navegadores es practicamente irreversible y no se entra en ella
# por si acaso. Con subdominios si, porque api.apoyo-colombia.com ya es HTTPS y el
# dia que alguien monte un subdominio en claro, es mejor que se entere.
#
# style-src sigue admitiendo estilos en linea. Es la concesion consciente que ya
# estaba declarada, y se cierra el dia que esos estilos se muevan a la hoja.
#
# -----------------------------------------------------------------------------
# EL BUCKET DE FOTOGRAFIAS TIENE QUE ESTAR EN connect-src
# -----------------------------------------------------------------------------
#
# El celular sube cada bloque DIRECTO al almacenamiento, no a traves de la API, y
# para el navegador eso es otro origen. Sin este permiso el navegador cancela cada
# bloque antes de que salga, y el error que muestra habla de la politica de
# seguridad, no de fotografias: se ve como una foto que no sube y nadie sabe por
# que.
#
# Va el bucket EXACTO, con su region, no `https:` ni un comodin sobre
# `*.amazonaws.com`. Un comodin ahi seria permitir que un script inyectado mande
# los casos de las familias a cualquier bucket de cualquier cuenta de AWS, que es
# justamente lo que esta politica existe para impedir.
BUCKET_FOTOS="${S3_BUCKET_FOTOS:-raiz-fotos-$CUENTA}"
ORIGEN_FOTOS="https://$BUCKET_FOTOS.s3.$REGION.amazonaws.com"

CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.$DOMINIO $ORIGEN_FOTOS; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

cat >"$TMP/cabeceras.json" <<JSON
{
  "Name": "raiz-front",
  "Comment": "Endurecimiento de la PWA de Raiz. Datos personales de poblacion vulnerable.",
  "SecurityHeadersConfig": {
    "ContentSecurityPolicy": { "ContentSecurityPolicy": "$CSP", "Override": true },
    "ContentTypeOptions": { "Override": true },
    "FrameOptions": { "FrameOption": "DENY", "Override": true },
    "ReferrerPolicy": { "ReferrerPolicy": "strict-origin-when-cross-origin", "Override": true },
    "StrictTransportSecurity": {
      "AccessControlMaxAgeSec": 31536000,
      "IncludeSubdomains": true,
      "Preload": false,
      "Override": true
    }
  },
  "CustomHeadersConfig": {
    "Quantity": 1,
    "Items": [{
      "Header": "Permissions-Policy",
      "Value": "geolocation=(self), camera=(self), microphone=()",
      "Override": true
    }]
  }
}
JSON

# geolocation y camera en `self` y no vacio: la captura del caso necesita las dos.
# microphone vacio porque no se usa, y lo que no se usa se apaga.

echo ""
echo "==> politica de cabeceras"
CAB_ID="$(aws_ cloudfront list-response-headers-policies --type custom \
  --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='raiz-front'].ResponseHeadersPolicy.Id | [0]" \
  --output text 2>/dev/null || true)"
if [ -z "$CAB_ID" ] || [ "$CAB_ID" = "None" ]; then
  CAB_ID="$(aws_ cloudfront create-response-headers-policy \
    --response-headers-policy-config "file://$TMP/cabeceras.json" \
    --query 'ResponseHeadersPolicy.Id' --output text)"
  echo "    creada: $CAB_ID"
else
  # Se reconcilia. Si alguien aflojo la politica de seguridad de contenido en la
  # consola, esto la devuelve a lo que dice este archivo.
  ETAG="$(aws_ cloudfront get-response-headers-policy --id "$CAB_ID" --query 'ETag' --output text)"
  aws_ cloudfront update-response-headers-policy --id "$CAB_ID" --if-match "$ETAG" \
    --response-headers-policy-config "file://$TMP/cabeceras.json" >/dev/null
  echo "    ya existia, reconciliada: $CAB_ID"
fi

# -----------------------------------------------------------------------------
# 5. El certificado
# -----------------------------------------------------------------------------
# CloudFront SOLO acepta certificados de us-east-1, sin importar donde este todo lo
# demas. El nuestro ya vive ahi por casualidad afortunada; si algun dia la region
# del proyecto cambia, este certificado se queda.
echo ""
echo "==> certificado"
ARN_CERT="$(aws --region us-east-1 --profile "$PERFIL" acm list-certificates \
  --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='$DOMINIO'] | [0].CertificateArn" --output text)"
if [ -z "$ARN_CERT" ] || [ "$ARN_CERT" = "None" ]; then
  echo "ERROR: no hay certificado emitido para $DOMINIO en us-east-1" >&2
  exit 1
fi
echo "    $ARN_CERT"

# -----------------------------------------------------------------------------
# 6. La distribucion
# -----------------------------------------------------------------------------
REF="raiz-front"
ORIGEN="$BUCKET.s3.$REGION.amazonaws.com"

cat >"$TMP/distribucion.json" <<JSON
{
  "CallerReference": "$REF",
  "Comment": "PWA de Raiz",
  "Aliases": { "Quantity": 2, "Items": ["$DOMINIO", "$ALIAS_WWW"] },
  "DefaultRootObject": "index.html",
  "Enabled": true,
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "PriceClass": "PriceClass_100",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-raiz-front",
      "DomainName": "$ORIGEN",
      "OriginAccessControlId": "$OAC_ID",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-raiz-front",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
    },
    "Compress": true,
    "CachePolicyId": "$CACHE_ID",
    "ResponseHeadersPolicyId": "$CAB_ID"
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {
        "ErrorCode": 403,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 10
      },
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 10
      }
    ]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "$ARN_CERT",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021",
    "CertificateSource": "acm"
  },
  "Logging": { "Enabled": false, "IncludeCookies": false, "Bucket": "", "Prefix": "" }
}
JSON

# `Logging` va explicito aunque este apagado, y no sobra: CREAR una distribucion
# sin ese bloque funciona, pero ACTUALIZARLA falla con «Logging is missing for the
# resource». Es decir, el guion servia la primera vez y se rompia la segunda —
# justo cuando hay que cambiar algo con la aplicacion ya publicada.
#
# Apagado a proposito: los registros de acceso de CloudFront guardan la IP de cada
# visitante en un bucket propio. Aqui eso seria acumular datos de quien consulta el
# mapa publico sin haberlo decidido, y sin ninguna pregunta que responder con
# ellos. El dia que haga falta, se enciende con una decision escrita.

# PriceClass_100 son los puntos de presencia de America del Norte y Europa. Los de
# America del Sur estan en las clases caras, y desde Colombia se sale igual por
# Miami con unos milisegundos mas. En una aplicacion que funciona sin conexion,
# esos milisegundos no compran nada.
#
# Solo GET y HEAD. La PWA no manda formularios aqui: lo que escribe va a la API,
# que es otro origen. Permitir POST sobre un bucket estatico no habilita nada y
# amplia la superficie.
#
# ErrorCachingMinTTL en 10 y no en el valor por omision de 300: si se publica un
# archivo que faltaba, el error deja de servirse en diez segundos y no en cinco
# minutos.

echo ""
echo "==> distribucion"
DIST_ID="$(aws_ cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='PWA de Raiz'] | [0].Id" --output text 2>/dev/null || true)"

if [ -z "$DIST_ID" ] || [ "$DIST_ID" = "None" ]; then
  DIST_ID="$(aws_ cloudfront create-distribution \
    --distribution-config "file://$TMP/distribucion.json" \
    --query 'Distribution.Id' --output text)"
  echo "    creada: $DIST_ID"
else
  # -----------------------------------------------------------------------------
  # Se FUNDE la plantilla sobre la configuracion actual, no se reemplaza.
  #
  # `update-distribution` exige la configuracion COMPLETA: cualquier campo que no
  # se mande se toma como intento de quitarlo y responde «X is missing for the
  # resource». Mandando solo lo que este archivo declara, el guion funcionaba la
  # primera vez —al crear— y fallaba la segunda, que es cuando hace falta.
  #
  # Se descubrio agregando el bucket de fotografias a la politica de seguridad, con
  # la aplicacion ya publicada. Primero falto `Logging`, y al ponerlo aparecio
  # `WebACLId`: la lista es larga y no vale la pena adivinarla.
  #
  # Fundir tiene ademas la propiedad correcta: este guion manda sobre lo que
  # declara —origenes, alias, politicas, certificado— y no toca lo que no conoce.
  # -----------------------------------------------------------------------------
  aws_ cloudfront get-distribution-config --id "$DIST_ID" > "$TMP/actual.json"
  ETAG="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["ETag"])' "$TMP/actual.json")"

  python3 - "$TMP/actual.json" "$TMP/distribucion.json" <<'PY'
import json, sys


def fundir(actual, nuestro):
    """Lo que este archivo declara manda; lo que no declara se conserva.

    Recursiva porque los campos obligatorios que CloudFront exige estan ANIDADOS:
    el primero que falto fue `Logging`, arriba del todo, pero el siguiente fue
    `OriginCustomHeaders`, dentro del origen. Una fusion de primer nivel deja
    igual de rota la segunda corrida.

    Las listas se funden por posicion. En esta configuracion son listas de una
    sola entrada —un origen, un comportamiento— asi que la posicion es identidad
    suficiente; si algun dia hay dos origenes, esto hay que mirarlo de nuevo.
    """
    if isinstance(actual, dict) and isinstance(nuestro, dict):
        salida = dict(actual)
        for clave, valor in nuestro.items():
            salida[clave] = fundir(actual.get(clave), valor)
        return salida

    if isinstance(actual, list) and isinstance(nuestro, list) and len(actual) == len(nuestro):
        return [fundir(a, n) for a, n in zip(actual, nuestro)]

    return nuestro


actual = json.load(open(sys.argv[1]))["DistributionConfig"]
nuestra = json.load(open(sys.argv[2]))

# CallerReference no se puede cambiar: manda siempre el que ya tiene la
# distribucion, no el que este archivo genero.
nuestra["CallerReference"] = actual["CallerReference"]

json.dump(fundir(actual, nuestra), open(sys.argv[2], "w"))
PY

  aws_ cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" \
    --distribution-config "file://$TMP/distribucion.json" >/dev/null
  echo "    ya existia, reconciliada: $DIST_ID"
fi

DIST_DOMINIO="$(aws_ cloudfront get-distribution --id "$DIST_ID" \
  --query 'Distribution.DomainName' --output text)"
DIST_ARN="$(aws_ cloudfront get-distribution --id "$DIST_ID" \
  --query 'Distribution.ARN' --output text)"
echo "    $DIST_DOMINIO"

# -----------------------------------------------------------------------------
# 7. El permiso del bucket
# -----------------------------------------------------------------------------
# Va DESPUES de crear la distribucion porque nombra su identificador. La condicion
# de origen es lo que impide que otra distribucion de otra cuenta —la de cualquiera
# que adivine el nombre del bucket— pueda leerlo.
cat >"$TMP/politica-bucket.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "SoloNuestraDistribucion",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*",
    "Condition": { "StringEquals": { "AWS:SourceArn": "$DIST_ARN" } }
  }]
}
JSON

echo ""
echo "==> permiso del bucket"
aws_ s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$TMP/politica-bucket.json"
echo "    solo $DIST_ID puede leerlo"

# -----------------------------------------------------------------------------
# 8. Los nombres
# -----------------------------------------------------------------------------
# Z2FDTNDATAQYW2 es la zona alojada de CloudFront. Es fija, la misma para todas las
# cuentas del mundo, y no se consulta: AWS la publica como constante.
#
# A y AAAA. El registro AAAA no es adorno: en Colombia hay operadores moviles que
# entregan IPv6 al celular, y sin AAAA esos dispositivos resuelven por una via de
# traduccion que a veces falla justo donde la senal es mala.
echo ""
echo "==> registros DNS"
ZONA_ID="$(aws_ route53 list-hosted-zones \
  --query "HostedZones[?Name=='$DOMINIO.'] | [0].Id" --output text)"
if [ -z "$ZONA_ID" ] || [ "$ZONA_ID" = "None" ]; then
  echo "ERROR: no hay zona alojada para $DOMINIO" >&2
  exit 1
fi

cat >"$TMP/registros.json" <<JSON
{
  "Comment": "PWA de Raiz. Gestionado por entorno/aws/desplegar-front.sh",
  "Changes": [
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "$DOMINIO", "Type": "A",
        "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "$DIST_DOMINIO", "EvaluateTargetHealth": false } } },
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "$DOMINIO", "Type": "AAAA",
        "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "$DIST_DOMINIO", "EvaluateTargetHealth": false } } },
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "$ALIAS_WWW", "Type": "A",
        "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "$DIST_DOMINIO", "EvaluateTargetHealth": false } } },
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "$ALIAS_WWW", "Type": "AAAA",
        "AliasTarget": { "HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "$DIST_DOMINIO", "EvaluateTargetHealth": false } } }
  ]
}
JSON

CAMBIO="$(aws_ route53 change-resource-record-sets --hosted-zone-id "$ZONA_ID" \
  --change-batch "file://$TMP/registros.json" --query 'ChangeInfo.Id' --output text)"
echo "    $DOMINIO y $ALIAS_WWW -> $DIST_DOMINIO  (A y AAAA)"
aws_ route53 wait resource-record-sets-changed --id "$CAMBIO"
echo "    propagado"

# -----------------------------------------------------------------------------
# 9. Variables
# -----------------------------------------------------------------------------
cat >"$SALIDA/front.env" <<ENV
# Generado por entorno/aws/desplegar-front.sh. No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
RAIZ_FRONT_BUCKET=$BUCKET
RAIZ_FRONT_DISTRIBUCION=$DIST_ID
RAIZ_FRONT_DOMINIO_CF=$DIST_DOMINIO
RAIZ_FRONT_URL=https://$DOMINIO
ENV

echo ""
echo "==> variables en entorno/generado/front.env"
sed 's/^/    /' "$SALIDA/front.env"

echo ""
echo "==> esperando a que CloudFront propague (5 a 15 minutos)"
aws_ cloudfront wait distribution-deployed --id "$DIST_ID"
echo "    desplegada"

echo ""
echo "==> listo"
echo "    Todavia no hay nada que servir. Suba la aplicacion:"
echo "      ./publicar-front.sh"
