# =============================================================================
# Imagen que aplica el esquema de Raiz sobre RDS.
#
# El contexto de construccion es la RAIZ del repositorio, porque los archivos SQL
# viven en dos sitios —supabase/ y entorno/postgres/— y esta imagen los junta:
#
#   docker build -f entorno/aws/migraciones/Dockerfile -t raiz-migraciones .
#
# POR QUE UNA IMAGEN Y NO psql DESDE LA MAQUINA DE ALGUIEN
#
# Porque la base no es alcanzable desde ninguna maquina, y eso es a proposito:
# vive en subredes sin ruta a internet y su grupo de seguridad solo acepta al de
# la API. Para llegarle hay que estar dentro de la VPC.
#
# La salida barata seria abrirla un rato "solo para cargar el esquema". Esa es
# exactamente la puerta que despues nadie cierra, y la que convierte "la base no
# recibe trafico publico" en una frase de la documentacion. Correr una tarea
# efimera adentro cuesta lo mismo y no abre nada.
#
# Y hay una segunda razon, que es la HU 1.1.3: el despliegue aplica las
# migraciones, no una persona. Esto es esa pieza.
# =============================================================================
FROM postgres:16-alpine

# psql ya viene en la imagen. No se instala nada mas: lo que no esta no hay que
# parchearlo, y esta imagen tiene la credencial de administrador de la base
# durante los pocos segundos que corre.

WORKDIR /migraciones

# Los archivos se copian con nombre numerado, que es el orden en que se aplican.
# El nombre del destino es la CLAVE con la que quedan registrados en la base, asi
# que renombrar uno despues de aplicado lo haria correr otra vez.
COPY entorno/postgres/00-shim-auth.sql  ./001-shim-auth.sql
COPY entorno/postgres/01-roles.sql      ./002-roles.sql
COPY supabase/schema.sql                ./003-schema.sql
COPY entorno/postgres/60-grants.sql     ./004-grants.sql
COPY entorno/postgres/65-acceso-api.sql ./005-acceso-api.sql

# Los catalogos NO son una migracion, y el criterio de la HU 1.1.3 lo dice con
# esas palabras. Son datos que se reconcilian en cada despliegue —el archivo usa
# `on conflict do nothing`— y no un cambio de estructura que ocurre una vez.
COPY entorno/postgres/70-semillas-catalogos.sql ./catalogos.sql

COPY entorno/aws/migraciones/aplicar.sh  ./aplicar.sh
COPY entorno/aws/migraciones/custodio.sh ./custodio.sh
RUN chmod +x ./aplicar.sh ./custodio.sh

# ENTRYPOINT es el interprete y CMD el guion, en vez de poner aplicar.sh como
# entrypoint directo. La razon es concreta: ECS permite sobrescribir `command` en
# una tarea pero NO `entryPoint`, asi que con el guion en CMD la misma imagen
# corre tambien la siembra del custodio sin construir otra.
ENTRYPOINT ["/bin/sh"]
CMD ["/migraciones/aplicar.sh"]
