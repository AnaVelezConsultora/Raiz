-- =============================================================================
-- SHIM DE IDENTIDAD
--
-- Supabase provee el esquema `auth`. AWS no. Este archivo lo provee, de modo que
-- `supabase/schema.sql` corra SIN UN SOLO CAMBIO aqui, en preproduccion y en
-- produccion.
--
-- Si algun dia hay que tocar este archivo para un entorno en particular, algo se
-- rompio: la gracia es que el esquema que se prueba sea identico al que corre.
-- =============================================================================

create schema if not exists auth;

-- -----------------------------------------------------------------------------
-- auth.users
--
-- En Supabase la crea el servicio de autenticacion. Aqui es el espejo de Cognito:
-- una fila por usuario, con el `sub` del User Pool como id.
--
-- En AWS la escribe el Lambda de Post-Confirmation del User Pool. Esa insercion
-- dispara `tr_crear_perfil` (schema.sql, seccion 10.b), que crea el perfil con el
-- rol menos privilegiado. Ese disparador NO se modifica: sigue colgado de esta
-- tabla igual que colgaba de la de Supabase.
--
-- Las tres columnas son exactamente las que consume fn_crear_perfil(). Ni una mas.
-- -----------------------------------------------------------------------------
create table if not exists auth.users (
  id                  uuid primary key,
  email               text unique not null,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  creado_en           timestamptz not null default now()
);

comment on table auth.users is
  'Espejo de Cognito. La escribe el Lambda de Post-Confirmation, nunca la API.';

-- -----------------------------------------------------------------------------
-- auth.uid()
--
-- En Supabase lee el claim `sub` del JWT que PostgREST inyecta en la sesion.
-- Aqui lee `app.user_id`, que la API fija DENTRO de la transaccion:
--
--   BEGIN;
--     SELECT set_config('app.user_id', '<sub del JWT>', true);
--     SET LOCAL ROLE authenticated;
--     -- las politicas RLS de schema.sql corren sin enterarse del cambio
--   COMMIT;
--
-- El tercer parametro `true` de set_config lo hace local a la transaccion: una
-- conexion reutilizada del pool no arrastra la identidad del usuario anterior.
-- No es un detalle de estilo: es lo que impide que el voluntario A lea los casos
-- del voluntario B por reuso de conexion.
--
-- `stable` y no `volatile` para que el planificador la evalue una vez por
-- consulta y no una vez por fila.
-- -----------------------------------------------------------------------------
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

comment on function auth.uid() is
  'Identidad del solicitante. NULL sin sesion: las politicas la tratan como anonima.';

grant usage on schema auth to public;
