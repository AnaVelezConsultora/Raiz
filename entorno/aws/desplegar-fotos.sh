#!/bin/sh
# =============================================================================
# El almacenamiento de las fotografias del dano.
#
#   ./desplegar-fotos.sh
#
# Crea el bucket privado, su CORS, la regla que barre las subidas a medias y el
# permiso que la API necesita para firmar. Es IDEMPOTENTE: correrlo otra vez no
# duplica nada y reconcilia lo que alguien haya cambiado a mano en la consola.
#
# Va DESPUES de desplegar-cluster.sh, porque le agrega una politica al rol de
# tarea que ese guion crea.
#
# -----------------------------------------------------------------------------
# ESTE BUCKET NO ES COMO EL DEL FRONT
# -----------------------------------------------------------------------------
#
# El del front guarda una aplicacion que cualquiera puede descargar. Este guarda
# fotografias de la vivienda de familias identificadas: no son fotos de personas,
# pero cuelgan de un hogar con nombre, cedula y telefono en la base. Una imagen
# accesible por URL directa es un dato personal publicado, y el punto 6 de
# SEGURIDAD.md advierte que es «el control que mas se olvida».
#
# Por eso: cuatro bloqueos de acceso publico, sin politica de bucket que lo abra,
# y ni una sola lectura anonima. Se llega a una foto con firma o no se llega.
#
# -----------------------------------------------------------------------------
# LA REGLA DE CICLO DE VIDA NO ES LIMPIEZA, ES LA FACTURA
# -----------------------------------------------------------------------------
#
# Toda fotografia sube partida en bloques, y cada bloque es un objeto. Cuando la
# imagen se completa, la API los une y los borra. Cuando NO se completa —el
# celular se perdio, la foto se descarto sin senal, el voluntario desinstalo— esos
# pedazos se quedan ocupando espacio facturable para siempre. Con la red de una
# vereda, subidas que nunca terminan va a haber todas las semanas.
#
# Por eso los bloques viven bajo `partes/`, en su propia rama del bucket: asi la
# regla los barre sin ninguna posibilidad de tocar una imagen buena, que vive
# bajo `casos/`.
#
# Siete dias es holgado a proposito: un voluntario puede subir a la vereda el
# lunes y no volver a tener senal hasta el sabado, y su fotografia a medias tiene
# que seguir ahi para reanudarse.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

DOMINIO="apoyo-colombia.com"
ORIGENES="${ORIGENES_PERMITIDOS:-https://$DOMINIO,https://www.$DOMINIO,http://localhost:4200,http://localhost:4300}"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
mkdir -p "$SALIDA"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

echo "==> cuenta"
CUENTA="$(aws_ sts get-caller-identity --query 'Account' --output text)"
BUCKET="${S3_BUCKET_FOTOS:-raiz-fotos-$CUENTA}"
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
  # us-east-1 es la unica region donde create-bucket NO lleva LocationConstraint.
  if [ "$REGION" = "us-east-1" ]; then
    aws_ s3api create-bucket --bucket "$BUCKET" >/dev/null
  else
    aws_ s3api create-bucket --bucket "$BUCKET" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
  echo "    creado"
fi

# -----------------------------------------------------------------------------
# 2. Cerrado al publico
# -----------------------------------------------------------------------------
echo ""
echo "==> acceso publico"
aws_ s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  >/dev/null
echo "    los cuatro bloqueos activos"

# Propiedad de objetos sin listas de control de acceso. Con ACL habilitadas, un
# objeto puede quedar publico por su propia ACL aunque el bucket no lo sea, y esa
# es la via por la que se filtran los archivos de uno en uno.
aws_ s3api put-bucket-ownership-controls \
  --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]' >/dev/null
echo "    ACL deshabilitadas: la unica forma de abrir un objeto seria una politica"

# Cifrado en reposo con la llave administrada de S3. No es KMS a proposito: KMS
# cobra por peticion y con 15.000 fotografias eso se nota, mientras que para este
# riesgo —el disco fisico— las dos protegen igual.
aws_ s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}' \
  >/dev/null
echo "    cifrado en reposo"

# Versionado. Una fotografia sobrescrita o borrada por error se recupera; sin
# esto, un borrado accidental sobre evidencia de dano no tiene vuelta atras.
aws_ s3api put-bucket-versioning \
  --bucket "$BUCKET" --versioning-configuration Status=Enabled >/dev/null
echo "    versionado activo"

# -----------------------------------------------------------------------------
# 3. CORS
# -----------------------------------------------------------------------------
# El navegador del voluntario habla DIRECTO con S3, asi que S3 tiene que
# reconocer el origen desde el que se sirve la PWA.
#
# PUT es el unico metodo de escritura: toda fotografia sube por bloques y cada
# bloque es un objeto con su permiso firmado. Sin PUT la subida falla en el vuelo
# previo y el error del navegador no menciona CORS — lo que se ve es una foto que
# no sube y nadie sabe por que.
echo ""
echo "==> CORS"
ORIGENES_JSON="$(printf '%s' "$ORIGENES" | awk -F, '{for(i=1;i<=NF;i++) printf "%s\"%s\"", (i>1?",":""), $i}')"
cat >"$TMP/cors.json" <<JSON
{
  "CORSRules": [{
    "AllowedOrigins": [$ORIGENES_JSON],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
JSON
aws_ s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "file://$TMP/cors.json" >/dev/null
echo "    origenes: $ORIGENES"

# -----------------------------------------------------------------------------
# 4. Ciclo de vida: las subidas que nadie cerro
# -----------------------------------------------------------------------------
echo ""
echo "==> ciclo de vida"
cat >"$TMP/ciclo.json" <<'JSON'
{
  "Rules": [
    {
      "ID": "abortar-subidas-a-medias",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    },
    {
      "ID": "retirar-versiones-viejas",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 }
    }
  ]
}
JSON
aws_ s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET" --lifecycle-configuration "file://$TMP/ciclo.json" >/dev/null
echo "    subidas a medias: se abortan a los 7 dias"
echo "    versiones desplazadas: se retiran a los 90 dias"

# -----------------------------------------------------------------------------
# 5. Lo que la API puede hacer aqui
# -----------------------------------------------------------------------------
# Las acciones son exactamente las que hace api/src/infra/almacenamiento/s3.ts y
# ni una mas. En particular NO esta `s3:ListBucket`: la API nunca lista el bucket
# —el ADR 003 lo prohibe expresamente, porque listar es de consistencia eventual—
# y sin ese permiso una consulta por prefijo falla en vez de devolver algo
# incompleto que parezca cierto.
#
# `s3:ListMultipartUploadParts` no es listar el bucket: es preguntar por las
# partes de UNA subida concreta, por su identificador, y es lo que sostiene la
# reanudacion.
echo ""
echo "==> permiso de la API"
aws_ iam put-role-policy --role-name raiz-ecs-tarea \
  --policy-name raiz-fotografias \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [
        \"s3:PutObject\",
        \"s3:GetObject\",
        \"s3:DeleteObject\",
        \"s3:AbortMultipartUpload\",
        \"s3:ListMultipartUploadParts\"
      ],
      \"Resource\": \"arn:aws:s3:::$BUCKET/casos/*\"
    }]
  }"
echo "    raiz-ecs-tarea puede firmar y verificar bajo casos/*, y nada mas"

# -----------------------------------------------------------------------------
# 6. Variables
# -----------------------------------------------------------------------------
cat >"$SALIDA/fotos.env" <<ENV
# Generado por entorno/aws/desplegar-fotos.sh. No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
S3_BUCKET_FOTOS=$BUCKET
ENV

echo ""
echo "==> variables en entorno/generado/fotos.env"
sed 's/^/    /' "$SALIDA/fotos.env"

echo ""
echo "==> listo"
echo "    Falta volver a desplegar la API para que reciba S3_BUCKET_FOTOS:"
echo "    ./desplegar-api.sh"
