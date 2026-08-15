#!/bin/sh
# =============================================================================
# Base de datos de Raiz en RDS. Parte de la HU 1.1.1.
#
#   ./desplegar-base.sh
#
# Requiere que ./desplegar-red.sh haya corrido: lee entorno/generado/red.env.
# Es IDEMPOTENTE: si la instancia ya existe la reutiliza y no toca las claves.
#
# TARDA. Crear la instancia son entre 8 y 12 minutos, y el guion espera.
#
# -----------------------------------------------------------------------------
# POSTGRESQL 16, EL MISMO QUE EN LOCAL
# -----------------------------------------------------------------------------
#
# El entorno local corre postgis/postgis:16-3.4. Aqui va PostgreSQL 16 con la
# extension PostGIS que trae RDS. Misma version mayor a proposito: el sentido de
# que `supabase/schema.sql` sea EL MISMO ARCHIVO en los dos lados se pierde el dia
# que las versiones se separan y algo se comporta distinto en uno solo.
#
# -----------------------------------------------------------------------------
# DOS CREDENCIALES, NO UNA, Y POR QUE
# -----------------------------------------------------------------------------
#
#   raiz_admin  -> dueno de la base. Crea extensiones, aplica migraciones.
#                  NO la usa la API. Vive en el secreto raiz/base-admin.
#   raiz_api    -> con lo que se conecta la API. Sin privilegios propios: por
#                  cada peticion hace SET LOCAL ROLE authenticated (pool.ts).
#                  Vive en el secreto raiz/base-api, como URL completa.
#
# Que la API no sea duena de las tablas no es pulcritud: PostgreSQL OMITE las
# politicas de acceso por fila para el dueno. Conectarse como administrador
# apagaria RLS entero sin un solo mensaje de error, y todo seguiria "funcionando".
#
# -----------------------------------------------------------------------------
# LO QUE ESTA INSTANCIA NO TIENE, DICHO ANTES DE QUE ALGUIEN LO DESCUBRA
# -----------------------------------------------------------------------------
#
# - Sin Multi-AZ. Duplica el costo y esto atiende 0,03 escrituras por segundo. El
#   dato que no puede perderse vive en el celular del voluntario hasta que el
#   servidor confirma, asi que una caida de la base retrasa la sincronizacion, no
#   borra nada.
# - Sin proteccion contra borrado, HOY. La HU 1.1.1 pide poder destruir el entorno
#   completo, y la proteccion lo impide. El dia que entre la primera familia real
#   hay que ponerla en true; queda anotado aqui porque ese dia nadie va a estar
#   leyendo este archivo.
# - Sin rotacion automatica de claves. Las claves se generan una vez y quedan en
#   Secrets Manager. Rotarlas exige un Lambda y una ventana de reconexion.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

INSTANCIA="raiz-base"
GRUPO_SUBREDES="raiz-subredes-base"
VERSION_PG="16.14"
CLASE="db.t4g.micro"
BASE="raiz"
USUARIO_ADMIN="raiz_admin"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"

if [ ! -f "$SALIDA/red.env" ]; then
  echo "ERROR: falta entorno/generado/red.env. Corra antes ./desplegar-red.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$SALIDA/red.env"

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

# Clave de 32 caracteres del alfabeto que RDS acepta sin quejarse. Se excluyen
# '/', '@', '"', ' ' y ''' porque RDS los rechaza, y ademas romperian la URL de
# conexion que se arma mas abajo.
clave() {
  LC_ALL=C tr -dc 'A-Za-z0-9._~-' </dev/urandom | head -c 32
}

# El valor va por --secret-string en un archivo temporal y no en la linea de
# comandos: los argumentos de un proceso los lee cualquiera con `ps` en la misma
# maquina, y una clave de base de datos no tiene por que pasar por ahi.
guardar_secreto() { # guardar_secreto <nombre> <valor> <descripcion>
  nombre="$1"; valor="$2"; desc="$3"
  archivo="$(mktemp)"
  chmod 600 "$archivo"
  printf '%s' "$valor" >"$archivo"

  if aws_ secretsmanager describe-secret --secret-id "$nombre" >/dev/null 2>&1; then
    # No se sobrescribe. Si el secreto ya esta, la instancia tambien, y pisar la
    # clave aqui la dejaria distinta de la que la base realmente acepta.
    echo "    ya existia, se conserva: $nombre"
  else
    aws_ secretsmanager create-secret \
      --name "$nombre" \
      --description "$desc" \
      --secret-string "file://$archivo" \
      --tags "Key=Proyecto,Value=Raiz" >/dev/null
    echo "    creado: $nombre"
  fi
  rm -f "$archivo"
}

echo "==> cuenta y region"
CUENTA="$(aws_ sts get-caller-identity --query 'Account' --output text)"
echo "    cuenta: $CUENTA   region: $REGION"
echo "    vpc:    $RAIZ_VPC_ID"

# -----------------------------------------------------------------------------
# 1. Grupo de subredes: donde puede vivir la instancia
# -----------------------------------------------------------------------------
# Las DOS son privadas. Este grupo es la mitad de la garantia de que la base no
# recibe trafico publico; la otra mitad es --no-publicly-accessible mas abajo.
echo ""
echo "==> grupo de subredes"
YA="$(aws_ rds describe-db-subnet-groups --db-subnet-group-name "$GRUPO_SUBREDES" \
  --query 'DBSubnetGroups[0].DBSubnetGroupName' --output text 2>/dev/null || true)"
if [ -z "$YA" ] || [ "$YA" = "None" ]; then
  aws_ rds create-db-subnet-group \
    --db-subnet-group-name "$GRUPO_SUBREDES" \
    --db-subnet-group-description "Subredes privadas de Raiz. Sin ruta a internet." \
    --subnet-ids "$RAIZ_SUBRED_PRIV_A" "$RAIZ_SUBRED_PRIV_B" \
    --tags "Key=Proyecto,Value=Raiz" >/dev/null
  echo "    creado: $GRUPO_SUBREDES"
else
  echo "    ya existia: $GRUPO_SUBREDES"
fi

# -----------------------------------------------------------------------------
# 2. La instancia
# -----------------------------------------------------------------------------
echo ""
echo "==> instancia"
ESTADO="$(aws_ rds describe-db-instances --db-instance-identifier "$INSTANCIA" \
  --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || true)"

if [ -z "$ESTADO" ] || [ "$ESTADO" = "None" ]; then
  CLAVE_ADMIN="$(clave)"

  aws_ rds create-db-instance \
    --db-instance-identifier "$INSTANCIA" \
    --db-name "$BASE" \
    --engine postgres \
    --engine-version "$VERSION_PG" \
    --db-instance-class "$CLASE" \
    --master-username "$USUARIO_ADMIN" \
    --master-user-password "$CLAVE_ADMIN" \
    --allocated-storage 20 \
    --storage-type gp3 \
    --storage-encrypted \
    --db-subnet-group-name "$GRUPO_SUBREDES" \
    --vpc-security-group-ids "$RAIZ_SG_BASE" \
    --no-publicly-accessible \
    --no-multi-az \
    --backup-retention-period 7 \
    --preferred-backup-window "07:00-08:00" \
    --auto-minor-version-upgrade \
    --copy-tags-to-snapshot \
    --no-deletion-protection \
    --tags "Key=Proyecto,Value=Raiz" "Key=Datos,Value=sensibles" \
           "Key=Gestion,Value=entorno/aws/desplegar-base.sh" >/dev/null

  echo "    creando: $INSTANCIA  $CLASE  PostgreSQL $VERSION_PG"

  # La clave del administrador se guarda ANTES de esperar. Si el guion se corta a
  # mitad de la espera —se cierra la terminal, se cae la red— la instancia sigue
  # creandose en AWS y la clave se habria perdido con el proceso. Recuperarse de
  # eso obliga a resetear la clave maestra de una base que ya existe.
  echo ""
  echo "==> secreto del administrador"
  guardar_secreto raiz/base-admin \
    "{\"usuario\":\"$USUARIO_ADMIN\",\"clave\":\"$CLAVE_ADMIN\",\"base\":\"$BASE\"}" \
    "Clave del administrador de la base de Raiz. NO la usa la API."
else
  echo "    ya existia: $INSTANCIA  estado $ESTADO"
fi

# -----------------------------------------------------------------------------
# 3. Esperar a que responda
# -----------------------------------------------------------------------------
echo ""
echo "==> esperando a que la instancia este disponible (8 a 12 minutos)"
aws_ rds wait db-instance-available --db-instance-identifier "$INSTANCIA"

ANFITRION="$(aws_ rds describe-db-instances --db-instance-identifier "$INSTANCIA" \
  --query 'DBInstances[0].Endpoint.Address' --output text)"
PUERTO_BASE="$(aws_ rds describe-db-instances --db-instance-identifier "$INSTANCIA" \
  --query 'DBInstances[0].Endpoint.Port' --output text)"

echo "    disponible: $ANFITRION:$PUERTO_BASE"

# -----------------------------------------------------------------------------
# 4. El secreto de la API: la URL completa, no las piezas
# -----------------------------------------------------------------------------
# Va aqui y no arriba porque necesita el nombre de la instancia, que RDS asigna
# durante la creacion. Y se comprueba por separado en vez de colgarse del bloque
# de creacion para que un guion interrumpido a mitad se arregle volviendolo a
# correr: si el secreto no esta, se crea, exista o no la instancia.
#
# Se guarda la URL ENTERA y no usuario/clave sueltos porque es lo que la API lee
# —una sola variable, DATABASE_URL, igual que en local— y porque componerla en el
# despliegue significaria que el formato de la cadena vive en dos sitios.
echo ""
echo "==> secreto de la API"
if aws_ secretsmanager describe-secret --secret-id raiz/base-api >/dev/null 2>&1; then
  echo "    ya existia, se conserva: raiz/base-api"
else
  CLAVE_API="$(clave)"
  # sslmode=no-verify: se cifra el trafico pero no se valida el certificado. RDS
  # lo firma con su propia autoridad, que no esta en el almacen de Node, asi que
  # verify-full exigiria llevar el paquete de certificados de Amazon dentro de la
  # imagen. Queda como pendiente ANOTADO, no como olvido: el trafico no sale de la
  # VPC, de modo que esto protege contra escucha pasiva y no contra alguien que ya
  # esta adentro.
  guardar_secreto raiz/base-api \
    "postgresql://raiz_api:$CLAVE_API@$ANFITRION:$PUERTO_BASE/$BASE?sslmode=no-verify" \
    "DATABASE_URL de la API de Raiz. Rol sin privilegios propios."
fi

cat >"$SALIDA/base.env" <<ENV
# Generado por entorno/aws/desplegar-base.sh. No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
RAIZ_BASE_ANFITRION=$ANFITRION
RAIZ_BASE_PUERTO=$PUERTO_BASE
RAIZ_BASE_NOMBRE=$BASE
RAIZ_SECRETO_ADMIN=raiz/base-admin
RAIZ_SECRETO_API=raiz/base-api
ENV

echo ""
echo "==> variables en entorno/generado/base.env"
sed 's/^/    /' "$SALIDA/base.env"

echo ""
echo "==> listo"
echo "    La instancia NO es alcanzable desde aqui: vive en subredes sin ruta a"
echo "    internet y su grupo de seguridad solo acepta al de la API. Eso es lo"
echo "    que se queria, y es la razon de que las migraciones se apliquen desde"
echo "    una tarea dentro de la VPC y no desde la maquina de nadie."
echo ""
echo "    Siguiente: ./aplicar-migraciones.sh"
