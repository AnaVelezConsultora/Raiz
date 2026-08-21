#!/bin/sh
# =============================================================================
# Un tunel hasta la base, para mirarla con un gestor de escritorio.
#
#   ./tunel-a-la-base.sh            aprovisiona: crea lo que falte o la enciende
#   ./tunel-a-la-base.sh --abrir    aprovisiona Y abre la sesion (Ctrl-C la cierra)
#   ./tunel-a-la-base.sh --estado   que hay y cuanto cuesta ahora mismo
#   ./tunel-a-la-base.sh --apagar   la apaga; queda solo el disco
#   ./tunel-a-la-base.sh --destruir desaprovisiona: no queda nada que facture
#
# -----------------------------------------------------------------------------
# POR QUE UN TUNEL Y NO ABRIR LA BASE
# -----------------------------------------------------------------------------
#
# La base vive en subredes sin ruta a internet y su grupo de seguridad solo
# acepta al contenedor de la API. Para alcanzarla desde un portatil hay dos
# caminos:
#
#   Abrirla     mover la instancia a subredes publicas y marcarla accesible.
#               Son dos mudanzas de red sobre la base que tiene el padron —ida y
#               vuelta, con corte— y deja el 5432 expuesto mientras dure. El
#               repositorio ya advierte que «abrir la base un rato es la puerta
#               que despues nadie cierra».
#
#   Un tunel    una instancia minima dentro de la VPC reenvia el puerto. La base
#               no se mueve, no se expone, y al terminar se apaga.
#
# -----------------------------------------------------------------------------
# ESTA INSTANCIA NO TIENE NI UN PUERTO ABIERTO
# -----------------------------------------------------------------------------
#
# Ni el 22. No hay llave de SSH que perder ni sesion que interceptar: se entra
# por Session Manager, que es una conexion SALIENTE del agente hacia AWS, y el
# acceso lo decide IAM. Auditado en CloudTrail, ademas: queda escrito quien
# abrio el tunel y cuando.
#
# t4g.nano y no micro: para reenviar un puerto sobran 0,5 GB de memoria, y es la
# mitad del precio. Cambiar el tipo es una linea, aqui abajo.
#
# -----------------------------------------------------------------------------
# LO QUE CUESTA, Y COMO NO PAGARLO DE MAS
# -----------------------------------------------------------------------------
#
#   encendida   ~0,0042 USD/hora  ->  unos 3 USD al mes si se queda prendida
#   apagada     solo el disco     ->  unos 0,64 USD al mes (8 GB gp3)
#   destruida   nada
#
# Esto lo paga una persona de su bolsillo, asi que la instancia SE APAGA SOLA: un
# vigilante mira cada cinco minutos si hay una sesion abierta y, tras quince
# minutos sin ninguna, ejecuta el apagado. Olvidarse de `--apagar` cuesta, como
# mucho, un cuarto de hora de computo.
#
# Volver a levantarla es `./tunel-a-la-base.sh`, que tarda menos de un minuto
# porque el disco sigue ahi con todo instalado.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

NOMBRE="raiz-tunel"
TIPO="${TIPO_INSTANCIA:-t4g.nano}"
PUERTO_LOCAL="${PUERTO_LOCAL:-5433}"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"

for f in red.env base.env; do
  if [ ! -f "$SALIDA/$f" ]; then
    echo "ERROR: falta entorno/generado/$f" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$SALIDA/$f"
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

aws_() { aws --region "$REGION" --profile "$PERFIL" "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
. "$AQUI/cuenta-correcta.sh"
exigir_cuenta_de_raiz

instancia() {
  aws_ ec2 describe-instances \
    --filters "Name=tag:Name,Values=$NOMBRE" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# Apagar y destruir
# -----------------------------------------------------------------------------
ID="$(instancia)"

if [ "$1" = "--estado" ]; then
  if [ -z "$ID" ] || [ "$ID" = "None" ]; then
    echo "==> no hay tunel aprovisionado. Cuesta 0 USD."
    echo "    Para crearlo: ./tunel-a-la-base.sh"
    exit 0
  fi
  ESTADO="$(aws_ ec2 describe-instances --instance-ids "$ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text)"
  echo "==> $ID: $ESTADO"
  case "$ESTADO" in
    running) echo "    facturando ~0,0042 USD/hora (~3 USD/mes si se queda asi)"
             echo "    se apaga sola tras 15 minutos sin sesion" ;;
    stopped) echo "    solo el disco: ~0,64 USD/mes. Encender: ./tunel-a-la-base.sh" ;;
    *)       echo "    en transicion" ;;
  esac
  exit 0
fi

if [ "$1" = "--apagar" ]; then
  [ -z "$ID" ] || [ "$ID" = "None" ] && { echo "No hay instancia que apagar."; exit 0; }
  aws_ ec2 stop-instances --instance-ids "$ID" >/dev/null
  echo "==> $ID apagandose. Deja de facturar computo; el disco cuesta centavos."
  echo "    Para volver a usarla: ./tunel-a-la-base.sh"
  exit 0
fi

if [ "$1" = "--destruir" ]; then
  if [ -n "$ID" ] && [ "$ID" != "None" ]; then
    aws_ ec2 terminate-instances --instance-ids "$ID" >/dev/null
    echo "==> $ID terminandose"
    aws_ ec2 wait instance-terminated --instance-ids "$ID" || true
  fi

  SG_TUNEL="$(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$NOMBRE" \
    --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"
  if [ -n "$SG_TUNEL" ] && [ "$SG_TUNEL" != "None" ]; then
    # Primero la regla que la base le concede, o el grupo no se deja borrar.
    aws_ ec2 revoke-security-group-ingress --group-id "$RAIZ_SG_BASE" \
      --protocol tcp --port 5432 --source-group "$SG_TUNEL" >/dev/null 2>&1 || true
    aws_ ec2 delete-security-group --group-id "$SG_TUNEL" >/dev/null 2>&1 || true
    echo "==> grupo de seguridad borrado, y con el su permiso sobre la base"
  fi

  aws_ iam remove-role-from-instance-profile --instance-profile-name "$NOMBRE" \
    --role-name "$NOMBRE" >/dev/null 2>&1 || true
  aws_ iam delete-instance-profile --instance-profile-name "$NOMBRE" >/dev/null 2>&1 || true
  aws_ iam detach-role-policy --role-name "$NOMBRE" \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore >/dev/null 2>&1 || true
  aws_ iam delete-role --role-name "$NOMBRE" >/dev/null 2>&1 || true
  echo "==> rol borrado"
  echo ""
  echo "==> no queda nada del tunel"
  exit 0
fi

# -----------------------------------------------------------------------------
# 1. Rol: lo minimo para que el agente hable con Session Manager
# -----------------------------------------------------------------------------
echo "==> rol"
if aws_ iam get-role --role-name "$NOMBRE" >/dev/null 2>&1; then
  echo "    ya existia"
else
  aws_ iam create-role --role-name "$NOMBRE" \
    --description "Tunel hacia la base de Raiz. Solo Session Manager." \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "ec2.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }' >/dev/null
  echo "    creado"
fi

# La politica administrada de AWS, y ninguna mas. Esta instancia no lee secretos,
# no escribe en S3 y no toca la base: lo unico que hace es reenviar un puerto.
aws_ iam attach-role-policy --role-name "$NOMBRE" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws_ iam create-instance-profile --instance-profile-name "$NOMBRE" >/dev/null 2>&1 || true
aws_ iam add-role-to-instance-profile --instance-profile-name "$NOMBRE" \
  --role-name "$NOMBRE" >/dev/null 2>&1 || true

# -----------------------------------------------------------------------------
# 2. Grupo de seguridad: SIN reglas de entrada
# -----------------------------------------------------------------------------
echo ""
echo "==> grupo de seguridad"
SG_TUNEL="$(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$NOMBRE" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"

if [ -z "$SG_TUNEL" ] || [ "$SG_TUNEL" = "None" ]; then
  SG_TUNEL="$(aws_ ec2 create-security-group --group-name "$NOMBRE" \
    --description "Tunel a la base. Sin entrada: se entra por Session Manager." \
    --vpc-id "$RAIZ_VPC_ID" --query 'GroupId' --output text)"
  echo "    creado: $SG_TUNEL (sin una sola regla de entrada)"
else
  echo "    ya existia: $SG_TUNEL"
fi

# La base le concede el 5432 a ESTE grupo, igual que se lo concede a la API. No se
# abre a una IP ni a un rango: se abre a una identidad de red.
aws_ ec2 authorize-security-group-ingress --group-id "$RAIZ_SG_BASE" \
  --protocol tcp --port 5432 --source-group "$SG_TUNEL" >/dev/null 2>&1 || true
echo "    la base acepta 5432 desde el tunel"

# -----------------------------------------------------------------------------
# 3. La instancia
# -----------------------------------------------------------------------------
echo ""
echo "==> instancia"
if [ -n "$ID" ] && [ "$ID" != "None" ]; then
  ESTADO="$(aws_ ec2 describe-instances --instance-ids "$ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text)"
  if [ "$ESTADO" = "stopped" ]; then
    aws_ ec2 start-instances --instance-ids "$ID" >/dev/null
    echo "    $ID estaba apagada, encendiendo"
  else
    echo "    $ID ya existia ($ESTADO)"
  fi
else
  AMI="$(aws_ ssm get-parameter \
    --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
    --query 'Parameter.Value' --output text)"

  # El vigilante de ociosidad. Va en los datos de arranque para que exista desde
  # el primer segundo: una instancia que se creo y se olvido no debe poder
  # facturar un mes entero.
  cat >"$TMP/arranque.sh" <<'ARRANQUE'
#!/bin/bash
cat >/usr/local/bin/apagar-si-ociosa.sh <<'VIGILANTE'
#!/bin/bash
# Apaga la instancia tras 15 minutos sin una sola sesion de Session Manager.
# La sesion de reenvio de puerto corre como ssm-session-worker; si no hay
# ninguna, nadie esta usando el tunel.
MARCA=/var/tmp/ociosa-desde
if pgrep -f ssm-session-worker >/dev/null; then
  rm -f "$MARCA"
  exit 0
fi
[ -f "$MARCA" ] || date +%s >"$MARCA"
DESDE=$(cat "$MARCA")
if [ $(( $(date +%s) - DESDE )) -ge 900 ]; then
  logger -t raiz-tunel "15 minutos sin sesion: apagando"
  shutdown -h now
fi
VIGILANTE
chmod +x /usr/local/bin/apagar-si-ociosa.sh

# Temporizador de systemd y no cron: Amazon Linux 2023 no trae cron instalado, y
# un `/etc/cron.d` en un sistema sin cronie es un archivo que nadie lee.
cat >/etc/systemd/system/raiz-tunel-ocioso.service <<'UNIDAD'
[Unit]
Description=Apaga el tunel de Raiz si nadie lo esta usando

[Service]
Type=oneshot
ExecStart=/usr/local/bin/apagar-si-ociosa.sh
UNIDAD

cat >/etc/systemd/system/raiz-tunel-ocioso.timer <<'TEMPORIZADOR'
[Unit]
Description=Mira cada cinco minutos si el tunel quedo ocioso

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
TEMPORIZADOR

systemctl daemon-reload
systemctl enable --now raiz-tunel-ocioso.timer
ARRANQUE

  # IP publica porque no hay puerta de enlace NAT: el agente necesita salida a
  # internet para hablar con Session Manager. Tener IP publica no es tener puertos
  # abiertos — el grupo de seguridad no concede ninguna entrada.
  # EL PERFIL DE INSTANCIA TARDA EN PROPAGARSE. Recien creado, EC2 responde
  # «Invalid IAM Instance Profile name» aunque IAM ya lo devuelva. No es un error
  # de configuracion y no se arregla mirando la consola: se arregla esperando.
  intento=1
  until ID="$(aws_ ec2 run-instances \
    --image-id "$AMI" --instance-type "$TIPO" \
    --subnet-id "$RAIZ_SUBRED_PUB_A" \
    --security-group-ids "$SG_TUNEL" \
    --iam-instance-profile "Name=$NOMBRE" \
    --associate-public-ip-address \
    --metadata-options 'HttpTokens=required' \
    --user-data "file://$TMP/arranque.sh" \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=8,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NOMBRE},{Key=Proyecto,Value=raiz}]" \
    --query 'Instances[0].InstanceId' --output text 2>/dev/null)"; do
    if [ "$intento" -ge 12 ]; then
      echo "ERROR: EC2 sigue sin ver el perfil $NOMBRE despues de un minuto" >&2
      exit 1
    fi
    echo "    esperando a que se propague el perfil de instancia... ($intento)"
    intento=$((intento + 1))
    sleep 5
  done
  echo "    creada: $ID ($TIPO)"
fi

echo "    esperando a que responda..."
aws_ ec2 wait instance-running --instance-ids "$ID"

# El agente tarda un poco mas que la instancia en registrarse.
intento=1
until [ "$(aws_ ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=$ID" \
    --query 'length(InstanceInformationList)' --output text 2>/dev/null)" = "1" ]; do
  if [ "$intento" -ge 40 ]; then
    echo "ERROR: el agente no se registro en Session Manager" >&2
    exit 1
  fi
  intento=$((intento + 1))
  sleep 5
done
echo "    lista en Session Manager"

# -----------------------------------------------------------------------------
# 4. Como usarlo
# -----------------------------------------------------------------------------
BASE_HOST="$(aws_ rds describe-db-instances --db-instance-identifier raiz-base \
  --query 'DBInstances[0].Endpoint.Address' --output text)"

if [ "$1" = "--abrir" ]; then
  echo ""
  echo "==> abriendo la sesion en localhost:$PUERTO_LOCAL"
  echo "    Ctrl-C la cierra. La instancia se apaga sola 15 minutos despues."
  echo ""
  exec aws ssm start-session --region "$REGION" --profile "$PERFIL" \
    --target "$ID" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"$BASE_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"$PUERTO_LOCAL\"]}"
fi

cat <<FIN

==> el tunel esta listo

Abra la sesion en una terminal aparte y dejela abierta:

  aws ssm start-session --region $REGION --profile $PERFIL \\
    --target $ID \\
    --document-name AWS-StartPortForwardingSessionToRemoteHost \\
    --parameters '{"host":["$BASE_HOST"],"portNumber":["5432"],"localPortNumber":["$PUERTO_LOCAL"]}'

Y conecte el gestor a:

  servidor   localhost
  puerto     $PUERTO_LOCAL
  base       raiz
  usuario    raiz_lector   (solo lectura; la clave la genera crear-lector.sh)
  SSL        no hace falta: el trafico ya va cifrado dentro de la sesion

El puerto local es $PUERTO_LOCAL y no 5432 a proposito: si tiene PostgreSQL
instalado, el 5432 esta ocupado y el gestor se conectaria a SU maquina sin decir
nada raro. Esa confusion cuesta media hora.

O deje que este guion la abra por usted:

  ./tunel-a-la-base.sh --abrir

Al terminar:

  ./tunel-a-la-base.sh --apagar      ~0,64 USD/mes: solo el disco
  ./tunel-a-la-base.sh --destruir    0 USD: no queda nada
  ./tunel-a-la-base.sh --estado      que hay y cuanto cuesta

Y si se le olvida, se apaga sola: 15 minutos sin sesion y se detiene.
FIN
