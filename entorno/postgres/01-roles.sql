-- =============================================================================
-- ROLES DE BASE DE DATOS
--
-- `anon` y `authenticated` no son invento de Supabase: son roles corrientes de
-- PostgreSQL. schema.sql los usa en sus GRANT y REVOKE, asi que deben existir
-- antes de que corra.
--
-- Modelo de conexion, identico aqui y en RDS:
--
--   la API se conecta como  raiz_api  (rol con login, sin privilegios propios)
--   y por cada peticion hace  SET LOCAL ROLE authenticated  o  anon.
--
-- Por que no conectarse directamente como `authenticated`: el pool de conexiones
-- necesita un rol estable con login, y el cambio por transaccion es lo que
-- permite que la MISMA conexion sirva a un anonimo y luego a un coordinador sin
-- arrastrar privilegios.
--
-- Ninguno de estos roles es superusuario ni dueno de las tablas. Es la condicion
-- para que RLS se aplique: PostgreSQL omite las politicas para el dueno.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'raiz_api') then
    -- Contrasena solo para el entorno local. En AWS la credencial vive en
    -- Secrets Manager y la inyecta la plataforma: ningun dev la ve nunca.
    create role raiz_api login password 'raiz_local';
  end if;
end $$;

grant anon, authenticated to raiz_api;

grant usage on schema public to anon, authenticated;
