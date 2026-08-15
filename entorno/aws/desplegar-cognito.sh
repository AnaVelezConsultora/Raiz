#!/bin/sh
# =============================================================================
# Crea en AWS real el pool de Cognito de Raiz y todo lo que necesita para que la
# PWA y la API puedan entrar.
#
#   ./desplegar-cognito.sh
#
# Es IDEMPOTENTE: si el pool ya existe lo reutiliza y solo agrega lo que falte.
# Se puede correr las veces que haga falta sin duplicar nada.
#
# QUE ESCRIBE Y DONDE
#
# Los identificadores generados van a entorno/generado/nube.env, que esta en
# .gitignore. NADA de esto se versiona: el dia que haya CI/CD, estas mismas
# variables se cargan como secretos del pipeline y este archivo deja de existir.
#
# POR QUE UN SCRIPT Y NO LA CONSOLA DE AWS
#
# Porque lo que se hace a mano en una consola no se puede repetir, ni revisar, ni
# explicar seis meses despues. Esto es HU 1.1.1 —infraestructura reproducible
# desde codigo— resuelta con lo minimo que sirve; cuando haya tiempo se pasa a
# CDK, que ya esta inicializado en la cuenta.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"
POOL_NOMBRE="raiz-voluntarios"
CLIENTE_NOMBRE="raiz-pwa"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
mkdir -p "$SALIDA"

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

echo "==> cuenta y region"
aws_ sts get-caller-identity --query 'Account' --output text | sed 's/^/    cuenta: /'
echo "    region: $REGION   perfil: $PERFIL"

# -----------------------------------------------------------------------------
# 1. El pool
# -----------------------------------------------------------------------------
echo ""
echo "==> pool de usuarios"
POOL_ID="$(aws_ cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?Name=='$POOL_NOMBRE'].Id | [0]" --output text)"

if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "None" ]; then
  # Se entra con CORREO, no con un alias: el voluntario ya sabe su correo y no
  # hay que ensenarle un identificador nuevo en medio de una emergencia.
  #
  # La politica de clave pide 8 caracteres y no exige simbolos raros. Una clave
  # que no se puede recordar se anota en un papel dentro del mismo bolso donde va
  # el celular, y eso es peor que una clave mas simple.
  POOL_ID="$(aws_ cognito-idp create-user-pool \
    --pool-name "$POOL_NOMBRE" \
    --username-attributes email \
    --auto-verified-attributes email \
    --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":false,"TemporaryPasswordValidityDays":7}}' \
    --schema '[
      {"Name":"name","AttributeDataType":"String","Mutable":true,"Required":true},
      {"Name":"phone_number","AttributeDataType":"String","Mutable":true,"Required":false}
    ]' \
    --account-recovery-setting '{"RecoveryMechanisms":[{"Priority":1,"Name":"verified_email"}]}' \
    --user-pool-tags "Proyecto=Raiz,Ambiente=transitorio,Datos=sensibles" \
    --query 'UserPool.Id' --output text)"
  echo "    creado: $POOL_ID"
else
  echo "    ya existia: $POOL_ID"
fi

# -----------------------------------------------------------------------------
# 2. El cliente que usa la PWA
# -----------------------------------------------------------------------------
echo ""
echo "==> cliente de aplicacion"
CLIENTE_ID="$(aws_ cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" --max-results 60 \
  --query "UserPoolClients[?ClientName=='$CLIENTE_NOMBRE'].ClientId | [0]" --output text)"

if [ -z "$CLIENTE_ID" ] || [ "$CLIENTE_ID" = "None" ]; then
  # SIN SECRETO, y es deliberado. Quien llama a InitiateAuth es la API, no el
  # navegador, asi que un secreto seria defendible; pero el entorno local crea el
  # cliente sin secreto y tener configuraciones distintas entre local y nube es
  # exactamente como se producen los fallos que solo aparecen en produccion.
  # Si algun dia se agrega, la API ya sabe calcular SECRET_HASH: basta con
  # ponerle COGNITO_CLIENT_SECRET.
  #
  # ALLOW_USER_PASSWORD_AUTH es obligatorio: es el flujo que usa POST /sesion.
  CLIENTE_ID="$(aws_ cognito-idp create-user-pool-client \
    --user-pool-id "$POOL_ID" \
    --client-name "$CLIENTE_NOMBRE" \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --refresh-token-validity 30 \
    --access-token-validity 12 \
    --token-validity-units '{"AccessToken":"hours","RefreshToken":"days"}' \
    --prevent-user-existence-errors ENABLED \
    --query 'UserPoolClient.ClientId' --output text)"
  echo "    creado: $CLIENTE_ID"
else
  echo "    ya existia: $CLIENTE_ID"
fi

# El token de acceso dura 12 horas a proposito: una jornada de campo completa.
# Mas corto obliga a reconectar en el monte, que es justo lo que no se puede.

# -----------------------------------------------------------------------------
# 3. Variables para la API y la PWA
# -----------------------------------------------------------------------------
EMISOR="https://cognito-idp.$REGION.amazonaws.com/$POOL_ID"

cat >"$SALIDA/nube.env" <<ENV
# Generado por entorno/aws/desplegar-cognito.sh. No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
AWS_REGION=$REGION
COGNITO_USER_POOL_ID=$POOL_ID
COGNITO_CLIENT_ID=$CLIENTE_ID
COGNITO_ISSUER=$EMISOR
COGNITO_JWKS_URI=$EMISOR/.well-known/jwks.json
# El cliente se crea SIN secreto. Si alguna vez se le pone uno, agregar aqui:
# COGNITO_CLIENT_SECRET=...
ENV

echo ""
echo "==> variables en entorno/generado/nube.env"
sed 's/^/    /' "$SALIDA/nube.env"

echo ""
echo "==> listo"
echo "    Para crear voluntarios:  ./crear-voluntario.sh correo@ejemplo.com 'Nombre Apellido'"
echo ""
echo "    RECUERDE: mientras no exista la Lambda de post-confirmacion (HU 1.2.7),"
echo "    un usuario de Cognito NO tiene fila en 'perfiles' y el ingreso falla con"
echo "    'su cuenta existe pero todavia no tiene perfil asignado'."
