#!/bin/sh
# =============================================================================
# Identidad federada para el pipeline. HU 1.1.2.
#
#   ./desplegar-identidad-federada.sh
#
# Es IDEMPOTENTE. No crea ninguna credencial: ese es exactamente el punto.
#
# -----------------------------------------------------------------------------
# EL HUECO QUE ESTO CIERRA
# -----------------------------------------------------------------------------
#
# Hasta hoy, desplegar exigia una llave de larga vida de un usuario de IAM. Una
# llave asi no caduca, no se sabe quien la copio, y el dia que se filtra —en un
# portatil robado, en un registro de consola, en una captura de pantalla pegada en
# un chat— quien la tenga puede leer la base de familias damnificadas.
#
# El criterio de la HU dice "ningun secreto de AWS en la configuracion del
# repositorio", y es la parte facil: nunca lo hubo. La parte que importa es que
# ahora tampoco hace falta que exista la llave.
#
# COMO FUNCIONA, EN UNA FRASE
#
# GitHub firma un token que dice "soy la rama main del repositorio tal, corriendo
# tal flujo". AWS lo verifica contra las llaves publicas de GitHub y entrega
# credenciales que duran una hora. No hay nada que guardar ni que rotar.
#
# -----------------------------------------------------------------------------
# LA CONFIANZA SE ACOTA POR RAMA, Y NO ES UN DETALLE
# -----------------------------------------------------------------------------
#
# La condicion mira el `sub` del token, que trae repositorio Y referencia:
#
#     repo:ORG/REPO:ref:refs/heads/main
#
# Sin la parte de la rama, cualquiera que abra una propuesta de cambio con un
# flujo modificado desplegaria a produccion, y abrir una propuesta puede hacerlo
# quien sea. Es el error clasico de este montaje y no da la cara hasta que alguien
# lo usa.
#
# Por eso las propuestas de cambio NO reciben credenciales: compilan y prueban, y
# nada mas. Solo lo que ya paso por revision y esta en main puede tocar la nube.
# =============================================================================
set -e

REGION="${AWS_REGION:-us-east-1}"
PERFIL="${AWS_PROFILE:-default}"

# Con la mayuscula exacta del repositorio. GitHub emite el `sub` con el nombre
# canonico, y la condicion de IAM se compara tal cual: si aqui dice "raiz" y el
# repositorio se llama "Raiz", la confianza no aplica y el fallo es un
# "not authorized to perform sts:AssumeRoleWithWebIdentity" que no explica nada.
REPO="AnaVelezConsultora/Raiz"
RAMA="main"

EMISOR="token.actions.githubusercontent.com"
ROL_DESPLIEGUE="raiz-despliegue-produccion"
ROL_REGISTROS="raiz-lectura-registros"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SALIDA="$AQUI/../generado"
mkdir -p "$SALIDA"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

. "$AQUI/cuenta-correcta.sh"
aws_() { aws --region "$REGION" $PERFIL_FLAG "$@"; }

# Antes de tocar nada: comprobar que estas credenciales son de la cuenta de Raiz y
# no de otro proyecto. Ver cuenta-correcta.sh — paso de verdad.
exigir_cuenta_de_raiz

echo "==> cuenta"
CUENTA="$(aws_ sts get-caller-identity --query 'Account' --output text)"
echo "    cuenta: $CUENTA   region: $REGION"
echo "    repositorio: $REPO   rama: $RAMA"

# -----------------------------------------------------------------------------
# 1. El proveedor de identidad
# -----------------------------------------------------------------------------
echo ""
echo "==> proveedor OIDC"
ARN_OIDC="arn:aws:iam::$CUENTA:oidc-provider/$EMISOR"

if aws_ iam get-open-id-connect-provider --open-id-connect-provider-arn "$ARN_OIDC" >/dev/null 2>&1; then
  echo "    ya existia"
else
  # La huella digital ya no la usa AWS para este emisor —verifica contra una
  # autoridad de confianza— pero la API sigue exigiendo el campo. Se manda la
  # conocida y no hay que mantenerla al dia.
  aws_ iam create-open-id-connect-provider \
    --url "https://$EMISOR" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
    --tags "Key=Proyecto,Value=Raiz" >/dev/null
  echo "    creado"
fi
echo "    $ARN_OIDC"

# -----------------------------------------------------------------------------
# 2. El rol que asume el pipeline
# -----------------------------------------------------------------------------
# Un rol POR ENTORNO, que es lo que pide el criterio. Hoy hay un solo entorno y
# por eso hay un solo rol; el nombre lleva el sufijo para que el dia que aparezca
# preproduccion nadie tenga la tentacion de reutilizar este.
cat >"$TMP/confianza.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$ARN_OIDC" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "$EMISOR:aud": "sts.amazonaws.com",
        "$EMISOR:sub": "repo:$REPO:ref:refs/heads/$RAMA"
      }
    }
  }]
}
JSON

# StringEquals y no StringLike con comodin. Un "repo:$REPO:*" dejaria entrar
# cualquier rama, cualquier etiqueta y cualquier propuesta de cambio del
# repositorio, que es justo lo que se quiere impedir.

echo ""
echo "==> rol de despliegue"
if aws_ iam get-role --role-name "$ROL_DESPLIEGUE" >/dev/null 2>&1; then
  aws_ iam update-assume-role-policy --role-name "$ROL_DESPLIEGUE" \
    --policy-document "file://$TMP/confianza.json"
  echo "    ya existia, confianza reconciliada"
else
  aws_ iam create-role --role-name "$ROL_DESPLIEGUE" \
    --assume-role-policy-document "file://$TMP/confianza.json" \
    --description "Lo asume el pipeline desde la rama $RAMA de $REPO. Sin credenciales guardadas." \
    --max-session-duration 3600 \
    --tags "Key=Proyecto,Value=Raiz" >/dev/null
  echo "    creado"
fi

# -----------------------------------------------------------------------------
# 3. Lo que el pipeline puede hacer, y lo que NO
# -----------------------------------------------------------------------------
# PUEDE: subir una imagen, aplicar migraciones y actualizar el servicio. Es todo
# lo que hace falta para entregar una version nueva.
#
# NO PUEDE, a proposito: crear ni borrar VPC, RDS, roles ni secretos. Esa clase de
# cambio la hace una persona, mirando, con la cabeza puesta. Un pipeline que puede
# borrar la base de datos es un pipeline que un dia la borra, y aqui lo que hay
# adentro es el padron de familias damnificadas.
#
# Tampoco puede LEER los secretos. Los inyecta ECS al arrancar la tarea usando el
# rol de ejecucion, que es otro. El pipeline los nombra y nunca los ve.
cat >"$TMP/permisos.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SubirLaImagen",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage",
        "ecr:DescribeImages",
        "ecr:DescribeRepositories"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DesplegarYMigrar",
      "Effect": "Allow",
      "Action": [
        "ecs:RegisterTaskDefinition",
        "ecs:DescribeTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:RunTask",
        "ecs:DescribeTasks",
        "ecs:ListTasks"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EntregarLosRolesDeLaTarea",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::$CUENTA:role/raiz-ecs-ejecucion",
        "arn:aws:iam::$CUENTA:role/raiz-ecs-tarea"
      ],
      "Condition": {
        "StringEquals": { "iam:PassedToService": "ecs-tasks.amazonaws.com" }
      }
    },
    {
      "Sid": "LeerLoQueDejoLaTarea",
      "Effect": "Allow",
      "Action": [
        "logs:GetLogEvents",
        "logs:DescribeLogStreams",
        "logs:DescribeLogGroups"
      ],
      "Resource": "arn:aws:logs:$REGION:$CUENTA:log-group:/raiz/*"
    },
    {
      "Sid": "PublicarLaPwa",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::raiz-front-$CUENTA",
        "arn:aws:s3:::raiz-front-$CUENTA/*"
      ]
    },
    {
      "Sid": "InvalidarLaCache",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListDistributions"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SaberDondeCorrer",
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeTargetHealth",
        "elasticloadbalancing:DescribeLoadBalancers",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "*"
    }
  ]
}
JSON

# El acceso a S3 va acotado AL BUCKET DE LA PWA y a nada mas. `ListDistributions`
# no acepta recurso —la API de CloudFront no lo permite— pero solo lee: lo que
# escribe, `CreateInvalidation`, si podria acotarse el dia que se fije el
# identificador de la distribucion en vez de descubrirlo. Se descubre a proposito,
# para que el flujo no dependa de un archivo generado en una maquina.
#
# PassRole va acotado a los DOS roles de la tarea y ademas condicionado al
# servicio. Sin la condicion, quien controle el pipeline podria entregarle
# cualquiera de esos roles a otro servicio y usarlo para otra cosa. Es el escalon
# por el que se sube de "puedo desplegar" a "puedo hacer lo que quiera".
#
# secretsmanager:DescribeSecret y no GetSecretValue: el pipeline necesita el
# identificador del secreto para escribirlo en la definicion de tarea, no su
# contenido.

aws_ iam put-role-policy --role-name "$ROL_DESPLIEGUE" \
  --policy-name raiz-entregar-version \
  --policy-document "file://$TMP/permisos.json"
echo "    permisos: subir imagen, migrar, actualizar servicio, leer registros"
echo "    NO puede: crear o borrar red, base, roles ni leer secretos"

ARN_DESPLIEGUE="$(aws_ iam get-role --role-name "$ROL_DESPLIEGUE" --query 'Role.Arn' --output text)"

# -----------------------------------------------------------------------------
# 4. El rol de quien depura
# -----------------------------------------------------------------------------
# Tercer criterio de la HU: "los devs no reciben consola de la nube; quien depure
# recibe lectura de registros". Esto es esa lectura y nada mas: no ve la base, no
# ve los secretos, no puede cambiar nada.
#
# La confianza es la raiz de la cuenta, que NO significa "cualquiera entra":
# significa que quien administra puede permitirle a una persona concreta asumirlo,
# sin darle consola ni tocar este archivo. Mientras nadie tenga ese permiso, el rol
# existe y no lo usa nadie.
cat >"$TMP/confianza-registros.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::$CUENTA:root" },
    "Action": "sts:AssumeRole"
  }]
}
JSON

echo ""
echo "==> rol de lectura de registros"
if aws_ iam get-role --role-name "$ROL_REGISTROS" >/dev/null 2>&1; then
  aws_ iam update-assume-role-policy --role-name "$ROL_REGISTROS" \
    --policy-document "file://$TMP/confianza-registros.json"
  echo "    ya existia, confianza reconciliada"
else
  aws_ iam create-role --role-name "$ROL_REGISTROS" \
    --assume-role-policy-document "file://$TMP/confianza-registros.json" \
    --description "Solo lee los registros de Raiz. Para quien depura, en vez de dar consola." \
    --max-session-duration 3600 \
    --tags "Key=Proyecto,Value=Raiz" >/dev/null
  echo "    creado"
fi

aws_ iam put-role-policy --role-name "$ROL_REGISTROS" \
  --policy-name raiz-solo-leer-registros \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [
        \"logs:GetLogEvents\",
        \"logs:FilterLogEvents\",
        \"logs:DescribeLogStreams\",
        \"logs:DescribeLogGroups\",
        \"logs:StartQuery\",
        \"logs:GetQueryResults\"
      ],
      \"Resource\": \"arn:aws:logs:$REGION:$CUENTA:log-group:/raiz/*\"
    }]
  }"
echo "    permisos: leer /raiz/api y /raiz/migraciones. Nada mas."

ARN_REGISTROS="$(aws_ iam get-role --role-name "$ROL_REGISTROS" --query 'Role.Arn' --output text)"

# -----------------------------------------------------------------------------
# 5. Variables
# -----------------------------------------------------------------------------
cat >"$SALIDA/federada.env" <<ENV
# Generado por entorno/aws/desplegar-identidad-federada.sh.
# No editar a mano, no versionar.
# Corte: $(date -u +%Y-%m-%dT%H:%M:%SZ)
RAIZ_ROL_DESPLIEGUE=$ARN_DESPLIEGUE
RAIZ_ROL_REGISTROS=$ARN_REGISTROS
RAIZ_OIDC=$ARN_OIDC
ENV

echo ""
echo "==> variables en entorno/generado/federada.env"
sed 's/^/    /' "$SALIDA/federada.env"

echo ""
echo "==> listo"
echo ""
echo "    El flujo de .github/workflows/ ya nombra este rol. NO hay que crear"
echo "    ningun secreto en GitHub: si alguien agrega AWS_ACCESS_KEY_ID a la"
echo "    configuracion del repositorio, esta deshaciendo esto."
echo ""
echo "    Para que alguien pueda leer registros sin consola, permitale asumir:"
echo "      $ARN_REGISTROS"
echo ""
echo "    Y queda una llave de larga vida viva: la del usuario que corrio esto."
echo "    Retirarla es el ultimo paso de la HU 1.1.2 y hay que hacerlo a mano,"
echo "    despues de comprobar que el pipeline despliega solo."
