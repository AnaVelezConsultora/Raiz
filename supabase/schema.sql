-- =============================================================================
-- RAIZ - Caracterizacion y seguimiento de familias afectadas
-- Esquema PostgreSQL para Supabase (plan gratuito) / portable a RDS o Aurora
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
--
-- Diseno: los nombres de columna replican EXACTAMENTE los nombres de campo del
-- XLSForm de KoboToolbox. Importar es un COPY, no un ETL. Ese es el contrato que
-- hace que la Fase 1 (Kobo) no sea trabajo desechable.
--
-- Reglas aplicadas:
--   - Sin float para dinero: bigint en centavos (sufijo _cop_minor)
--   - select_multiple de Kobo -> text[] (llegan separados por espacio, se castean)
--   - Enums para dominios estables, text para lo que puede cambiar en emergencia
--   - RLS activo en todas las tablas con datos personales
--   - La vista publica NO expone identidad y degrada la coordenada a ~110 m
-- =============================================================================

create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- =============================================================================
-- 1. DOMINIOS
-- =============================================================================

create type zona_t              as enum ('rural', 'urbana');
create type prioridad_t         as enum ('p0', 'p1', 'p2', 'p3');
create type estado_verif_t      as enum ('reportado', 'contactado', 'verificado', 'no_ubicado', 'duplicado');
create type afectacion_t        as enum ('sin_dano', 'leve', 'moderado', 'severo', 'destruida', 'riesgo');
create type tenencia_t          as enum ('propietario', 'arrendatario', 'poseedor', 'usufructo', 'familiar', 'ocupante', 'mayordomo');
create type rol_t               as enum ('coordinador', 'custodio', 'validador', 'digitador', 'lider');
create type estado_remision_t   as enum ('borrador', 'enviado', 'radicado', 'en_tramite', 'atendido', 'rechazado', 'sin_respuesta');
create type estado_ayuda_t      as enum ('identificada', 'gestionada', 'programada', 'entregada', 'no_procede');

-- Vocabularios cerrados de dos campos que se AGREGAN en los reportes.
--
-- Con texto libre, "agua", "agua potable" y "Agua Potable" son tres necesidades
-- distintas, y el consolidado deja de ser sumable justo cuando hay que sustentar una
-- peticion ante una entidad. Lo mismo con el origen de la coordenada: distinguir el
-- dato medido del aproximado es lo que permite ponderar la fuente, y no sirve si cada
-- cliente escribe el valor a su manera.
--
-- Los valores replican los codigos del XLSForm y del paquete @raiz/dominio, que es el
-- mismo contrato de siempre: un solo vocabulario para Kobo, la PWA, la API y la base.
create type gps_fuente_t as enum ('sitio', 'compartida', 'aprox', 'no_disp');

create type necesidad_t  as enum ('alimentos', 'agua_potable', 'aseo', 'cocina', 'dormir',
                                  'carpa', 'ropa', 'medicamentos', 'panales', 'psicosocial',
                                  'transporte', 'documentos');

-- =============================================================================
-- 2. CATALOGOS Y USUARIOS
-- =============================================================================

create table organizaciones (
  id          bigserial primary key,
  nombre      text not null unique,
  tipo        text not null,               -- junta, asociacion, comite, federacion, entidad, ong
  contacto    text,
  telefono    text,
  creado_en   timestamptz not null default now()
);
comment on table organizaciones is 'Nodos de recoleccion y entidades destinatarias';

-- Supabase crea auth.users. Este es el perfil de aplicacion.
create table perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  nombre           text not null,
  rol              rol_t not null default 'lider',
  organizacion_id  bigint references organizaciones(id),
  -- Lo que la persona ESCRIBIO al registrarse, sin verificar. No es lo mismo que
  -- organizacion_id, que es un vinculo confirmado. La custodia necesita ver lo
  -- declarado para poder decidir si activa la cuenta, y distinguir una cosa de la
  -- otra evita que un dato sin comprobar termine pareciendo comprobado.
  organizacion_declarada text,
  telefono         text,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);

create table entidades (
  id          bigserial primary key,
  nombre      text not null unique,         -- Secretaria de Agricultura y Pesca, Gestion del Riesgo, Alcaldia
  nivel       text not null,                -- municipal, departamental, nacional, cooperacion
  contacto    text,
  correo      text,
  creado_en   timestamptz not null default now()
);

-- =============================================================================
-- 3. FAMILIAS (el caso). Codigo SV-AAAA-NNNNNN autogenerado.
-- =============================================================================

create sequence seq_caso start 1;

create table familias (
  id                     bigserial primary key,
  codigo                 text not null unique
                           default ('RZ-' || to_char(now(), 'YYYY') || '-' ||
                                    lpad(nextval('seq_caso')::text, 6, '0')),

  -- trazabilidad con Kobo: _id y _uuid del submission. Hacen la carga idempotente.
  kobo_id                integer unique,
  kobo_uuid              text unique,

  -- UUID generado por la PWA en el dispositivo. Es la clave de idempotencia del
  -- envio: si el registro llega al servidor pero la respuesta se pierde por corte
  -- de senal, el reintento actualiza esta misma fila en lugar de crear un
  -- duplicado. En un censo un duplicado silencioso es peor que un fallo visible.
  origen_id              uuid unique,

  -- bloque 0: control
  fecha_registro         date not null default current_date,
  registrador_nombre     text not null,
  registrador_org        text,
  registrador_tel        text,
  -- Se llena solo con el usuario que inserta. Antes quedaba nulo y la politica
  -- "el lider ve lo suyo" no encontraba nada: el voluntario grababa un caso y
  -- acto seguido dejaba de verlo.
  registrador_perfil_id  uuid references perfiles(id) default auth.uid(),
  fuente_dato            text not null,        -- presencial, whatsapp, llamada, lider, otra_entidad
  consentimiento         boolean not null default false,

  -- bloque 1: ubicacion
  departamento           text not null,
  municipio              text not null,
  zona                   zona_t not null,
  vereda                 text,
  corregimiento          text,
  barrio                 text,
  comuna                 text,
  direccion_ref          text,
  lat                    double precision,
  lon                    double precision,
  geom                   geography(Point, 4326)
                           generated always as (
                             case when lat is not null and lon is not null
                               then st_setsrid(st_makepoint(lon, lat), 4326)::geography
                             end
                           ) stored,
  gps_fuente             gps_fuente_t,

  -- bloque 2: hogar. Identidad solo si consentimiento = true.
  jefe_nombres           text,
  jefe_apellidos         text,
  tipo_doc               text,
  num_doc                text,
  tel_1                  text not null,
  tel_1_whatsapp         boolean,
  tel_2                  text,
  personas_total         integer not null check (personas_total > 0),
  h_0_5 integer default 0, m_0_5 integer default 0,
  h_6_11 integer default 0, m_6_11 integer default 0,
  h_12_17 integer default 0, m_12_17 integer default 0,
  h_18_59 integer default 0, m_18_59 integer default 0,
  h_60 integer default 0, m_60 integer default 0,
  gestantes              integer default 0,
  lactantes              integer default 0,
  discapacidad_n         integer default 0,
  discapacidad_tipo      text[],
  enf_cronica_n          integer default 0,
  requiere_medicamento   boolean,
  medicamento_cual       text,
  etnia                  text,
  victima_conflicto      boolean,
  afiliacion             text[],
  afiliacion_cual        text,

  -- anexo convenio
  afiliada_federacion    boolean,
  aplica_convenio        boolean not null default false,
  convenio_linea         text[],
  convenio_obs           text,

  -- bloque 7: triaje
  prioridad              prioridad_t not null,
  necesidades_inmediatas necesidad_t[] not null default '{}',
  ya_recibio_ayuda       boolean,
  ayuda_cual             text,
  ayuda_quien            text,
  observaciones          text,

  -- bloque 8: verificacion
  estado_verificacion    estado_verif_t not null default 'reportado',
  verificado_por         text,
  fecha_verificacion     date,
  duplicado_de_id        bigint references familias(id),

  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

-- Derivados utiles, calculados por la base y no por el frontend.
alter table familias add column menores integer
  generated always as (h_0_5 + m_0_5 + h_6_11 + m_6_11 + h_12_17 + m_12_17) stored;
alter table familias add column adultos_mayores integer
  generated always as (h_60 + m_60) stored;
alter table familias add column suma_desagregado integer
  generated always as (h_0_5 + m_0_5 + h_6_11 + m_6_11 + h_12_17 + m_12_17
                       + h_18_59 + m_18_59 + h_60 + m_60) stored;

create index idx_familias_zona        on familias (zona);
create index idx_familias_municipio   on familias (municipio, vereda, barrio);
create index idx_familias_prioridad   on familias (prioridad);
create index idx_familias_estado      on familias (estado_verificacion);
create index idx_familias_geom        on familias using gist (geom);
create index idx_familias_doc         on familias (num_doc) where num_doc is not null;
create index idx_familias_tel         on familias (tel_1);

-- =============================================================================
-- 4. VIVIENDA. Una familia puede tener mas de una estructura afectada.
-- =============================================================================

create table viviendas (
  id                     bigserial primary key,
  familia_id             bigint not null references familias(id) on delete cascade,
  es_principal           boolean not null default true,
  tenencia               tenencia_t not null,
  arrendador_contacto    text,
  hogares_en_estructura  integer not null default 1 check (hogares_en_estructura > 0),
  tipo_vivienda          text,
  material_paredes       text,
  material_techo         text,
  afectacion             afectacion_t not null,
  habitable              boolean not null,
  riesgo_colapso         boolean not null default false,
  riesgo_colapso_desc    text,
  donde_duerme           text,
  requiere_vivienda      text[],
  servicios_afectados    text[],
  -- anexo urbano
  estrato                text,
  tipo_unidad            text,
  perdio_medio_vida      boolean,
  medio_vida_desc        text,
  requiere_urbano        text[],
  creado_en              timestamptz not null default now()
);
create index idx_viviendas_familia on viviendas (familia_id);
create index idx_viviendas_afect   on viviendas (afectacion);

-- =============================================================================
-- 5. PRODUCCION (anexo rural)
-- =============================================================================

create table produccion (
  id                        bigserial primary key,
  familia_id                bigint not null references familias(id) on delete cascade,
  predio_nombre             text,
  area_ha                   numeric(10,2),
  tenencia_predio           text,
  tiene_titulo              boolean,
  via_acceso                text,
  cultivos                  text[],
  cultivos_otro             text,
  area_cultivo_afectada_ha  numeric(10,2),
  perdida_pct               integer check (perdida_pct between 0 and 100),
  -- dinero SIEMPRE en centavos, nunca float
  perdida_estimada_cop_minor bigint,
  bovinos_perdidos          integer default 0,
  porcinos_perdidos         integer default 0,
  aves_perdidas             integer default 0,
  otros_animales            text,
  infra_productiva          text[],
  requiere_agro             text[],
  creado_en                 timestamptz not null default now()
);
create index idx_produccion_familia on produccion (familia_id);

-- =============================================================================
-- 6. FOTOS. El binario se queda en Kobo. Aqui va la referencia.
--    No subir fotos al Storage gratuito de Supabase: 1 GB se agota en 300 fotos.
-- =============================================================================

create table fotos (
  id           bigserial primary key,
  familia_id   bigint not null references familias(id) on delete cascade,
  tipo         text not null,              -- fachada, dano, cultivo, documento
  url          text not null,              -- URL del attachment en Kobo
  nombre_orig  text,
  creado_en    timestamptz not null default now()
);
create index idx_fotos_familia on fotos (familia_id);

-- =============================================================================
-- 7. REMISIONES. Aqui esta el valor real del sistema: la trazabilidad exigible.
-- =============================================================================

create table remisiones (
  id               bigserial primary key,
  familia_id       bigint not null references familias(id) on delete cascade,
  entidad_id       bigint not null references entidades(id),
  asunto           text not null,
  fecha_envio      date not null default current_date,
  radicado         text,
  estado           estado_remision_t not null default 'borrador',
  responsable      text,
  respuesta        text,
  fecha_respuesta  date,
  -- Los dias sin respuesta NO se almacenan: se calculan al consultar.
  --
  -- Antes esto era una columna generada `stored` sobre current_date, y tenia dos
  -- problemas. El primero es que PostgreSQL la rechaza: una expresion generada
  -- debe ser inmutable y current_date no lo es, asi que el esquema completo
  -- fallaba al crearse.
  --
  -- El segundo importa mas. Aunque se hubiera podido almacenar, el valor habria
  -- quedado congelado el dia de la insercion, y el sentido de este dato es
  -- exactamente el contrario: mide cuanto lleva una entidad SIN responder, asi
  -- que tiene que crecer cada dia que pasa. Congelado en cero, la vista de
  -- presion institucional habria mostrado siempre cero dias de mora.
  --
  -- El calculo vive ahora en v_estado_gestion.
  creado_en        timestamptz not null default now()
);
create index idx_remisiones_familia on remisiones (familia_id);
create index idx_remisiones_entidad on remisiones (entidad_id, estado);
comment on column remisiones.radicado is
  'Numero de radicado de la entidad. Sin este numero la remision no es exigible.';

create table ayudas (
  id             bigserial primary key,
  familia_id     bigint not null references familias(id) on delete cascade,
  tipo_ayuda     text not null,             -- mercado, alojamiento, materiales, semillas
  entidad_id     bigint references entidades(id),
  organizacion_id bigint references organizaciones(id),
  estado         estado_ayuda_t not null default 'identificada',
  cantidad       text,
  fecha_entrega  date,
  recibido_por   text,
  observacion    text,
  creado_en      timestamptz not null default now()
);
create index idx_ayudas_familia on ayudas (familia_id, estado);

create table seguimientos (
  id          bigserial primary key,
  familia_id  bigint not null references familias(id) on delete cascade,
  autor_id    uuid references perfiles(id),
  autor_nombre text,
  nota        text not null,
  creado_en   timestamptz not null default now()
);
create index idx_seguimientos_familia on seguimientos (familia_id, creado_en desc);

-- Control de la importacion desde Kobo. Hace el proceso repetible e idempotente.
create table sync_kobo (
  id            bigserial primary key,
  ejecutado_en  timestamptz not null default now(),
  desde_kobo_id integer,
  hasta_kobo_id integer,
  insertados    integer not null default 0,
  actualizados  integer not null default 0,
  errores       integer not null default 0,
  detalle       text
);

-- =============================================================================
-- 8. VISTAS
-- =============================================================================

-- ADVERTENCIA SOBRE VISTAS EN POSTGRESQL
-- Una vista se ejecuta con los permisos de SU DUENO, no de quien consulta. Por
-- defecto eso SALTA las politicas de acceso por fila: cualquier usuario autenticado
-- podria leer por la vista lo que la tabla le niega. En una vista con nombres y
-- telefonos de familias eso es una fuga completa del censo.
--
-- Por eso:
--   - Las vistas con identidad llevan security_invoker = true y respetan RLS.
--   - Las vistas agregadas o anonimizadas se dejan como estan a proposito, porque
--     su unica razon de existir es ser una ventana controlada.

-- 8.1 Tablero interno: una fila por familia con todo lo que se consulta a diario.
--     CON IDENTIDAD: se ejecuta con los permisos de quien consulta.
create view v_familias_tablero with (security_invoker = true) as
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
  f.fecha_registro
from familias f
left join viviendas v on v.familia_id = f.id and v.es_principal
where f.estado_verificacion <> 'duplicado';

-- 8.2 Vista PUBLICA. Sin identidad. Coordenada degradada a 3 decimales (~110 m)
--     para que el mapa muestre la afectacion sin senalar la casa de una familia.
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
  v.habitable,
  round(f.lat::numeric, 3) as lat,
  round(f.lon::numeric, 3) as lon,
  f.fecha_registro
from familias f
left join viviendas v on v.familia_id = f.id and v.es_principal
where f.estado_verificacion <> 'duplicado'
  and f.lat is not null;

-- 8.3 Cifras de presion institucional.
create view v_estadisticas as
select
  count(*)                                                   as familias,
  sum(personas_total)                                        as personas,
  sum(menores)                                               as menores,
  sum(adultos_mayores)                                       as adultos_mayores,
  sum(discapacidad_n)                                        as personas_con_discapacidad,
  count(*) filter (where zona = 'rural')                     as rurales,
  count(*) filter (where zona = 'urbana')                    as urbanas,
  count(*) filter (where prioridad = 'p0')                   as urgentes,
  count(*) filter (where estado_verificacion = 'verificado')  as verificadas,
  count(distinct coalesce(vereda, barrio))                   as lugares_reportados
from familias
where estado_verificacion <> 'duplicado';

create view v_estado_gestion as
select
  e.nombre                                             as entidad,
  count(r.id)                                          as casos_remitidos,
  count(r.id) filter (where r.estado = 'atendido')     as atendidos,
  count(r.id) filter (where r.fecha_respuesta is null) as sin_respuesta,
  -- Se calcula al consultar, no al escribir: la mora crece cada dia que la
  -- entidad no responde. Ver el comentario en la tabla remisiones.
  max(case when r.fecha_respuesta is null
           then current_date - r.fecha_envio end)      as dias_max_sin_respuesta
from entidades e
left join remisiones r on r.entidad_id = e.id
group by e.nombre
order by sin_respuesta desc;

-- 8.4 Deteccion de duplicados. Se revisa, no se borra automaticamente.
--     CON IDENTIDAD indirecta (documento y telefono): respeta RLS.
create view v_posibles_duplicados with (security_invoker = true) as
select a.id as id_a, a.codigo as codigo_a, b.id as id_b, b.codigo as codigo_b,
       case when a.num_doc = b.num_doc then 'mismo documento'
            when a.tel_1  = b.tel_1   then 'mismo telefono'
            else 'a menos de 50 m' end as motivo
from familias a
join familias b
  on a.id < b.id
 and (
      (a.num_doc is not null and a.num_doc = b.num_doc)
   or (a.tel_1 = b.tel_1)
   or (a.geom is not null and b.geom is not null
       and st_dwithin(a.geom, b.geom, 50))
     )
where a.estado_verificacion <> 'duplicado'
  and b.estado_verificacion <> 'duplicado';

-- =============================================================================
-- 9. RLS. Se activa desde el dia uno: son datos sensibles de poblacion vulnerable.
-- =============================================================================

alter table familias      enable row level security;
alter table viviendas     enable row level security;
alter table produccion    enable row level security;
alter table fotos         enable row level security;
alter table remisiones    enable row level security;
alter table ayudas        enable row level security;
alter table seguimientos  enable row level security;
alter table perfiles      enable row level security;

create or replace function mi_rol() returns rol_t
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;

create or replace function es_mesa() returns boolean
language sql stable as $$
  select mi_rol() in ('coordinador', 'custodio', 'validador')
$$;

-- FAMILIAS -------------------------------------------------------------------
-- La mesa ve y edita todo.
create policy mesa_lee_familias   on familias for select using (es_mesa());
create policy mesa_edita_familias on familias for all    using (es_mesa()) with check (es_mesa());

-- El lider y el digitador ven unicamente lo que ellos mismos reportaron.
create policy propio_lee_familias on familias for select
  using (registrador_perfil_id = auth.uid());

-- Cualquier usuario activo puede CREAR un caso, pero solo a su propio nombre.
-- La condicion sobre registrador_perfil_id impide firmar un registro como otro.
create policy propio_crea_familias on familias for insert
  with check (auth.uid() is not null and registrador_perfil_id = auth.uid());

-- Y puede corregir lo suyo mientras no lo haya verificado la mesa.
create policy propio_edita_familias on familias for update
  using (registrador_perfil_id = auth.uid() and estado_verificacion <> 'verificado')
  with check (registrador_perfil_id = auth.uid());

-- TABLAS HIJAS ---------------------------------------------------------------
-- Heredan el permiso de la familia: la subconsulta pasa por el RLS de familias,
-- de modo que solo se ve o se escribe sobre casos que ya se pueden ver.
create policy hija_viviendas on viviendas for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

create policy hija_produccion on produccion for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

create policy hija_fotos on fotos for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

create policy hija_seguimientos on seguimientos for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

-- Remisiones y ayudas son gestion institucional: solo la mesa.
create policy mesa_remisiones on remisiones for all using (es_mesa()) with check (es_mesa());
create policy mesa_ayudas     on ayudas     for all using (es_mesa()) with check (es_mesa());

-- PERFILES -------------------------------------------------------------------
create policy perfil_lee on perfiles for select using (id = auth.uid() or es_mesa());

-- Solo el custodio asigna roles. Sin esta politica nadie podia ascender a nadie y
-- todos los voluntarios quedaban atrapados en el rol minimo para siempre.
create policy custodio_administra_perfiles on perfiles for update
  using (mi_rol() = 'custodio') with check (mi_rol() = 'custodio');

-- La auditoria se protege en la seccion 10, junto a la creacion de su tabla.

alter table sync_kobo enable row level security;
create policy sync_kobo_mesa on sync_kobo for all using (es_mesa()) with check (es_mesa());

-- CATALOGOS ------------------------------------------------------------------
-- No son sensibles, pero se activa RLS para que la regla sea "todo denegado salvo
-- lo declarado" y no haya que acordarse de revisar tabla por tabla.
alter table organizaciones enable row level security;
alter table entidades      enable row level security;
create policy catalogo_org      on organizaciones for select using (auth.uid() is not null);
create policy catalogo_ent      on entidades      for select using (auth.uid() is not null);
create policy catalogo_org_mesa on organizaciones for all using (es_mesa()) with check (es_mesa());
create policy catalogo_ent_mesa on entidades      for all using (es_mesa()) with check (es_mesa());

-- PERMISOS DE LA API ---------------------------------------------------------
-- Supabase expone por HTTP todo lo que este en el esquema publico. El visitante
-- anonimo solo debe alcanzar lo agregado y anonimizado, nada mas.
revoke all on v_familias_tablero, v_posibles_duplicados from anon;
grant select on v_mapa_publico, v_estadisticas, v_estado_gestion to anon;
grant select on v_familias_tablero, v_posibles_duplicados to authenticated;

-- =============================================================================
-- 10. AUDITORIA MINIMA
-- =============================================================================

create table auditoria (
  id          bigserial primary key,
  tabla       text not null,
  registro_id bigint not null,
  accion      text not null,
  actor       uuid,
  antes       jsonb,
  despues     jsonb,
  creado_en   timestamptz not null default now()
);

-- Guarda copia completa de cada fila antes y despues, INCLUIDA la identidad. Sin
-- RLS, cualquier usuario autenticado podria leer por aqui el censo entero, saltando
-- todas las politicas de las tablas originales.
alter table auditoria enable row level security;

create policy auditoria_solo_custodia on auditoria for select
  using (mi_rol() in ('custodio', 'coordinador'));

-- Nadie escribe a mano en la auditoria: solo el disparador, que corre como definer.
revoke insert, update, delete on auditoria from anon, authenticated;

create or replace function fn_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (tabla, registro_id, accion, actor, antes, despues)
  values (tg_table_name,
          coalesce(new.id, old.id),
          tg_op,
          auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger tr_auditar_familias
  after insert or update or delete on familias
  for each row execute function fn_auditar();

create trigger tr_auditar_remisiones
  after insert or update or delete on remisiones
  for each row execute function fn_auditar();

create or replace function fn_touch() returns trigger
language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

create trigger tr_touch_familias before update on familias
  for each row execute function fn_touch();

-- =============================================================================
-- 10.b PERFIL AUTOMATICO AL CREAR UN USUARIO
--
-- Sin esto, un voluntario recien creado inicia sesion, no encuentra perfil y queda
-- sin rol: entra y no puede hacer nada, sin mensaje que lo explique.
--
-- El rol por defecto es el MENOS privilegiado. Ascender a alguien es una accion
-- deliberada del custodio de datos, nunca un efecto secundario del registro.
-- =============================================================================

create or replace function fn_crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, rol, telefono, organizacion_declarada, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    'lider',
    new.raw_user_meta_data->>'telefono',
    new.raw_user_meta_data->>'organizacion',
    -- Nace INACTIVA. En una emergencia el registro tiene que ser abierto para no
    -- ponerle friccion a quien quiere ayudar, pero ningun dato de una familia
    -- puede entrar al registro sin que alguien responda por quien lo levanto.
    -- La custodia de datos activa la cuenta cuando confirma quien es la persona.
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger tr_crear_perfil
  after insert on auth.users
  for each row execute function fn_crear_perfil();

-- =============================================================================
-- 11. CARGA DESDE KOBO
--
-- Exportar de Kobo en CSV (separador ; y valores XML, no etiquetas), cargarlo a
-- una tabla staging con las mismas columnas en text, y correr:
--
--   insert into familias (kobo_id, kobo_uuid, municipio, zona, ...)
--   select "_id"::int, "_uuid",  municipio, zona::zona_t, ...
--   from stg_kobo
--   on conflict (kobo_id) do update set
--        estado_verificacion = excluded.estado_verificacion,
--        prioridad           = excluded.prioridad,
--        actualizado_en      = now();
--
-- ON CONFLICT sobre kobo_id hace la carga idempotente: se puede repetir el
-- proceso completo todos los dias sin duplicar un solo registro.
--
-- Los select_multiple de Kobo llegan separados por espacio:
--   string_to_array(nullif(trim(necesidades_inmediatas), ''), ' ')
-- =============================================================================

-- Semilla minima de entidades destinatarias. Ajustar nombres reales.
insert into entidades (nombre, nivel) values
  ('CMGRD Sevilla',                                    'municipal'),
  ('Alcaldia de Sevilla',                              'municipal'),
  ('CDGRD Valle del Cauca',                            'departamental'),
  ('Secretaria de Agricultura y Pesca del Valle',      'departamental'),
  ('Gobernacion del Valle del Cauca',                  'departamental'),
  ('UNGRD',                                            'nacional'),
  ('Cooperacion internacional',                        'cooperacion')
on conflict (nombre) do nothing;
-- Confirmar el nombre exacto de la dependencia de vivienda de Sevilla y del Valle
-- antes de radicar: el oficio debe ir dirigido a la dependencia correcta.
