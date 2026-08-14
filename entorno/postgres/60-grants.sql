-- =============================================================================
-- PERMISOS DE TABLA
--
-- Corre DESPUES de schema.sql, porque las tablas tienen que existir.
--
-- Distincion que conviene tener clara al leer las politicas:
--
--   GRANT decide si el rol puede TOCAR la tabla.
--   RLS   decide QUE FILAS ve o escribe una vez que puede tocarla.
--
-- Aqui se abre la puerta a `authenticated` sobre todas las tablas y se deja que
-- las politicas de schema.sql hagan el trabajo fino. `anon` no recibe nada:
-- alcanza unicamente las tres vistas agregadas que schema.sql le concede
-- explicitamente.
-- =============================================================================

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Reposicion del hallazgo H2 de SEGURIDAD.md
--
-- schema.sql revoca la escritura sobre `auditoria` para que solo el disparador
-- (que corre como definer) pueda escribirla. El GRANT masivo de arriba se la
-- devuelve sin querer. Se vuelve a revocar.
--
-- Es exactamente el tipo de regresion contra la que advierte SEGURIDAD.md:
-- "el proximo cambio al esquema puede reintroducirlos". La prueba 6 de
-- pruebas/seguridad.sql verifica que esta linea siga surtiendo efecto.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on auditoria from anon, authenticated;

-- ---------------------------------------------------------------------------
-- A proposito NO se usa ALTER DEFAULT PRIVILEGES.
--
-- Seria comodo: cada tabla nueva heredaria los permisos sola. Pero el principio
-- declarado del proyecto es "todo denegado salvo lo declarado", y con privilegios
-- por defecto la proxima tabla con datos personales queda accesible por olvido,
-- no por decision. Cada tabla nueva agrega su linea aqui, conscientemente.
-- ---------------------------------------------------------------------------
