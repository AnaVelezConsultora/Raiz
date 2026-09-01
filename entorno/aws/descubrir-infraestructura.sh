# =============================================================================
# DONDE ESTA CADA COSA: SE LE PREGUNTA A AWS, NO A UN ARCHIVO
#
# Los guiones leian `entorno/generado/*.env`, que escriben los despliegues iniciales
# y que por lo tanto viven en UNA maquina: la de quien levanto la infraestructura. El
# efecto no era tecnico sino humano — solo esa persona podia desplegar, y cuando no
# estaba disponible no habia despliegue.
#
# Aqui se descubre lo mismo preguntandole a AWS por los nombres y etiquetas con los que
# se creo cada recurso. Eso ya se hacia para la subred y el grupo de seguridad; esto lo
# extiende al resto.
#
# LOS ARCHIVOS SIGUEN GANANDO SI EXISTEN. Quien acaba de levantar la infraestructura
# tiene los valores exactos y ya cargados, y ademas asi el guion sigue sirviendo antes
# de que los recursos existan. Lo que cambia es que dejan de ser obligatorios.
#
# Cada valor se puede declarar tambien al llamar, y entonces es una decision:
#
#   RAIZ_CLUSTER=otro ./aplicar-migraciones.sh
#
# Requiere que `aws_` ya este definida y que se haya comprobado la cuenta.
# =============================================================================

# Rellena una variable solo si viene vacia. `eval` es la unica forma en POSIX de
# asignar a un nombre que llega como texto.
descubrir() {
  nombre="$1"
  shift
  eval "actual=\${$nombre:-}"
  [ -n "$actual" ] && return 0

  valor="$("$@" 2>/dev/null || true)"
  [ "$valor" = "None" ] && valor=""
  eval "$nombre=\"\$valor\""
}

descubrir_infraestructura() {
  # El cluster y el nombre de la base son constantes del proyecto, no descubrimientos.
  RAIZ_CLUSTER="${RAIZ_CLUSTER:-raiz}"
  RAIZ_BASE_NOMBRE="${RAIZ_BASE_NOMBRE:-raiz}"

  descubrir RAIZ_SUBRED_PUB_A aws_ ec2 describe-subnets \
    --filters Name=tag:Name,Values=raiz-publica-a \
    --query 'Subnets[0].SubnetId' --output text

  descubrir RAIZ_SG_API aws_ ec2 describe-security-groups \
    --filters Name=group-name,Values=raiz-sg-api \
    --query 'SecurityGroups[0].GroupId' --output text

  descubrir RAIZ_ROL_EJECUCION aws_ iam get-role \
    --role-name raiz-ecs-ejecucion --query 'Role.Arn' --output text

  descubrir RAIZ_BASE_ANFITRION aws_ rds describe-db-instances \
    --db-instance-identifier raiz-base --query 'DBInstances[0].Endpoint.Address' --output text

  descubrir RAIZ_BASE_PUERTO aws_ rds describe-db-instances \
    --db-instance-identifier raiz-base --query 'DBInstances[0].Endpoint.Port' --output text

  # Se comprueba TODO antes de seguir y se dice que falta, con su nombre. Un guion que
  # arranca con una variable vacia falla mas adelante y con un mensaje de la CLI de AWS
  # que no menciona el problema real; asi el error dice exactamente que no se encontro.
  faltan=""
  for v in RAIZ_SUBRED_PUB_A RAIZ_SG_API RAIZ_ROL_EJECUCION RAIZ_BASE_ANFITRION RAIZ_BASE_PUERTO; do
    eval "valor=\${$v:-}"
    [ -z "$valor" ] && faltan="$faltan $v"
  done

  if [ -n "$faltan" ]; then
    echo "ERROR: no se encontro en AWS:$faltan" >&2
    echo "       O la infraestructura no esta levantada —corra los guiones de" >&2
    echo "       despliegue— o esta en otra cuenta. Tambien puede declararlas:" >&2
    echo "         RAIZ_SUBRED_PUB_A=subnet-... $0" >&2
    exit 1
  fi
}
