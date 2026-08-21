#!/bin/sh
# =============================================================================
# Red de Raiz en AWS: VPC, subredes, salida a internet y grupos de seguridad.
# Parte de la HU 1.1.1.
#
#   ./desplegar-red.sh
#
# Es IDEMPOTENTE: busca cada recurso por su etiqueta Name y solo crea lo que
# falte. Correrlo diez veces deja lo mismo que correrlo una.
#
# QUE ESCRIBE
#
# entorno/generado/red.env, que no se versiona. Lo leen desplegar-base.sh y
# desplegar-api.sh.
#
# -----------------------------------------------------------------------------
# LAS TRES DECISIONES QUE ESTE ARCHIVO CIERRA
# -----------------------------------------------------------------------------
#
# 1. SIN PUERTA DE ENLACE NAT. Es criterio de aceptacion de la HU 1.1.1 y una de
#    las tres trampas de factura que enumera el ADR 002: ~32 USD/mes por existir,
#    haya trafico o no. Sobre un presupuesto de 50 es dos tercios del total.
#
#    La alternativa de manual —endpoints de interfaz de VPC— NO se usa aqui, y
#    conviene decir por que porque parece lo obvio: hacen falta cuatro (ecr.api,
#    ecr.dkr, logs, secretsmanager) a ~7,3 USD/mes cada uno. Son ~29 USD: se
#    cambia una trampa de 32 por una de 29 y se cree haber ahorrado.
#
#    Lo que se hace en cambio: la tarea de Fargate va en subred PUBLICA con IP
#    publica, que es como alcanza ECR, CloudWatch y Cognito sin intermediario y
#    sin costo. "Subred publica" no significa "expuesta": quien decide que entra
#    es el grupo de seguridad, y el de la API solo acepta al balanceador. La
#    unica salvedad honesta es que la tarea tiene una IP publica saliente; no
#    hay ningun puerto abierto detras de ella.
#
# 2. LA BASE NO RECIBE TRAFICO PUBLICO. Va en subredes privadas de verdad —su
#    tabla de rutas no tiene salida a internet— y su grupo de seguridad acepta
#    en 5432 unicamente al grupo de la API. No por rango de IP: por grupo, que
#    es lo que sigue siendo cierto cuando la tarea se recicla y cambia de IP.
#
# 3. DOS ZONAS DE DISPONIBILIDAD. No por alta disponibilidad —esto atiende 0,03
#    escrituras por segundo— sino porque el balanceador exige dos subredes en
#    zonas distintas y el grupo de subredes de RDS tambien. Es un requisito de
#    la nube, no una decision de arquitectura, y no cuesta nada.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

VPC_CIDR="10.20.0.0/16"
ZONA_A="${REGION}a"
ZONA_B="${REGION}b"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
mkdir -p "$SALIDA"

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
. "$AQUI/cuenta-correcta.sh"
exigir_cuenta_de_raiz

# Todo este archivo es idempotente por lo mismo: cada recurso se busca por su
# etiqueta Name Y por la VPC, para no encontrar por accidente un homonimo de otro
# proyecto en la misma cuenta. Aqui conviven nestjs-vpc y proyecto-vpc, que no son
# nuestros.

etiquetar() { # etiquetar <id> <nombre>
  aws_ ec2 create-tags --resources "$1" \
    --tags "Key=Name,Value=$2" "Key=Proyecto,Value=Raiz" "Key=Gestion,Value=entorno/aws/desplegar-red.sh"
}

echo "==> cuenta y region"
CUENTA="$(aws_ sts get-caller-identity --query 'Account' --output text)"
echo "    cuenta: $CUENTA   region: $REGION   perfil: $PERFIL"

# -----------------------------------------------------------------------------
# 1. La VPC
# -----------------------------------------------------------------------------
echo ""
echo "==> VPC"
VPC_ID="$(aws_ ec2 describe-vpcs --filters "Name=tag:Name,Values=raiz-vpc" \
  --query 'Vpcs[0].VpcId' --output text)"

if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
  VPC_ID="$(aws_ ec2 create-vpc --cidr-block "$VPC_CIDR" \
    --query 'Vpc.VpcId' --output text)"
  etiquetar "$VPC_ID" "raiz-vpc"
  # Sin estos dos, RDS no entrega un nombre resoluble y la API termina
  # conectandose por IP a una base que puede cambiar de IP al recuperarse de un
  # fallo. Es de las cosas que solo se notan el peor dia.
  aws_ ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support
  aws_ ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames
  echo "    creada: $VPC_ID  $VPC_CIDR"
else
  echo "    ya existia: $VPC_ID"
fi

# -----------------------------------------------------------------------------
# 2. Subredes
# -----------------------------------------------------------------------------
subred() { # subred <nombre> <cidr> <zona> <publica: si|no>
  nombre="$1"; cidr="$2"; zona="$3"; publica="$4"
  id="$(aws_ ec2 describe-subnets \
    --filters "Name=tag:Name,Values=$nombre" "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[0].SubnetId' --output text)"
  if [ "$id" = "None" ] || [ -z "$id" ]; then
    id="$(aws_ ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block "$cidr" \
      --availability-zone "$zona" --query 'Subnet.SubnetId' --output text)"
    etiquetar "$id" "$nombre"
    if [ "$publica" = "si" ]; then
      # La tarea de Fargate necesita IP publica para alcanzar ECR y Cognito sin
      # NAT. Se pone en la subred y no en el servicio para que no dependa de que
      # alguien se acuerde de pedirla al desplegar.
      aws_ ec2 modify-subnet-attribute --subnet-id "$id" --map-public-ip-on-launch >/dev/null
    fi
    echo "    creada: $nombre  $id  $cidr  $zona" >&2
  else
    echo "    ya existia: $nombre  $id" >&2
  fi
  echo "$id"
}

echo ""
echo "==> subredes publicas (balanceador y tarea)"
PUB_A="$(subred raiz-publica-a 10.20.0.0/24  "$ZONA_A" si | tail -1)"
PUB_B="$(subred raiz-publica-b 10.20.1.0/24  "$ZONA_B" si | tail -1)"

echo ""
echo "==> subredes privadas (base de datos)"
PRIV_A="$(subred raiz-privada-a 10.20.10.0/24 "$ZONA_A" no | tail -1)"
PRIV_B="$(subred raiz-privada-b 10.20.11.0/24 "$ZONA_B" no | tail -1)"

# -----------------------------------------------------------------------------
# 3. Salida a internet, solo para las publicas
# -----------------------------------------------------------------------------
echo ""
echo "==> puerta de enlace a internet"
IGW_ID="$(aws_ ec2 describe-internet-gateways --filters "Name=tag:Name,Values=raiz-igw" \
  --query 'InternetGateways[0].InternetGatewayId' --output text)"
if [ "$IGW_ID" = "None" ] || [ -z "$IGW_ID" ]; then
  IGW_ID="$(aws_ ec2 create-internet-gateway --query 'InternetGateway.InternetGatewayId' --output text)"
  etiquetar "$IGW_ID" "raiz-igw"
  echo "    creada: $IGW_ID"
else
  echo "    ya existia: $IGW_ID"
fi

# La puerta de enlace a internet no cuesta nada. La que cuesta es la NAT, que es
# otra cosa y no esta aqui.
ADJUNTA="$(aws_ ec2 describe-internet-gateways --internet-gateway-ids "$IGW_ID" \
  --query "InternetGateways[0].Attachments[?VpcId=='$VPC_ID'] | [0].State" --output text)"
if [ "$ADJUNTA" = "None" ] || [ -z "$ADJUNTA" ]; then
  aws_ ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
  echo "    adjuntada a $VPC_ID"
else
  echo "    ya estaba adjuntada"
fi

echo ""
echo "==> tabla de rutas publica"
RT_PUB="$(aws_ ec2 describe-route-tables \
  --filters "Name=tag:Name,Values=raiz-rutas-publicas" "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[0].RouteTableId' --output text)"
if [ "$RT_PUB" = "None" ] || [ -z "$RT_PUB" ]; then
  RT_PUB="$(aws_ ec2 create-route-table --vpc-id "$VPC_ID" \
    --query 'RouteTable.RouteTableId' --output text)"
  etiquetar "$RT_PUB" "raiz-rutas-publicas"
  aws_ ec2 create-route --route-table-id "$RT_PUB" \
    --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" >/dev/null
  echo "    creada: $RT_PUB  con ruta 0.0.0.0/0 -> $IGW_ID"
else
  echo "    ya existia: $RT_PUB"
fi

for s in "$PUB_A" "$PUB_B"; do
  YA="$(aws_ ec2 describe-route-tables --route-table-ids "$RT_PUB" \
    --query "RouteTables[0].Associations[?SubnetId=='$s'] | [0].RouteTableAssociationId" --output text)"
  if [ "$YA" = "None" ] || [ -z "$YA" ]; then
    aws_ ec2 associate-route-table --route-table-id "$RT_PUB" --subnet-id "$s" >/dev/null
    echo "    asociada a $s"
  fi
done

# Las subredes privadas se quedan con la tabla principal de la VPC, que solo
# tiene la ruta local. No se les crea tabla propia: no hay nada que rutear. Que
# la base no tenga camino de salida es una propiedad que se quiere, no un olvido.
echo ""
echo "==> subredes privadas: sin ruta a internet, a proposito"

# -----------------------------------------------------------------------------
# 4. Endpoint de S3, que es gratis
# -----------------------------------------------------------------------------
# De tipo Gateway, no Interface: los Gateway no cuestan. Sirve para que las
# fotografias que suba la API a S3 no salgan y vuelvan por internet, y de paso
# para las capas de imagen que ECR guarda en S3.
echo ""
echo "==> endpoint de S3 (gateway, sin costo)"
EP_S3="$(aws_ ec2 describe-vpc-endpoints \
  --filters "Name=tag:Name,Values=raiz-endpoint-s3" "Name=vpc-id,Values=$VPC_ID" \
  --query 'VpcEndpoints[0].VpcEndpointId' --output text)"
if [ "$EP_S3" = "None" ] || [ -z "$EP_S3" ]; then
  EP_S3="$(aws_ ec2 create-vpc-endpoint --vpc-id "$VPC_ID" \
    --service-name "com.amazonaws.$REGION.s3" \
    --vpc-endpoint-type Gateway \
    --route-table-ids "$RT_PUB" \
    --query 'VpcEndpoint.VpcEndpointId' --output text)"
  etiquetar "$EP_S3" "raiz-endpoint-s3"
  echo "    creado: $EP_S3"
else
  echo "    ya existia: $EP_S3"
fi

# -----------------------------------------------------------------------------
# 5. Grupos de seguridad
# -----------------------------------------------------------------------------
# Tres, en cadena: internet -> balanceador -> API -> base. Cada eslabon nombra al
# anterior POR GRUPO y no por rango de IP. Una tarea de Fargate cambia de IP cada
# vez que se recicla; el grupo no cambia nunca, asi que la regla sigue siendo
# cierta sin que nadie la mantenga.
grupo() { # grupo <nombre> <descripcion>
  nombre="$1"; desc="$2"
  id="$(aws_ ec2 describe-security-groups \
    --filters "Name=group-name,Values=$nombre" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text)"
  if [ "$id" = "None" ] || [ -z "$id" ]; then
    id="$(aws_ ec2 create-security-group --group-name "$nombre" \
      --description "$desc" --vpc-id "$VPC_ID" --query 'GroupId' --output text)"
    etiquetar "$id" "$nombre"
    echo "    creado: $nombre  $id" >&2
  else
    echo "    ya existia: $nombre  $id" >&2
  fi
  echo "$id"
}

echo ""
echo "==> grupos de seguridad"
SG_ALB="$(grupo raiz-sg-balanceador 'Entrada publica al balanceador de Raiz')"
SG_API="$(grupo raiz-sg-api          'Tarea de la API de Raiz. Solo acepta al balanceador.')"
SG_BASE="$(grupo raiz-sg-base        'PostgreSQL de Raiz. Solo acepta a la API.')"

# authorize-* falla con InvalidPermission.Duplicate si la regla ya esta. Se
# ignora ese caso concreto en vez de consultar antes: es una llamada menos y el
# resultado es el mismo.
permitir_cidr() { # permitir_cidr <grupo> <puerto> <cidr>
  aws_ ec2 authorize-security-group-ingress --group-id "$1" \
    --protocol tcp --port "$2" --cidr "$3" >/dev/null 2>&1 \
    && echo "    $1 acepta $3 en $2" \
    || echo "    $1 ya aceptaba $3 en $2"
}
permitir_grupo() { # permitir_grupo <grupo> <puerto> <grupo origen>
  aws_ ec2 authorize-security-group-ingress --group-id "$1" \
    --protocol tcp --port "$2" --source-group "$3" >/dev/null 2>&1 \
    && echo "    $1 acepta a $3 en $2" \
    || echo "    $1 ya aceptaba a $3 en $2"
}

echo ""
echo "==> reglas"
# 80 se abre para redirigir a 443, no para servir. Nada de familias viaja en
# claro: quien llegue por 80 recibe un 301 del balanceador.
permitir_cidr  "$SG_ALB"  80  0.0.0.0/0
permitir_cidr  "$SG_ALB"  443 0.0.0.0/0
permitir_grupo "$SG_API"  8080 "$SG_ALB"
permitir_grupo "$SG_BASE" 5432 "$SG_API"

# El grupo de la base NO tiene ninguna regla con un CIDR. Si algun dia aparece
# una, alguien abrio la base a internet y hay que revertirlo, no discutirlo.

# -----------------------------------------------------------------------------
# 6. Variables para los guiones que siguen
# -----------------------------------------------------------------------------
cat >"$SALIDA/red.env" <<ENV
# Generado por entorno/aws/desplegar-red.sh. No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
AWS_REGION=$REGION
RAIZ_VPC_ID=$VPC_ID
RAIZ_SUBRED_PUB_A=$PUB_A
RAIZ_SUBRED_PUB_B=$PUB_B
RAIZ_SUBRED_PRIV_A=$PRIV_A
RAIZ_SUBRED_PRIV_B=$PRIV_B
RAIZ_SG_BALANCEADOR=$SG_ALB
RAIZ_SG_API=$SG_API
RAIZ_SG_BASE=$SG_BASE
ENV

echo ""
echo "==> variables en entorno/generado/red.env"
sed 's/^/    /' "$SALIDA/red.env"

echo ""
echo "==> listo"
echo "    Sin NAT y sin endpoints de interfaz: costo de red recurrente, 0 USD."
echo "    Siguiente: ./desplegar-base.sh"
