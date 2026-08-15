#!/usr/bin/env bash
# =============================================================================
# PRUEBA FUNCIONAL DE PUNTA A PUNTA — CAMINO FELIZ
#
# Recorre el ciclo operativo completo que describe ESTADO.md, con los tres
# servicios reales del entorno: Cognito, PostgreSQL y S3.
#
#   1. El lider entra (Cognito emite un token de verdad)
#   2. Sincroniza el caso que capturo sin senal en la vereda
#   3. Reintenta porque se le cayo la senal  -> no debe duplicar
#   4. Sube la fotografia por URL prefirmada -> no debe quedar publica
#   5. La mesa verifica el caso
#   6. La mesa lo remite a una entidad y obtiene radicado
#   7. Se mide la mora: cuantos dias lleva la entidad sin responder
#   8. La entidad responde
#   9. El mapa publico lo muestra sin identidad
#  10. Todo el recorrido quedo auditado
#
# El objetivo de ESTADO.md es exactamente ese: "Remitir. Hacer seguimiento. Ser
# puente." Esta prueba verifica que el sistema pueda sostener esas tres cosas.
#
# Correr:  ./pruebas/flujo-completo.sh     (desde entorno/)
#     o:   make e2e
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

ORIGEN_ID="11111111-2222-4333-8444-555555555555"
RADICADO="CMGRD-2026-04871"
DIAS_MORA=12

ok()    { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
paso()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
fallo() { printf '  \033[31mFALLO\033[0m %s\n' "$1"; exit 1; }
aviso() { printf '  \033[33m!\033[0m    %s\n' "$1"; }

# psql como un usuario concreto: fija la identidad y cambia de rol, que es lo
# mismo que hara la API en cada peticion.
como() {
  local sub="$1"; shift
  docker compose exec -T db psql -U postgres -d raiz -v ON_ERROR_STOP=1 \
    -v sub="$sub" -tA <<SQL
\\pset footer off
\\o /dev/null
begin;
select set_config('app.user_id', :'sub', true);
set local role authenticated;
\\o
$*
\\o /dev/null
commit;
\\o
SQL
}

# psql sin sesion, como el visitante anonimo del tablero publico.
como_anonimo() {
  docker compose exec -T db psql -U postgres -d raiz -v ON_ERROR_STOP=1 -tA <<SQL
\\pset footer off
\\o /dev/null
begin;
set local role anon;
\\o
$*
\\o /dev/null
rollback;
\\o
SQL
}

# Una sola invocacion de la CLI de AWS por bloque: arrancar el contenedor cuesta
# mas que el comando.
en_aws() {
  docker compose run --rm -T --entrypoint sh bootstrap -c "$1"
}

printf '\n\033[1m==============================================\033[0m\n'
printf '\033[1m Raiz - flujo completo, camino feliz\033[0m\n'
printf '\033[1m==============================================\033[0m\n'

# -----------------------------------------------------------------------------
# Se limpia el rastro de una corrida anterior para que la prueba sea repetible.
# Corre como superusuario, que es la unica via para tocar la auditoria: ni
# siquiera la custodia puede borrarla, solo leerla.
# -----------------------------------------------------------------------------
docker compose exec -T db psql -U postgres -d raiz -q >/dev/null <<SQL
delete from auditoria
 where (tabla = 'familias'   and despues->>'origen_id' = '$ORIGEN_ID')
    or (tabla = 'remisiones' and despues->>'radicado'  = '$RADICADO');
delete from familias where origen_id = '$ORIGEN_ID';
SQL

# -----------------------------------------------------------------------------
paso "1. El lider entra. Iniciar sesion exige conexion; capturar, no."
# -----------------------------------------------------------------------------
# Autenticacion real contra Cognito. No se inventa el identificador del usuario:
# se lee del token que Cognito emite, que es de donde lo tomara la API.
SUB_ANA="$(en_aws '
  set -e
  . /generado/entorno.generado.env
  TOKEN=$(aws --endpoint-url "$COGNITO_ENDPOINT" cognito-idp initiate-auth \
    --client-id "$COGNITO_CLIENT_ID" \
    --auth-flow USER_PASSWORD_AUTH \
    --auth-parameters USERNAME=ana@ejemplo.test,PASSWORD=Raiz.local.2026 \
    --query "AuthenticationResult.IdToken" --output text)
  python3 -c "
import sys, json, base64
p = sys.argv[1].split(\".\")[1]
p += \"=\" * (-len(p) % 4)
print(json.loads(base64.urlsafe_b64decode(p))[\"sub\"])
" "$TOKEN"
' | tail -1 | tr -d '\r')"

[[ "$SUB_ANA" =~ ^[0-9a-f-]{36}$ ]] || fallo "Cognito no devolvio un token utilizable"
ok "Cognito autentico a ana@ejemplo.test y el token trae sub=${SUB_ANA:0:8}..."

ROL="$(como "$SUB_ANA" "select rol from perfiles where id = auth.uid();")"
[[ "$ROL" == "lider" ]] || fallo "el rol deberia ser lider y es '$ROL'"
ok "la base reconoce el token: el perfil existe y su rol es lider"

# -----------------------------------------------------------------------------
paso "2. Sincroniza el caso que capturo sin senal."
# -----------------------------------------------------------------------------
CODIGO="$(como "$SUB_ANA" "
with sincronizado as (
insert into familias (
  origen_id, registrador_nombre, fuente_dato, consentimiento,
  departamento, municipio, zona, vereda, lat, lon, gps_fuente,
  jefe_nombres, jefe_apellidos, tipo_doc, num_doc,
  tel_1, personas_total, h_6_11, m_6_11, h_18_59, m_18_59,
  prioridad, necesidades_inmediatas
) values (
  '$ORIGEN_ID', 'Ana Lider (prueba)', 'presencial', true,
  'Valle del Cauca', 'Sevilla', 'rural', 'Vereda Ficticia Tres',
  4.31234567, -75.91234567, 'sitio',
  'Familia', 'Inventada Tres', 'CC', '10000003',
  '3000000103', 5, 1, 1, 1, 1,
  'p1', array['agua_potable','carpa']::necesidad_t[]
)
on conflict (origen_id) do update set actualizado_en = now()
returning codigo)
select codigo from sincronizado;")"

[[ "$CODIGO" =~ ^RZ-[0-9]{4}-[0-9]{6}$ ]] \
  || fallo "el servidor no asigno el consecutivo institucional (devolvio '$CODIGO')"
ok "el servidor asigno el codigo $CODIGO"
ok "el dispositivo puede retirar su codigo local L-XXXX-NNN"

# -----------------------------------------------------------------------------
paso "3. Se cayo la senal y el dispositivo reintenta."
# -----------------------------------------------------------------------------
# El escenario que corrompe estos sistemas: el envio llego, la respuesta se
# perdio, el dispositivo reintenta. Sin idempotencia el censo gana un duplicado
# silencioso, y los totales son la palanca de negociacion ante las entidades.
CODIGO_2="$(como "$SUB_ANA" "
with reintento as (
insert into familias (
  origen_id, registrador_nombre, fuente_dato, consentimiento,
  departamento, municipio, zona, vereda, lat, lon, gps_fuente,
  tel_1, personas_total, prioridad
) values (
  '$ORIGEN_ID', 'Ana Lider (prueba)', 'presencial', true,
  'Valle del Cauca', 'Sevilla', 'rural', 'Vereda Ficticia Tres',
  4.31234567, -75.91234567, 'sitio', '3000000103', 5, 'p1'
)
on conflict (origen_id) do update set actualizado_en = now()
returning codigo)
select codigo from reintento;")"

FILAS="$(como "$SUB_ANA" "select count(*) from familias where origen_id = '$ORIGEN_ID';")"
[[ "$CODIGO_2" == "$CODIGO" ]] || fallo "el reintento cambio el codigo: $CODIGO -> $CODIGO_2"
[[ "$FILAS" == "1" ]]          || fallo "el reintento creo $FILAS filas: hay duplicado"
ok "el reintento actualizo la misma fila y conservo $CODIGO"
ok "una sola fila para el origen_id: sin duplicado silencioso"

# -----------------------------------------------------------------------------
paso "4. Sube la fotografia de la vivienda por URL prefirmada."
# -----------------------------------------------------------------------------
# La foto va directo al almacenamiento, sin atravesar la API. Con 15.000
# fotografias previstas a 200 KB, hacerlas pasar por el servidor es pagar
# computo y transferencia por mover bytes que nadie procesa.
RESULTADO_FOTO="$(en_aws "
  set -e
  RUTA='$CODIGO/fachada.jpg'
  printf '\xff\xd8\xff\xe0 foto de prueba \xff\xd9' > /tmp/foto.jpg

  URL=\$(aws --endpoint-url \"\$S3_ENDPOINT\" s3 presign \"s3://\$S3_BUCKET_FOTOS/\$RUTA\" --expires-in 900)
  echo \"subida:\$(curl -s -o /dev/null -w '%{http_code}' -X PUT --upload-file /tmp/foto.jpg \"\$URL\")\"

  aws --endpoint-url \"\$S3_ENDPOINT\" s3api head-object \
    --bucket \"\$S3_BUCKET_FOTOS\" --key \"\$RUTA\" >/dev/null 2>&1 \
    && echo 'en_bucket:si' || echo 'en_bucket:no'

  echo \"bloqueos:\$(aws --endpoint-url \"\$S3_ENDPOINT\" s3api get-public-access-block \
    --bucket \"\$S3_BUCKET_FOTOS\" \
    --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
    --output text | tr -d '\\t ')\"

  aws --endpoint-url \"\$S3_ENDPOINT\" s3api get-bucket-policy --bucket \"\$S3_BUCKET_FOTOS\" >/dev/null 2>&1 \
    && echo 'politica:si' || echo 'politica:no'

  echo \"acl_publico:\$(aws --endpoint-url \"\$S3_ENDPOINT\" s3api get-object-acl \
    --bucket \"\$S3_BUCKET_FOTOS\" --key \"\$RUTA\" \
    --query 'length(Grants[?Grantee.URI!=null])' --output text)\"

  echo \"sin_firma:\$(curl -s -o /dev/null -w '%{http_code}' \"\$S3_ENDPOINT/\$S3_BUCKET_FOTOS/\$RUTA\")\"
")"

tiene() { printf '%s' "$RESULTADO_FOTO" | grep -q "$1"; }

tiene 'subida:200'          || fallo "la subida prefirmada no devolvio 200: $RESULTADO_FOTO"
ok "la fotografia subio directo al almacenamiento con URL prefirmada"

tiene 'en_bucket:si'        || fallo "la fotografia no quedo en el bucket"
ok "quedo guardada bajo la ruta del caso, sin atravesar la API"

tiene 'bloqueos:TrueTrueTrueTrue' || fallo "el bucket no tiene los cuatro bloqueos de acceso publico"
ok "los cuatro bloqueos de acceso publico estan activos"

tiene 'politica:no'         || fallo "el bucket tiene una politica que podria abrirlo"
ok "sin politica de bucket que pueda abrirlo"

tiene 'acl_publico:0'       || fallo "el objeto tiene concesiones a grupos: es legible por terceros"
ok "el objeto no concede acceso a ningun grupo publico"

# El unico control que este entorno NO puede verificar. LocalStack no aplica IAM
# ni las politicas de bucket con el rigor de AWS: sirve el objeto a una peticion
# anonima aunque la configuracion diga lo contrario. En AWS real esa peticion
# devuelve 403.
#
# Es el punto 6 de SEGURIDAD.md, del que el propio documento dice que "es el que
# mas se olvida" y que probablemente sea el H7 de la proxima revision. Se deja
# anotado en vez de simulado: una prueba que pasa por complacencia del emulador
# es peor que no tenerla.
if tiene 'sin_firma:200'; then
  aviso "LocalStack sirve el objeto sin firma (200). En AWS seria 403."
  aviso "Verificacion pendiente contra preproduccion: SEGURIDAD.md punto 6."
else
  ok "sin firma no se puede leer"
fi

# -----------------------------------------------------------------------------
paso "5. La mesa verifica el caso."
# -----------------------------------------------------------------------------
SUB_COORD="$(docker compose exec -T db psql -U postgres -d raiz -tA \
  -c "select id from auth.users where email='coordinadora@ejemplo.test';" | tr -d '\r')"

ESTADO="$(como "$SUB_COORD" "
with verificado as (
update familias set estado_verificacion = 'verificado', verificado_por = 'Mesa de sistematizacion',
       fecha_verificacion = current_date
 where origen_id = '$ORIGEN_ID'
returning estado_verificacion)
select estado_verificacion from verificado;")"
[[ "$ESTADO" == "verificado" ]] || fallo "la mesa no pudo verificar el caso"
ok "la coordinacion verifico el caso: reportado -> verificado"

# El lider ya no puede editarlo: la politica exige estado <> 'verificado'.
EDITADAS="$(como "$SUB_ANA" "
with u as (update familias set personas_total = 99 where origen_id = '$ORIGEN_ID' returning 1)
select count(*) from u;")"
[[ "$EDITADAS" == "0" ]] || fallo "el lider modifico un caso ya verificado"
ok "el lider ya no puede alterar lo verificado por la mesa"

# -----------------------------------------------------------------------------
paso "6. La mesa lo remite a la entidad y radica."
# -----------------------------------------------------------------------------
# Sin numero de radicado la remision no es exigible: es el comentario que lleva
# la propia columna en el esquema.
REMISION="$(como "$SUB_COORD" "
with radicada as (
insert into remisiones (familia_id, entidad_id, asunto, fecha_envio, radicado, estado, responsable)
select f.id, e.id,
       'Solicitud de atencion por afectacion de vivienda',
       current_date - $DIAS_MORA,
       '$RADICADO', 'radicado', 'Mesa de sistematizacion'
from familias f, entidades e
where f.origen_id = '$ORIGEN_ID' and e.nombre = 'CMGRD Sevilla'
returning radicado)
select radicado from radicada;")"
[[ "$REMISION" == "$RADICADO" ]] || fallo "no se pudo radicar la remision"
ok "remitido a CMGRD Sevilla con radicado $RADICADO"

# -----------------------------------------------------------------------------
paso "7. Seguimiento: cuantos dias lleva la entidad sin responder."
# -----------------------------------------------------------------------------
# Es la palanca del proyecto. La mora tiene que CRECER cada dia; si el dato
# quedara congelado en la insercion, el tablero mostraria siempre cero y no
# presionaria a nadie. Ver hallazgos-revision.md H14.
MORA="$(como "$SUB_COORD" "
select dias_max_sin_respuesta from v_estado_gestion where entidad = 'CMGRD Sevilla';")"
[[ "$MORA" == "$DIAS_MORA" ]] \
  || fallo "la mora deberia ser $DIAS_MORA dias y el tablero muestra '$MORA'"
ok "el tablero de presion institucional muestra $MORA dias de mora"

SIN_RESP="$(como "$SUB_COORD" "
select sin_respuesta from v_estado_gestion where entidad = 'CMGRD Sevilla';")"
[[ "$SIN_RESP" == "1" ]] || fallo "el caso deberia figurar como sin respuesta"
ok "figura 1 caso sin respuesta ante la entidad"

# -----------------------------------------------------------------------------
paso "8. La entidad responde."
# -----------------------------------------------------------------------------
como "$SUB_COORD" "
update remisiones set estado = 'atendido', fecha_respuesta = current_date,
       respuesta = 'Visita programada y subsidio de arriendo aprobado'
 where radicado = '$RADICADO';" >/dev/null

LEIDO="$(como "$SUB_COORD" "
select atendidos || '/' || sin_respuesta || '/' || coalesce(dias_max_sin_respuesta::text,'sin mora')
from v_estado_gestion where entidad = 'CMGRD Sevilla';")"
[[ "$LEIDO" == "1/0/sin mora" ]] \
  || fallo "tras responder deberia quedar 1 atendido, 0 sin respuesta y sin mora; quedo '$LEIDO'"
ok "queda 1 atendido, 0 sin respuesta y la mora desaparece"

# -----------------------------------------------------------------------------
paso "9. El tablero publico lo muestra sin senalar a la familia."
# -----------------------------------------------------------------------------
PUB="$(como_anonimo "
select lat || '|' || lon || '|' || lugar || '|' || personas_total
from v_mapa_publico where codigo = '$CODIGO';")"
[[ -n "$PUB" ]] || fallo "el caso no aparece en el mapa publico"

LAT_PUB="${PUB%%|*}"
[[ "$LAT_PUB" == "4.312" ]] \
  || fallo "la coordenada publica deberia estar degradada a 3 decimales, y es $LAT_PUB"
ok "aparece en el mapa publico con la coordenada degradada a ~110 m ($LAT_PUB)"

FUGA="$(como_anonimo "
select count(*) from information_schema.columns
where table_name = 'v_mapa_publico'
  and column_name in ('jefe_nombres','jefe_apellidos','num_doc','tel_1');")"
[[ "$FUGA" == "0" ]] || fallo "la vista publica expone campos de identidad"
ok "sin nombre, documento ni telefono: ubica la afectacion, no la vivienda"

# -----------------------------------------------------------------------------
paso "10. Todo el recorrido quedo auditado."
# -----------------------------------------------------------------------------
SUB_CUST="$(docker compose exec -T db psql -U postgres -d raiz -tA \
  -c "select id from auth.users where email='custodia@ejemplo.test';" | tr -d '\r')"

HUELLAS="$(como "$SUB_CUST" "
select count(*) from auditoria a
where (a.tabla = 'familias'   and a.despues->>'origen_id' = '$ORIGEN_ID')
   or (a.tabla = 'remisiones' and a.despues->>'radicado'  = '$RADICADO');")"
(( HUELLAS >= 4 )) || fallo "se esperaban al menos 4 registros de auditoria y hay $HUELLAS"
ok "la custodia ve $HUELLAS movimientos auditados del caso"

CIEGO="$(como "$SUB_ANA" "select count(*) from auditoria;")"
[[ "$CIEGO" == "0" ]] || fallo "el lider alcanza la auditoria"
ok "el lider no ve la auditoria, ni la del caso que el mismo reporto"

# -----------------------------------------------------------------------------
printf '\n\033[1m==============================================\033[0m\n'
printf '\033[1m El ciclo completo funciona\033[0m\n'
printf '\033[1m==============================================\033[0m\n'
printf '  Capturado sin senal -> sincronizado -> %s\n' "$CODIGO"
printf '  Verificado -> remitido -> radicado %s\n' "$RADICADO"
printf '  Mora medida, respuesta registrada, caso cerrado\n'
printf '  Visible en el mapa publico sin identidad\n\n'
