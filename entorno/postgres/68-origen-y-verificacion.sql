-- =============================================================================
-- DE DONDE SALIO EL DATO, Y HASTA DONDE ESTA COMPROBADO — 19 de agosto de 2026
--
-- Son DOS EJES y no uno, y fundirlos pierde informacion en silencio:
--
--   ORIGEN         de donde salio el dato: lo vio quien registra, lo dijo la
--                  familia, lo conto un tercero, vino del listado de otra entidad.
--                  NO CAMBIA NUNCA.
--
--   VERIFICACION   hasta donde esta comprobado: autodeclarado, presencial,
--                  documental, tecnico, institucional. CAMBIA CON EL TIEMPO, y esa
--                  es toda su gracia.
--
-- Un caso puede ser «reportado por un tercero» —origen fijo— y aun asi subir de R1
-- a R4 cuando un ingeniero lo revise. En un solo campo, o se pierde el origen o se
-- pierde el historico.
--
-- Es la recomendacion G9 del estandar probatorio, que el propio documento habia
-- priorizado —«G3 y G9 primero: son baratos y son los que mas elevan la
-- confiabilidad»— y que no se habia ejecutado.
--
-- LO QUE ESTO PERMITE DECIR, y hoy no se puede: no «tenemos 437 afectaciones», sino
-- «437 reportadas, 291 verificadas presencialmente, 84 con validacion tecnica». Esa
-- frase es la diferencia entre una lista y una fuente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'origen_dato_t') then
    create type origen_dato_t as enum (
      'observado',        -- lo vio quien registra, estando ahi
      'familia',          -- lo dijo la familia sobre si misma
      'tercero',          -- lo conto un vecino, un lider, alguien mas
      'listado_entidad'   -- vino de un listado de otra entidad u organizacion
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'nivel_verificacion_t') then
    create type nivel_verificacion_t as enum (
      'r0_autodeclarado',
      'r1_reportado_tercero',
      'r2_verificado_presencial',
      'r3_verificado_documental',
      'r4_verificado_tecnico',
      'r5_validado_institucional'
    );
  end if;
end $$;

alter table familias add column if not exists origen_dato origen_dato_t;
alter table familias add column if not exists nivel_verificacion nivel_verificacion_t
  not null default 'r0_autodeclarado';

-- Quien subio el nivel y cuando. `verificado_por` y `fecha_verificacion` ya existian
-- para el estado de verificacion; esto es del otro eje y por eso va aparte.
alter table familias add column if not exists nivel_verificado_por uuid references perfiles(id);
alter table familias add column if not exists nivel_verificado_en  timestamptz;

comment on column familias.origen_dato is
  'De donde salio el dato. No cambia: es una propiedad del momento en que se levanto.';
comment on column familias.nivel_verificacion is
  'Hasta donde esta comprobado. Sube con el tiempo. R5 lo da una entidad, no nosotros.';

create index if not exists idx_familias_nivel on familias (nivel_verificacion);

-- -----------------------------------------------------------------------------
-- El evento
-- -----------------------------------------------------------------------------
-- «El terremoto es el evento que pone a funcionar la plataforma. La plataforma debe
-- sobrevivir al terremoto.» Tecnicamente, eso es esta tabla.
--
-- Hoy todos los casos pertenecen implicitamente al sismo del 10 de agosto. El dia
-- que haya una replica fuerte, o El Aguila, o el invierno de noviembre, no habria
-- forma de separarlos — y «muestrame las afectaciones de ESTE evento» es la primera
-- pregunta que hace una entidad.
create table if not exists eventos (
  id              bigserial primary key,
  codigo          text not null unique,          -- SISMO-2026-08-10
  tipo            text not null,                 -- sismo, inundacion, deslizamiento, incendio
  nombre          text not null,
  ocurrido_en     timestamptz,
  magnitud        text,                          -- texto: cada tipo de evento la mide distinto
  profundidad_km  numeric(6,2),
  fuente_oficial  text,                          -- SGC, IDEAM, UNGRD
  departamento    text,
  municipio       text,
  estado          text not null default 'activo',
  creado_en       timestamptz not null default now()
);

alter table familias add column if not exists evento_id bigint references eventos(id);
create index if not exists idx_familias_evento on familias (evento_id);

-- RLS desde el principio y no despues. La prueba P0 exige que NINGUNA tabla del
-- esquema publico quede sin activarlo, y esa regla existe para que la proxima tabla
-- que alguien agregue falle aqui en vez de fallar en produccion.
alter table eventos enable row level security;

drop policy if exists evento_lee_autenticado on eventos;
create policy evento_lee_autenticado on eventos
  for select to authenticated using (true);

drop policy if exists evento_lee_anonimo on eventos;
create policy evento_lee_anonimo on eventos
  for select to anon using (true);

drop policy if exists evento_admin_mesa on eventos;
create policy evento_admin_mesa on eventos
  for all to authenticated using (es_mesa()) with check (es_mesa());

-- El GRANT va aqui y no en 60-grants.sql porque esa tabla no existia cuando aquel
-- archivo corrio. Un catalogo se lee; escribirlo es de la mesa.
grant select on eventos to anon, authenticated;
grant insert, update, delete on eventos to authenticated;
grant usage, select on sequence eventos_id_seq to authenticated;

-- -----------------------------------------------------------------------------
-- El evento que ya estaba ocurriendo
-- -----------------------------------------------------------------------------
-- `on conflict do nothing`: esto se reconcilia en cada despliegue como los
-- catalogos, no se aplica una sola vez.
insert into eventos (codigo, tipo, nombre, ocurrido_en, departamento, municipio, fuente_oficial)
values (
  'SISMO-2026-08-10',
  'sismo',
  'Sismo del 10 de agosto de 2026',
  '2026-08-10 00:00:00-05',
  'Valle del Cauca',
  'Sevilla',
  'Servicio Geologico Colombiano'
)
on conflict (codigo) do nothing;

-- Los casos que ya existen son de ese sismo. Decirlo explicitamente es lo que
-- permite que el proximo evento no los arrastre.
update familias
   set evento_id = (select id from eventos where codigo = 'SISMO-2026-08-10')
 where evento_id is null;

-- -----------------------------------------------------------------------------
-- La vista del tablero muestra los dos ejes
-- -----------------------------------------------------------------------------
-- Sin esto, la pantalla que la mesa le enseña a una entidad seguiria presentando
-- juntos lo observado y lo referido, que es exactamente lo que el estandar
-- probatorio advierte que hace perder en un minuto la confiabilidad que costo meses
-- construir.
--
-- `create or replace` sobre una vista exige conservar el orden y el tipo de las
-- columnas que ya existian; las nuevas van al final.
create or replace view v_familias_tablero with (security_invoker = true) as
select
  f.id, f.codigo, f.zona, f.municipio,
  coalesce(f.vereda, f.barrio)         as lugar,
  f.jefe_nombres || ' ' || f.jefe_apellidos as responsable,
  f.tel_1, f.personas_total, f.menores, f.adultos_mayores,
  f.discapacidad_n, f.prioridad, f.estado_verificacion,
  v.tenencia, v.afectacion, v.habitable, v.riesgo_colapso,
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
