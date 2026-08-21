# =============================================================================
# ¿ESTOY APUNTANDO A LA CUENTA DE RAIZ?
#
# Se descubrio el 21 de agosto y por poco: los guiones usaban `--profile default`
# y creaban lo que encontraran en la cuenta a la que ese perfil apuntara, sin
# preguntar cual era. En el portatil de quien coordina, `default` es la cuenta de
# OTRO proyecto — uno de trabajo, con su propia factura y su propia gente.
#
# Correr ahi `desplegar-base.sh` no habria dado ningun error. Habria creado una
# base de datos, una red y un balanceador de Raiz dentro de la infraestructura de
# una empresa que no tiene nada que ver, cobrandoselos a ella, y nadie se habria
# enterado hasta la factura. El unico motivo de que no pasara es que el guion fallo
# antes por otra razon.
#
# Esto lo convierte en imposible: cada guion declara en que cuenta debe estar, y si
# no coincide se detiene ANTES de tocar nada.
#
# Uso, despues de definir `aws_`:
#
#   . "$AQUI/cuenta-correcta.sh"
#   exigir_cuenta_de_raiz
#
# Para trabajar contra otra cuenta a proposito —una copia del entorno, una prueba—
# se declara al llamar, y entonces es una decision y no un descuido:
#
#   RAIZ_CUENTA=111122223333 ./desplegar-red.sh
# =============================================================================

# La cuenta de Raiz. Se escribe UNA vez, aqui, y no en dieciseis guiones: dieciseis
# copias de un numero son dieciseis sitios donde queda desactualizado.
RAIZ_CUENTA="${RAIZ_CUENTA:-303638556798}"

exigir_cuenta_de_raiz() {
  cuenta_actual="$(aws_ sts get-caller-identity --query 'Account' --output text 2>/dev/null || true)"

  if [ -z "$cuenta_actual" ]; then
    echo "ERROR: no se pudo saber a que cuenta de AWS apuntan estas credenciales." >&2
    echo "       Revise el perfil '$PERFIL' o exporte AWS_ACCESS_KEY_ID." >&2
    exit 1
  fi

  if [ "$cuenta_actual" != "$RAIZ_CUENTA" ]; then
    echo "ERROR: este guion crea infraestructura de Raiz y usted esta apuntando a" >&2
    echo "       OTRA cuenta de AWS. No se toco nada." >&2
    echo "" >&2
    echo "         esperada: $RAIZ_CUENTA" >&2
    echo "         actual:   $cuenta_actual   (perfil '$PERFIL')" >&2
    echo "" >&2
    echo "       Elija el perfil correcto:  AWS_PROFILE=raiz $0" >&2
    echo "       O, si de verdad quiere esa cuenta: RAIZ_CUENTA=$cuenta_actual $0" >&2
    exit 1
  fi
}
