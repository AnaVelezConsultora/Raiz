-- =============================================================================
-- LO QUE SE DANO NO ES SOLO LA CASA — 19 de agosto de 2026
--
-- Hasta hoy Raiz sabe decir «la casa de esta familia esta danada». Eso es un censo.
-- Lo que una entidad necesita para mover un presupuesto es otra frase: «este
-- acueducto esta fuera de servicio y de el dependen 180 hogares».
--
-- La diferencia no es de redaccion. Un censo de viviendas ordena por familia y cada
-- familia compite con las demas por la misma ayuda. Un registro de puntos de servicio
-- ordena por INFRAESTRUCTURA, y ahi una sola reparacion resuelve doscientos casos a la
-- vez. Es la unidad en la que piensan el CMGRD, la UNGRD y el operador que gira el
-- dinero, y es la unica en la que una obra se prioriza.
--
-- POR QUE ES UNA TABLA APARTE Y NO UNA PREGUNTA MAS DEL FORMULARIO
--
-- Un acueducto no le pertenece a una familia: le sirve a muchas. Colgarlo del registro
-- del hogar obligaria a preguntarle a las ciento ochenta familias por el mismo tubo
-- roto, y produciria ciento ochenta versiones de un solo hecho. Ademas, el formulario
-- ya esta al limite de lo que una persona responde de pie —esa fue la advertencia de
-- terreno— y no se le agrega ni un campo mas.
--
-- Quien registra un punto es un lider o alguien de la mesa, una sola vez, desde una
-- pantalla propia. No es trabajo de la visita casa a casa.
--
-- CUANTOS HOGARES DEPENDEN: DOS CIFRAS, Y NUNCA UNA SOLA
--
-- Esta es la decision que hace que el registro sirva o no sirva.
--
--   hogares_estimados    lo que dice el lider. Se consigue hoy, en un minuto, por
--                        telefono. Es autodeclarado y puede estar inflado o corto.
--
--   hogares_registrados  cuantas familias YA REGISTRADAS en Raiz estan en las veredas
--                        que ese punto sirve. Se calcula, no se declara. Es baja al
--                        principio y crece con el censo.
--
-- La tentacion es promediarlas, o quedarse con la mas alta. Las dos cosas destruyen el
-- dato. Se muestran SEPARADAS, siempre, porque dicen cosas distintas: la primera es la
-- magnitud del problema, la segunda es cuanto de esa magnitud Raiz puede sostener con
-- registros. Una entidad que ve las dos entiende de inmediato que le estan mostrando, y
-- esa transparencia es justamente lo que hace creible la cifra grande.
--
-- Es la misma logica de la franja del tablero: lo reportado y lo comprobado se
-- presentan juntos y distinguidos, nunca fundidos.
--
-- LOS DOS EJES SE HEREDAN
--
-- Un punto de servicio tiene origen y nivel de verificacion igual que una familia, y
-- por las mismas razones. «El acueducto esta roto» dicho por un vecino y dicho por el
-- ingeniero del municipio son el mismo texto y no son el mismo dato.
--
-- ESTO NO ES DATO PERSONAL
--
-- Y por eso las politicas de acceso son distintas y mas abiertas: cualquier persona
-- autenticada ve todos los puntos, incluidos los lideres, que de las familias solo ven
-- las suyas. Un tubo roto no es de nadie. Ademas hace falta: si el lider no ve que el
-- acueducto de su vereda ya esta registrado, lo registra otra vez.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_punto_t') then
    create type tipo_punto_t as enum (
      'acueducto',           -- el que mas hogares tumba de un solo golpe
      'alcantarillado',
      'energia',
      'via',                 -- una via cerrada aisla veredas enteras
      'puente',
      'escuela',
      'puesto_salud',
      'centro_comunitario',  -- caseta, salon comunal: suele ser el albergue
      'telecomunicaciones',
      'otro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_servicio_t') then
    create type estado_servicio_t as enum (
      'operativo',       -- se dano algo pero sigue prestando servicio
      'intermitente',    -- funciona a ratos, o a media capacidad
      'fuera_servicio',  -- no presta servicio, se puede reparar
      'destruido'        -- hay que volverlo a construir
    );
  end if;
end $$;

create sequence if not exists seq_punto;

create table if not exists puntos_servicio (
  id                bigserial primary key,
  codigo            text not null unique
                      default ('PS-' || to_char(now(), 'YYYY') || '-' ||
                               lpad(nextval('seq_punto')::text, 4, '0')),

  -- Misma clave de idempotencia que las familias, por la misma razon: el registro se
  -- levanta sin senal y el reintento no puede crear un segundo tubo roto.
  origen_id         uuid unique,

  evento_id         bigint references eventos(id),

  tipo              tipo_punto_t not null,
  nombre            text not null,          -- «Acueducto La Cumbre», como lo llama la gente

  departamento      text not null,
  municipio         text not null,
  zona              zona_t not null,
  vereda            text,                   -- donde ESTA el punto
  direccion_ref     text,
  lat               double precision,
  lon               double precision,

  estado_servicio   estado_servicio_t not null,
  descripcion_afectacion text,
  -- Que hace falta para que vuelva a funcionar. Texto libre a proposito: es lo que la
  -- entidad lee para dimensionar, y encasillarlo en una lista lo empobrece.
  requiere          text,

  -- Las dos cifras. Ver el encabezado: se muestran separadas o no se muestran.
  hogares_estimados integer check (hogares_estimados is null or hogares_estimados >= 0),
  -- A quienes les sirve. Un acueducto suele cruzar varias veredas.
  veredas_servidas  text[] not null default '{}',

  origen_dato        origen_dato_t,
  nivel_verificacion nivel_verificacion_t not null default 'r0_autodeclarado',
  nivel_verificado_por uuid references perfiles(id),
  nivel_verificado_en  timestamptz,

  registrador_perfil_id uuid references perfiles(id) default auth.uid(),
  registrador_nombre    text not null,
  fecha_registro        date not null default current_date,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table puntos_servicio is
  'Infraestructura afectada. La unidad en la que una entidad prioriza una obra.';
comment on column puntos_servicio.hogares_estimados is
  'Lo que declara el lider. Autodeclarado. Nunca se fusiona con hogares_registrados.';
comment on column puntos_servicio.veredas_servidas is
  'Veredas a las que sirve. De aqui se calcula hogares_registrados contra el censo.';

create index if not exists idx_puntos_tipo    on puntos_servicio (tipo, estado_servicio);
create index if not exists idx_puntos_lugar   on puntos_servicio (municipio, vereda);
create index if not exists idx_puntos_evento  on puntos_servicio (evento_id);
create index if not exists idx_puntos_veredas on puntos_servicio using gin (veredas_servidas);

-- -----------------------------------------------------------------------------
-- Cruzar el punto con el censo
-- -----------------------------------------------------------------------------
-- «La Cumbre», «la cumbre» y «Vda. La Cumbre» son la misma vereda escrita por tres
-- personas distintas, y sin normalizar serian tres. Se comparan sin mayusculas, sin
-- tildes, sin el prefijo «vereda» y sin puntuacion.
--
-- Esto NO resuelve los errores de ortografia ni los nombres alternos de una misma
-- vereda, y conviene no pretender que si: el dia que exista el listado veredal oficial
-- del municipio, esta funcion se reemplaza por una llave contra ese listado. Mientras
-- tanto acerca lo suficiente para que la cifra sirva, y por eso se presenta como
-- «registradas en Raiz» y no como una verdad del territorio.
create or replace function normalizar_lugar(t text) returns text
language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(coalesce(t, ''), 'áéíóúüàèìòùÁÉÍÓÚÜÀÈÌÒÙñÑ', 'aeiouuaeiouAEIOUUAEIOUnN')),
        '^\s*(vda|vereda|corregimiento|cgto)\.?\s+', ''
      ),
      '[^a-z0-9 ]', '', 'g'
    ),
  '');
$$;

create index if not exists idx_familias_vereda_norm
  on familias (normalizar_lugar(vereda));

-- -----------------------------------------------------------------------------
-- La vista que lee el tablero
-- -----------------------------------------------------------------------------
-- `security_invoker`: la vista no es una puerta trasera. Cada quien ve por ella lo
-- mismo que veria por la tabla, con sus propias politicas aplicadas.
create or replace view v_puntos_tablero with (security_invoker = true) as
select
  p.id, p.codigo, p.tipo, p.nombre,
  p.municipio, p.zona, p.vereda,
  p.direccion_ref, p.lat, p.lon,
  p.estado_servicio, p.descripcion_afectacion, p.requiere,
  p.hogares_estimados,
  p.veredas_servidas,
  (select count(*)
     from familias f
    where f.estado_verificacion <> 'duplicado'
      and normalizar_lugar(coalesce(f.vereda, f.barrio)) = any (
            select normalizar_lugar(v) from unnest(p.veredas_servidas) as v
          )
  ) as hogares_registrados,
  p.origen_dato, p.nivel_verificacion,
  p.registrador_nombre, p.fecha_registro
from puntos_servicio p;

-- -----------------------------------------------------------------------------
-- Acceso
-- -----------------------------------------------------------------------------
-- La prueba P0 exige RLS en toda tabla del esquema publico. Va aqui y no despues,
-- para que la proxima tabla que alguien agregue falle en la prueba y no en produccion.
alter table puntos_servicio enable row level security;

drop policy if exists punto_lee_autenticado on puntos_servicio;
-- Todos los autenticados leen todos los puntos, incluido el lider. Es la diferencia
-- deliberada con familias: esto no es dato personal y ocultarlo solo produce duplicados.
create policy punto_lee_autenticado on puntos_servicio
  for select to authenticated using (true);

drop policy if exists punto_crea_autenticado on puntos_servicio;
create policy punto_crea_autenticado on puntos_servicio
  for insert to authenticated with check (true);

drop policy if exists punto_edita_propio on puntos_servicio;
create policy punto_edita_propio on puntos_servicio
  for update to authenticated
  using (registrador_perfil_id = auth.uid())
  with check (registrador_perfil_id = auth.uid());

drop policy if exists punto_admin_mesa on puntos_servicio;
create policy punto_admin_mesa on puntos_servicio
  for all to authenticated using (es_mesa()) with check (es_mesa());

grant select, insert, update on puntos_servicio to authenticated;
grant usage, select on sequence puntos_servicio_id_seq to authenticated;
grant usage, select on sequence seq_punto to authenticated;
grant select on v_puntos_tablero to authenticated;

-- Un punto de servicio cambia de estado —se repara, empeora, lo verifica un
-- ingeniero— y ese historico es lo que despues sostiene un informe.
drop trigger if exists tr_auditar_puntos on puntos_servicio;
create trigger tr_auditar_puntos
  after insert or update or delete on puntos_servicio
  for each row execute function fn_auditar();

drop trigger if exists tr_touch_puntos on puntos_servicio;
create trigger tr_touch_puntos before update on puntos_servicio
  for each row execute function fn_touch();
