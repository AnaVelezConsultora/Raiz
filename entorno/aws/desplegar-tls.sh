#!/bin/sh
# =============================================================================
# TLS y nombre propio para la API: api.apoyo-colombia.com.
#
#   ./desplegar-tls.sh
#
# Requiere que ./desplegar-api.sh haya corrido: necesita el balanceador.
# Es IDEMPOTENTE: si el escucha o el registro ya estan, los deja como deben estar
# en vez de crear otros.
#
# -----------------------------------------------------------------------------
# POR QUE ESTO NO ERA OPCIONAL
# -----------------------------------------------------------------------------
#
# `POST /sesion` lleva la clave del voluntario en el cuerpo. Sobre HTTP esa clave
# viaja en claro por internet, y con ella se escribe en el padron de familias
# damnificadas. Mientras el balanceador escuchaba solo en 80, el despliegue servia
# para comprobar que funcionaba y para nada mas.
#
# El bloqueo anterior era no tener dominio: un certificado de ACM se emite contra
# un nombre, y el proyecto no tenia ninguno. Con apoyo-colombia.com en Route 53 y
# el comodin ya emitido, deja de haber excusa.
#
# -----------------------------------------------------------------------------
# EL 80 NO SE CIERRA: REDIRIGE
# -----------------------------------------------------------------------------
#
# Es tentador quitar el escucha de 80 y quedarse solo con 443. No se hace, y la
# razon es el voluntario: un cliente mal configurado, un enlace viejo pegado en el
# grupo de WhatsApp o alguien que escribe la direccion sin `https://` acabaria con
# una conexion rechazada y sin ninguna pista de por que.
#
# Con la redireccion 301 esa peticion llega a su destino cifrada. Lo que NO puede
# pasar es que el 80 siga sirviendo la API, y por eso su unica accion es redirigir:
# no queda ninguna ruta por la que una clave viaje en claro.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

DOMINIO="apoyo-colombia.com"
NOMBRE_API="api.$DOMINIO"
BALANCEADOR="raiz-alb"

# TLS 1.2 como minimo, con 1.3 disponible. No se usa una politica que admita 1.0 o
# 1.1 "por compatibilidad": quien se conecta es la PWA en un navegador actual y la
# CLI del equipo, no un cliente de hace diez anos.
POLITICA_TLS="ELBSecurityPolicy-TLS13-1-2-2021-06"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"

for f in red.env cluster.env api.env; do
  if [ ! -f "$SALIDA/$f" ]; then
    echo "ERROR: falta entorno/generado/$f. Corra antes ./desplegar-api.sh" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$SALIDA/$f"
done

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
. "$AQUI/cuenta-correcta.sh"
exigir_cuenta_de_raiz

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> balanceador"
ARN_ALB="$(aws_ elbv2 describe-load-balancers --names "$BALANCEADOR" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
DNS_ALB="$(aws_ elbv2 describe-load-balancers --load-balancer-arns "$ARN_ALB" \
  --query 'LoadBalancers[0].DNSName' --output text)"
ZONA_ALB="$(aws_ elbv2 describe-load-balancers --load-balancer-arns "$ARN_ALB" \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)"
echo "    $DNS_ALB"

# -----------------------------------------------------------------------------
# 1. El certificado
# -----------------------------------------------------------------------------
# Se busca por dominio y no se escribe el ARN aqui: un certificado se renueva y se
# reemplaza, y un identificador pegado en un guion es lo que hace que el dia de la
# renovacion alguien tenga que acordarse de venir a editarlo.
echo ""
echo "==> certificado"
ARN_CERT="$(aws_ acm list-certificates --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='$DOMINIO'] | [0].CertificateArn" --output text)"

if [ -z "$ARN_CERT" ] || [ "$ARN_CERT" = "None" ]; then
  echo "ERROR: no hay certificado emitido para $DOMINIO en $REGION" >&2
  exit 1
fi

# Se comprueba que cubra el nombre de la API. Un certificado de apoyo-colombia.com
# sin el comodin serviria para el frente y no para api.apoyo-colombia.com, y el
# fallo aparecerìa en el navegador del voluntario, no aqui.
CUBRE="$(aws_ acm describe-certificate --certificate-arn "$ARN_CERT" \
  --query "Certificate.SubjectAlternativeNames[?@=='*.$DOMINIO'] | [0]" --output text)"
if [ "$CUBRE" != "*.$DOMINIO" ]; then
  echo "ERROR: el certificado no cubre *.$DOMINIO, asi que no sirve para $NOMBRE_API" >&2
  exit 1
fi
echo "    $ARN_CERT"
echo "    cubre $DOMINIO y *.$DOMINIO"

# -----------------------------------------------------------------------------
# 2. Escucha en 443
# -----------------------------------------------------------------------------
echo ""
echo "==> escucha en 443"
ARN_443="$(aws_ elbv2 describe-listeners --load-balancer-arn "$ARN_ALB" \
  --query "Listeners[?Port==\`443\`] | [0].ListenerArn" --output text 2>/dev/null || true)"

if [ -z "$ARN_443" ] || [ "$ARN_443" = "None" ]; then
  aws_ elbv2 create-listener \
    --load-balancer-arn "$ARN_ALB" \
    --protocol HTTPS --port 443 \
    --certificates "CertificateArn=$ARN_CERT" \
    --ssl-policy "$POLITICA_TLS" \
    --default-actions "Type=forward,TargetGroupArn=$RAIZ_GRUPO_DESTINO" >/dev/null
  echo "    creada, politica $POLITICA_TLS"
else
  # Se reconcilia en vez de darla por buena: si alguien la creo a mano con otra
  # politica o con el certificado anterior, esto lo corrige.
  aws_ elbv2 modify-listener --listener-arn "$ARN_443" \
    --certificates "CertificateArn=$ARN_CERT" \
    --ssl-policy "$POLITICA_TLS" \
    --default-actions "Type=forward,TargetGroupArn=$RAIZ_GRUPO_DESTINO" >/dev/null
  echo "    ya existia, reconciliada"
fi

# -----------------------------------------------------------------------------
# 3. El 80 pasa a redirigir
# -----------------------------------------------------------------------------
# 301 y no 302: es permanente y los navegadores la recuerdan, de modo que la
# segunda visita ya no pasa por el puerto en claro.
echo ""
echo "==> escucha en 80"
ARN_80="$(aws_ elbv2 describe-listeners --load-balancer-arn "$ARN_ALB" \
  --query "Listeners[?Port==\`80\`] | [0].ListenerArn" --output text 2>/dev/null || true)"

cat >"$TMP/redirigir.json" <<'JSON'
[{
  "Type": "redirect",
  "RedirectConfig": {
    "Protocol": "HTTPS",
    "Port": "443",
    "Host": "#{host}",
    "Path": "/#{path}",
    "Query": "#{query}",
    "StatusCode": "HTTP_301"
  }
}]
JSON

if [ -z "$ARN_80" ] || [ "$ARN_80" = "None" ]; then
  aws_ elbv2 create-listener \
    --load-balancer-arn "$ARN_ALB" \
    --protocol HTTP --port 80 \
    --default-actions "file://$TMP/redirigir.json" >/dev/null
  echo "    creada, redirige a 443"
else
  aws_ elbv2 modify-listener --listener-arn "$ARN_80" \
    --default-actions "file://$TMP/redirigir.json" >/dev/null
  echo "    ya no sirve la API: redirige 301 a 443"
fi

# -----------------------------------------------------------------------------
# 4. El nombre
# -----------------------------------------------------------------------------
# Registro de tipo A con alias, no CNAME. Dos razones: un alias a un balanceador
# no se cobra por consulta, y CNAME no se puede poner en la raiz de la zona — hoy
# da igual porque esto es un subdominio, pero el frente va a necesitar la raiz y
# conviene que los dos se resuelvan de la misma manera.
echo ""
echo "==> registro DNS"
ZONA_ID="$(aws_ route53 list-hosted-zones \
  --query "HostedZones[?Name=='$DOMINIO.'] | [0].Id" --output text)"
if [ -z "$ZONA_ID" ] || [ "$ZONA_ID" = "None" ]; then
  echo "ERROR: no hay zona alojada para $DOMINIO" >&2
  exit 1
fi

cat >"$TMP/registro.json" <<JSON
{
  "Comment": "API de Raiz. Gestionado por entorno/aws/desplegar-tls.sh",
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "$NOMBRE_API",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "$ZONA_ALB",
        "DNSName": "$DNS_ALB",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
JSON

# UPSERT y no CREATE: crea si no esta y corrige si esta, que es lo que hace que
# volver a correr esto sea seguro y que un balanceador reemplazado se arregle
# solo.
CAMBIO="$(aws_ route53 change-resource-record-sets --hosted-zone-id "$ZONA_ID" \
  --change-batch "file://$TMP/registro.json" --query 'ChangeInfo.Id' --output text)"
echo "    $NOMBRE_API -> $DNS_ALB"
echo "    esperando a que el cambio se propague..."
aws_ route53 wait resource-record-sets-changed --id "$CAMBIO"
echo "    propagado"

# -----------------------------------------------------------------------------
# 5. Variables
# -----------------------------------------------------------------------------
cat >"$SALIDA/api.env" <<ENV
# Generado por entorno/aws/desplegar-api.sh y desplegar-tls.sh.
# No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
RAIZ_API_URL=https://$NOMBRE_API
RAIZ_API_DOMINIO=$NOMBRE_API
RAIZ_ALB_ARN=$ARN_ALB
RAIZ_ALB_DNS=$DNS_ALB
RAIZ_GRUPO_DESTINO=$RAIZ_GRUPO_DESTINO
RAIZ_CERTIFICADO=$ARN_CERT
ENV

echo ""
echo "==> variables en entorno/generado/api.env"
sed 's/^/    /' "$SALIDA/api.env"

echo ""
echo "==> listo"
echo "    API en:  https://$NOMBRE_API"
echo ""
echo "    El certificado lo renueva ACM solo, siempre que el registro CNAME de"
echo "    validacion siga en la zona. No se borra."
