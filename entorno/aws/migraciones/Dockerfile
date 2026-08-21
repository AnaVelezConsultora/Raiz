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
COPY entorno/postgres/55-fotos-subida.sql     ./006-fotos-subida.sql
COPY entorno/postgres/56-perfiles-alta.sql    ./007-perfiles-alta.sql
# Llego numerada como 006 en su rama y aqui va de 008: en produccion ya figuran
# aplicadas una 006 y una 007 con otro contenido, y la clave del registro es el
# NOMBRE. Dejarle el 006 no habria roto nada —se habria aplicado igual, por
# llamarse distinto— pero la secuencia dejaria de leerse como una sola historia.
COPY entorno/postgres/66-campos-de-terreno.sql ./008-campos-de-terreno.sql

# Las tres autorizaciones y la auditoria que faltaba en viviendas, produccion y
# ayudas. Misma regla de numeracion: la clave del registro es el nombre, asi que
# aqui va la siguiente libre y no la que traia en su rama.
COPY entorno/postgres/67-autorizaciones.sql ./009-autorizaciones.sql
COPY entorno/postgres/68-origen-y-verificacion.sql ./010-origen-y-verificacion.sql

# La infraestructura afectada. Va DESPUES de la 010 y no antes, porque cuelga sus
# puntos del evento que aquella crea: aplicada al reves, la referencia no existe.
COPY entorno/postgres/69-puntos-de-servicio.sql ./011-puntos-de-servicio.sql

# Constancia de visitas oficiales a la edificacion.
COPY entorno/postgres/71-visita-oficial.sql ./012-visita-oficial.sql

# Los dos contadores de la segunda pantalla: quien no esta y quien no puede salir solo.
COPY entorno/postgres/72-hogar-y-atencion-prioritaria.sql ./013-hogar-y-atencion-prioritaria.sql

# Los tres ejes del dano, la evidencia y la prioridad con sus motivos.
COPY entorno/postgres/73-dano-observado-y-evidencia.sql ./014-dano-observado-y-evidencia.sql

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
