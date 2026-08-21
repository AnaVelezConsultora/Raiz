#!/bin/sh
# =============================================================================
# Da de alta un voluntario en el pool de Cognito de Raiz.
#
#   ./crear-voluntario.sh beto@ejemplo.com "Beto Perez"
#   ./crear-voluntario.sh beto@ejemplo.com "Beto Perez" "+573001112233"
#
# Es idempotente: si el correo ya existe, no lo duplica ni le cambia la clave.
#
# POR QUE SE CREA ASI Y NO CON REGISTRO ABIERTO
#
# Porque el padron son familias damnificadas y quien lo levanta tiene que ser
# alguien conocido por la mesa. Un formulario de registro abierto significa que
# cualquiera con el enlace puede empezar a escribir en el censo. Aqui alguien de
# la coordinacion da de alta a cada voluntario, uno por uno, y eso es una barrera
# barata contra un problema caro.
# =============================================================================
set -e

CORREO="$1"
NOMBRE="$2"
TELEFONO="$3"

if [ -z "$CORREO" ] || [ -z "$NOMBRE" ]; then
  echo "Uso: ./crear-voluntario.sh <correo> <\"Nombre Apellido\"> [telefono]"
  exit 1
fi

AQUI="$(cd "$(dirname "$0")" && pwd)"
ENV_NUBE="$AQUI/../generado/nube.env"

if [ ! -f "$ENV_NUBE" ]; then
  echo "Falta $ENV_NUBE. Corra primero ./desplegar-cognito.sh"
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_NUBE"

PERFIL="${AWS_PROFILE:-default}"
aws_() { aws --region "$AWS_REGION" --profile "$PERFIL" "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
. "$AQUI/cuenta-correcta.sh"
exigir_cuenta_de_raiz

ya="$(aws_ cognito-idp list-users --user-pool-id "$COGNITO_USER_POOL_ID" \
  --filter "email = \"$CORREO\"" --query 'length(Users)' --output text)"

if [ "$ya" != "0" ]; then
  echo "Ya existe: $CORREO"
  exit 0
fi

# Los atributos se arman como parametros posicionales y no como una cadena. Un
# nombre lleva espacios —"Ana Maria Ejemplo"— y una cadena sin comillas se parte
# en pedazos ahi mismo: la CLI recibe "de" como si fuera un atributo suelto.
set -- \
  "Name=email,Value=$CORREO" \
  "Name=email_verified,Value=true" \
  "Name=name,Value=$NOMBRE"
[ -n "$TELEFONO" ] && set -- "$@" "Name=phone_number,Value=$TELEFONO"

# MessageAction=SUPPRESS: Cognito NO manda correo. Sin dominio de correo propio,
# el que manda AWS cae en spam la mitad de las veces, y una clave temporal que el
# voluntario no recibe es una jornada perdida. Se la entrega la coordinacion por
# el canal que ya usan.
sub="$(aws_ cognito-idp admin-create-user \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --username "$CORREO" \
  --user-attributes "$@" \
  --message-action SUPPRESS \
  --query 'User.Attributes[?Name==`sub`].Value | [0]' --output text)"

# Clave definitiva y no temporal: una clave temporal obliga a un cambio en el
# primer ingreso, y ese cambio es un desafio de Cognito que la API todavia no
# resuelve. Ver ADR 002.
CLAVE="${RAIZ_CLAVE_INICIAL:-Raiz.campo.2026}"
aws_ cognito-idp admin-set-user-password \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --username "$CORREO" \
  --password "$CLAVE" \
  --permanent

echo "Creado: $CORREO"
echo "  sub:   $sub"
echo "  clave: $CLAVE   (entreguela por el canal de la coordinacion, no por correo)"
echo ""
echo "  FALTA su fila en 'perfiles'. Este script solo crea la cuenta en Cognito."
echo "  Lo normal es dar de alta por la API, con POST /voluntarios, que hace las dos"
echo "  cosas. Si prefiere seguir por aqui, inserte a mano en auth.users:"
echo ""
echo "    insert into auth.users (id, email, raw_user_meta_data)"
echo "    values ('$sub', '$CORREO', '{\"nombre\":\"$NOMBRE\"}'::jsonb);"
