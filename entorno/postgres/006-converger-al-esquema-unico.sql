-- =============================================================================
-- LLEVAR LA BASE QUE YA EXISTE AL ESQUEMA UNICO — 1 de septiembre de 2026
--
-- El 21 de agosto el esquema se colapso de dieciseis archivos a uno, y se dio por
-- hecho que la base de produccion se recrearia desde cero porque \xc2\xabtodo era prueba\xc2\xbb.
-- Al mirarla de verdad aparecieron CATORCE PERFILES: catorce personas que perderian
-- el acceso, con sus cuentas de Cognito huerfanas, hasta que alguien las volviera a
-- crear una por una.
--
-- Eso cambia la cuenta. Recrear era barato cuando se creia que no habia nada;
-- con catorce accesos vivos, converger sale mas barato y no deja a nadie fuera.
--
-- QUE HACE. Dos cosas, y en este orden:
--
--   1. aplica lo que produccion nunca recibio (la antigua migracion 014)
--   2. retira las once columnas que el esquema unico ya no tiene
--
-- Al terminar, la estructura es IDENTICA a la que produce supabase/schema.sql sobre
-- una base vacia. Eso no se afirma: se comprobo comparando columna por columna una
-- replica de produccion con una base creada desde el esquema unico.
--
-- Y ESTA ES LA ULTIMA VEZ que el esquema se colapsa. A partir de aqui hay datos que
-- no se pueden perder, asi que cada cambio de estructura vuelve a ser una migracion
-- numerada que se agrega a la lista de aplicar.sh y nunca se pliega.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lo que produccion nunca recibio
-- -----------------------------------------------------------------------------

-- Los valores nuevos de los tipos que ya existen.
alter type afectacion_t add value if not exists 'no_determinado';
alter type tenencia_t   add value if not exists 'no_informa';

alter type necesidad_t add value if not exists 'alojamiento_temporal';
alter type necesidad_t add value if not exists 'atencion_medica';
alter type necesidad_t add value if not exists 'apoyo_dependencia';
alter type necesidad_t add value if not exists 'alimentacion_especial';
-- Proteccion: personas solas, familias expuestas, riesgo de violencia. Se marca la
-- necesidad y NO se piden detalles: lo que sigue es una ruta especializada, no un
-- campo de texto en una ficha que llena un vecino.
alter type necesidad_t add value if not exists 'proteccion';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'habitabilidad_t') then
    create type habitabilidad_t as enum (
      'habitable',
      'habitable_con_restricciones',
      'no_habitable',
      'evacuada',
      'no_determinado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'riesgo_visible_t') then
    create type riesgo_visible_t as enum (
      'no_observado',
      'requiere_evaluacion',
      'peligro_evidente'
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- La vivienda
-- -----------------------------------------------------------------------------
alter table viviendas add column if not exists habitabilidad habitabilidad_t;
alter table viviendas add column if not exists riesgo_visible riesgo_visible_t;
alter table viviendas add column if not exists danos_visibles text[] not null default '{}';
alter table viviendas add column if not exists dano_descripcion text
  check (dano_descripcion is null or length(dano_descripcion) <= 500);
-- Que documento tiene la familia, NO el documento. Caracterizar sin pedir papeles: si
-- despues hay una ruta juridica, ahi se solicita lo que haga falta. Recoger escrituras
-- hoy seria acumular documentos sensibles que nadie necesita todavia.
alter table viviendas add column if not exists documentos_tenencia text[] not null default '{}';

comment on column viviendas.habitabilidad is
  'Si se puede estar ahi. Depende del dano pero NO es el dano.';
comment on column viviendas.riesgo_visible is
  'Alerta comunitaria, no dictamen. El nivel alto dice no ingresar, no colapso inminente.';
comment on column viviendas.danos_visibles is
  'Lista cerrada, para que el consolidado por vereda sea sumable.';

-- El booleano anterior queda, y se rellena el eje nuevo con lo que ya se sabia. Un
-- registro viejo con habitable=false no dice si la familia evacuo ni si hay
-- restricciones, asi que se traduce a lo minimo defendible y nada mas.
--
-- «A simple vista, esta casa amenaza con caerse» se traduce a PELIGRO EVIDENTE y no a
-- «requiere evaluacion». Ante la duda se sobreestima: equivocarse hacia arriba manda a
-- alguien a mirar de mas, y hacia abajo deja a una familia bajo algo que se puede caer.
-- Es la misma regla que usa el calculo de prioridad, escrita en los dos sitios porque
-- se aplica a cosas distintas —el pasado aqui, lo que llega alla— y tiene que coincidir.
-- Los rellenos van dentro de una comprobacion porque leen columnas que este mismo
-- archivo borra mas abajo. Sin ella, correrlo dos veces falla con «column habitable
-- does not exist» — y aunque el registro de migraciones impide que eso pase en el
-- despliegue, una migracion que solo es segura porque algo mas la vigila no es segura.
do $relleno$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'viviendas' and column_name = 'habitable') then
    update viviendas
       set habitabilidad = (case when habitable then 'habitable' else 'no_habitable' end)::habitabilidad_t
     where habitabilidad is null;
  end if;

  if exists (select 1 from information_schema.columns
              where table_name = 'viviendas' and column_name = 'riesgo_colapso') then
    update viviendas
       set riesgo_visible = (case when riesgo_colapso then 'peligro_evidente' else 'no_observado' end)::riesgo_visible_t
     where riesgo_visible is null;
  end if;
end $relleno$;

create index if not exists idx_viviendas_habitabilidad on viviendas (habitabilidad);
create index if not exists idx_viviendas_riesgo on viviendas (riesgo_visible)
  where riesgo_visible = 'peligro_evidente';

-- -----------------------------------------------------------------------------
-- El caso
-- -----------------------------------------------------------------------------
alter table familias add column if not exists tipos_evidencia text[] not null default '{}';
alter table familias add column if not exists prioridad_motivos text[] not null default '{}';
-- Si la calculo el sistema o la puso una persona. La excepcion manual existe para la
-- emergencia que no cabe en ninguna regla, y conviene poder distinguirlas despues.
alter table familias add column if not exists prioridad_calculada boolean not null default false;

-- Ruta de apoyo, en lugar del convenio con una organizacion concreta.
--
-- La pertenencia a organizaciones sociales es dato sensible, y «el caso se postula al
-- convenio» promete algo que depende de un tercero. Se cambia por lo unico que Raiz
-- puede ofrecer con verdad: preguntar si la familia QUIERE ser orientada, y dejar
-- constancia del estado de esa remision.
alter table familias add column if not exists desea_ruta_apoyo boolean;
alter table familias add column if not exists ruta_apoyo_organizacion text;
alter table familias add column if not exists ruta_apoyo_estado text;

comment on column familias.prioridad_motivos is
  'Por que quedo en esa prioridad. Es lo que hace que la letra se sostenga sola.';
comment on column familias.desea_ruta_apoyo is
  'Si la familia quiere ser orientada hacia un programa de apoyo. Reemplaza la '
  'postulacion a un convenio concreto, que prometia lo que depende de un tercero.';

-- -----------------------------------------------------------------------------
-- UNA SOLA VIVIENDA PRINCIPAL POR HOGAR
-- -----------------------------------------------------------------------------
-- Se descubrio el 20 de agosto corriendo las pruebas de acceso: una familia con dos
-- viviendas marcadas como principal aparece DOS VECES en el tablero, porque la vista
-- une familias con viviendas y ese `left join` multiplica la fila.
--
-- Es el peor defecto posible en un censo y no da error: el total sube solo, y el total
-- es la palanca con la que se le pide a una entidad. Una cifra inflada que alguien
-- verifique en terreno desmonta la confianza del registro entero.
--
-- Como llegaron a haber dos. Las semillas locales usaban `on conflict do nothing`
-- creyendo que eso bastaba, pero `on conflict` sin una restriccion que violar no
-- protege de nada: la segunda insercion simplemente entra. Al reiniciarse el entorno,
-- la siembra corrio de nuevo y duplico las viviendas de los dos casos de prueba.
--
-- La API no tenia el defecto —borra la principal antes de insertar— pero el esquema si
-- lo permitia, y una regla que solo vive en el codigo de la aplicacion es una regla que
-- alguna ruta futura se va a saltar.
--
-- Se limpian los duplicados conservando el mas reciente: es el que refleja la ultima
-- visita, y ademas es el que la API habria dejado.
delete from viviendas v
 where v.es_principal
   and exists (
     select 1 from viviendas otra
      where otra.familia_id = v.familia_id
        and otra.es_principal
        and otra.id > v.id
   );

create unique index if not exists uq_vivienda_principal
  on viviendas (familia_id) where es_principal;

-- -----------------------------------------------------------------------------
-- 2. Las once columnas que el esquema unico ya no tiene
-- -----------------------------------------------------------------------------
--
-- Se retiran DESPUES de agregar lo nuevo, y ese orden importa: `habitable` y
-- `riesgo_colapso` alimentan el relleno de `habitabilidad` y `riesgo_visible` que hace
-- el bloque de arriba. Al reves, los registros que ya existen quedarian sin traducir.
--
-- Las vistas se recrean primero porque dependen de esas columnas y PostgreSQL no deja
-- borrar una columna de la que cuelga una vista. Se recrean con la definicion del
-- esquema unico, que ya usa los ejes nuevos.

drop view if exists v_familias_tablero;
drop view if exists v_mapa_publico;

alter table viviendas drop column if exists habitable;
alter table viviendas drop column if exists riesgo_colapso;
alter table viviendas drop column if exists riesgo_colapso_desc;

alter table familias drop column if exists medicamento_cual;
alter table familias drop column if exists afiliada_federacion;
alter table familias drop column if exists aplica_convenio;
alter table familias drop column if exists convenio_linea;
alter table familias drop column if exists convenio_obs;
alter table familias drop column if exists sensibles_segregados_en;

create view v_familias_tablero with (security_invoker = true) as
select
  f.id, f.codigo, f.zona, f.municipio,
  coalesce(f.vereda, f.barrio)         as lugar,
  f.jefe_nombres || ' ' || f.jefe_apellidos as responsable,
  f.tel_1, f.personas_total, f.menores, f.adultos_mayores,
  f.discapacidad_n, f.prioridad, f.estado_verificacion,
  v.tenencia, v.afectacion, v.habitabilidad, v.riesgo_visible,
  f.lat, f.lon,
  (select count(*) from fotos       x where x.familia_id = f.id) as n_fotos,
  (select count(*) from remisiones  r where r.familia_id = f.id) as n_remisiones,
  (select count(*) from remisiones  r where r.familia_id = f.id
     and r.estado in ('enviado','radicado','en_tramite')
     and r.fecha_respuesta is null)                              as remisiones_sin_respuesta,
  (select count(*) from ayudas      a where a.familia_id = f.id
     and a.estado = 'entregada')                                 as ayudas_entregadas,
  f.fecha_registro,
  f.origen_dato,
  f.nivel_verificacion
from familias f
left join viviendas v on v.familia_id = f.id and v.es_principal
where f.estado_verificacion <> 'duplicado';

create view v_mapa_publico as
select
  f.codigo,
  f.zona,
  f.municipio,
  coalesce(f.vereda, f.barrio) as lugar,
  f.prioridad,
  f.personas_total,
  f.menores,
  f.adultos_mayores,
  v.afectacion,
  v.habitabilidad,
  round(f.lat::numeric, 3) as lat,
  round(f.lon::numeric, 3) as lon,
  f.fecha_registro
from familias f
left join viviendas v on v.familia_id = f.id and v.es_principal
where f.estado_verificacion <> 'duplicado'
  and f.lat is not null;

grant select on v_familias_tablero to authenticated;
grant select on v_mapa_publico to anon, authenticated;
