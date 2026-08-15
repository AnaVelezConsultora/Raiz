#!/bin/sh
# =============================================================================
# Alerta de presupuesto de Raiz. HU 1.1.4.
#
#   ./desplegar-presupuesto.sh correo@ejemplo.com
#   CORREO_ALERTA=correo@ejemplo.com ./desplegar-presupuesto.sh
#
# Es IDEMPOTENTE: si el presupuesto ya existe le actualiza el monto y las
# notificaciones en vez de crear otro.
#
# POR QUE ESTO VA ANTES QUE CUALQUIER OTRO RECURSO
#
# Es literalmente el criterio de aceptacion de la HU 1.1.4: "alerta de
# presupuesto configurada ANTES del primer despliegue". Y no es formalismo. Lo
# que viene despues —RDS, el balanceador, el cluster— es lo primero de esta
# infraestructura que factura de verdad y por hora, exista o no trafico. Una
# alerta configurada el martes no dice nada de lo que se gasto el lunes: AWS
# empieza a evaluar el presupuesto desde que existe.
#
# Esto es infraestructura financiada por donacion para atender una emergencia.
# Una factura sorpresa aqui no es un problema de ingenieria, es un problema de
# confianza con quien puso el dinero, y de esos no se sale con un commit.
#
# LOS DOS NUMEROS Y DE DONDE SALEN
#
# 50 USD/mes es el techo del rango que estimo el ADR 002 (~30 a 50). No se pone
# 30 porque un presupuesto que grita el primer mes normal deja de leerse.
#
# 150 USD es el gatillo de REVERSION del mismo ADR: "la factura mensual supera
# 150 USD sin que haya crecido el uso" es una de las condiciones que obligan a
# reabrir la decision de irse de Supabase. Se expresa como el umbral de 300 %
# para que ese gatillo lo avise la nube y no la memoria de alguien.
#
# POR QUE UN SCRIPT Y NO LA CONSOLA
#
# Lo mismo que en desplegar-cognito.sh: lo que se hace a mano no se puede
# repetir, ni revisar, ni explicar seis meses despues. Hoy va en CLI por
# velocidad practica; el paso a codigo declarativo se hace despues, por diff
# contra lo que ya exista.
# =============================================================================
set -e

PERFIL="${AWS_PROFILE:-default}"
NOMBRE="raiz-mensual"
MONTO="50"

# Los presupuestos son globales, no regionales: viven en el endpoint de
# us-east-1 pase lo que pase con AWS_REGION.
REGION_BUDGETS="us-east-1"

CORREO="${1:-$CORREO_ALERTA}"
if [ -z "$CORREO" ]; then
  echo "ERROR: falta el correo que recibe la alerta." >&2
  echo "" >&2
  echo "  ./desplegar-presupuesto.sh custodia@ejemplo.org" >&2
  echo "" >&2
  # No se deja un correo por defecto en el guion a proposito. Este repositorio es
  # publico y un correo personal escrito aqui queda indexado para siempre; ademas,
  # el dia que la custodia cambie de manos nadie se acordaria de venir a editarlo.
  echo "No hay valor por defecto: el repositorio es publico y quien" >&2
  echo "recibe la alerta cambia cuando cambia la custodia." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

aws_() { aws --region "$REGION_BUDGETS" --profile "$PERFIL" "$@"; }

echo "==> cuenta"
CUENTA="$(aws_ sts get-caller-identity --query 'Account' --output text)"
echo "    cuenta: $CUENTA   perfil: $PERFIL"
echo "    alerta a: $CORREO"

# -----------------------------------------------------------------------------
# 1. El presupuesto
# -----------------------------------------------------------------------------
# COST y no USAGE: lo que importa es la factura, no cuantas horas corrio nada.
# El periodo es MONTHLY porque asi factura AWS y asi se lee el estado de cuenta.
cat >"$TMP/presupuesto.json" <<JSON
{
  "BudgetName": "$NOMBRE",
  "BudgetLimit": { "Amount": "$MONTO", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST",
  "CostTypes": {
    "IncludeTax": true,
    "IncludeSubscription": true,
    "UseBlended": false,
    "IncludeRefund": false,
    "IncludeCredit": false,
    "IncludeUpfront": true,
    "IncludeRecurring": true,
    "IncludeOtherSubscription": true,
    "IncludeSupport": true,
    "IncludeDiscount": true,
    "UseAmortized": false
  }
}
JSON

# IncludeCredit en false a proposito. Si hay credito promocional en la cuenta y se
# incluye, el presupuesto muestra cero mientras el credito dura y avisa el dia que
# se acaba, que es justo el dia en que ya es tarde. Se quiere ver el costo real
# desde el principio, credito o no.

# -----------------------------------------------------------------------------
# 2. Las notificaciones
# -----------------------------------------------------------------------------
# Cuatro avisos, y cada uno responde a una pregunta distinta:
#
#   80 % real       ->  vamos rapido este mes. Todavia hay margen para mirar.
#  100 % real       ->  se paso del rango del ADR 002.
#  100 % previsto   ->  AWS proyecta pasarse. Llega ANTES de gastarlo, que es el
#                       unico aviso que sirve para hacer algo al respecto.
#  300 % real       ->  150 USD: gatillo de reversion del ADR 002.
#
# No se pone un aviso al 50 %: un presupuesto que avisa en un mes normal se
# vuelve ruido y se archiva, y entonces tampoco se lee el que importa.
cat >"$TMP/notificaciones.json" <<JSON
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [ { "SubscriptionType": "EMAIL", "Address": "$CORREO" } ]
  },
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [ { "SubscriptionType": "EMAIL", "Address": "$CORREO" } ]
  },
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [ { "SubscriptionType": "EMAIL", "Address": "$CORREO" } ]
  },
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 300,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [ { "SubscriptionType": "EMAIL", "Address": "$CORREO" } ]
  }
]
JSON

echo ""
echo "==> presupuesto mensual"
YA="$(aws_ budgets describe-budget --account-id "$CUENTA" --budget-name "$NOMBRE" \
  --query 'Budget.BudgetName' --output text 2>/dev/null || true)"

if [ -z "$YA" ] || [ "$YA" = "None" ]; then
  aws_ budgets create-budget \
    --account-id "$CUENTA" \
    --budget "file://$TMP/presupuesto.json" \
    --notifications-with-subscribers "file://$TMP/notificaciones.json" >/dev/null
  echo "    creado: $NOMBRE, $MONTO USD/mes"
else
  # update-budget no toca las notificaciones, asi que se reconcilian aparte. Es la
  # parte fea de esta API: no hay un "poner exactamente esto y nada mas".
  aws_ budgets update-budget \
    --account-id "$CUENTA" \
    --new-budget "file://$TMP/presupuesto.json" >/dev/null
  echo "    ya existia, monto actualizado: $NOMBRE, $MONTO USD/mes"

  echo ""
  echo "==> notificaciones"
  # Se borran las que hay y se ponen las del guion. Suena brusco, pero es lo que
  # hace que este archivo sea la verdad: si alguien agrego un aviso a mano en la
  # consola, esa es exactamente la clase de configuracion invisible que se quiere
  # eliminar, no conservar.
  aws_ budgets describe-notifications-for-budget \
    --account-id "$CUENTA" --budget-name "$NOMBRE" \
    --query 'Notifications' --output json >"$TMP/viejas.json" 2>/dev/null || echo '[]' >"$TMP/viejas.json"

  CUANTAS="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$TMP/viejas.json")"
  I=0
  while [ "$I" -lt "$CUANTAS" ]; do
    python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))[int(sys.argv[2])]))' \
      "$TMP/viejas.json" "$I" >"$TMP/vieja.json"
    aws_ budgets delete-notification \
      --account-id "$CUENTA" --budget-name "$NOMBRE" \
      --notification "file://$TMP/vieja.json" >/dev/null 2>&1 || true
    I=$((I + 1))
  done

  CUANTAS="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$TMP/notificaciones.json")"
  I=0
  while [ "$I" -lt "$CUANTAS" ]; do
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1]))[int(sys.argv[2])]; print(json.dumps(d["Notification"]))' \
      "$TMP/notificaciones.json" "$I" >"$TMP/n.json"
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1]))[int(sys.argv[2])]; print(json.dumps(d["Subscribers"]))' \
      "$TMP/notificaciones.json" "$I" >"$TMP/s.json"
    aws_ budgets create-notification \
      --account-id "$CUENTA" --budget-name "$NOMBRE" \
      --notification "file://$TMP/n.json" \
      --subscribers "file://$TMP/s.json" >/dev/null
    I=$((I + 1))
  done
  echo "    $CUANTAS avisos puestos"
fi

# -----------------------------------------------------------------------------
# 3. Lo que quedo
# -----------------------------------------------------------------------------
echo ""
echo "==> estado"
aws_ budgets describe-budget --account-id "$CUENTA" --budget-name "$NOMBRE" \
  --query 'Budget.[BudgetName,BudgetLimit.Amount,BudgetLimit.Unit,TimeUnit,CalculatedSpend.ActualSpend.Amount]' \
  --output text | sed 's/^/    /'

echo ""
aws_ budgets describe-notifications-for-budget \
  --account-id "$CUENTA" --budget-name "$NOMBRE" \
  --query 'Notifications[].[NotificationType,Threshold]' --output text | sed 's/^/    aviso: /'

echo ""
echo "==> listo"
echo "    50 USD/mes es el techo del rango del ADR 002."
echo "    El aviso de 300 % (150 USD) es el gatillo de reversion de ese mismo ADR:"
echo "    si llega sin que haya crecido el uso, se reabre la decision, no se sube"
echo "    el presupuesto."
echo ""
echo "    AWS no pide confirmar la suscripcion por correo, asi que el primer aviso"
echo "    llega sin avisar. Conviene que $CORREO sea una direccion que alguien lea."
