-- =============================================================================
-- USUARIOS PARA INTEGRACION CONTINUA
--
-- Equivale a /generado/usuarios.sql, que en el entorno local produce el
-- bootstrap leyendo los `sub` que asigno Cognito.
--
-- En integracion continua no hay Cognito, y no hace falta: lo que el sistema
-- necesita es que exista una fila en auth.users con un identificador estable.
-- De donde salga ese identificador es asunto del proveedor, y por eso el shim
-- existe. Aqui se usan UUID fijos para que las pruebas sean reproducibles.
--
-- Al insertar aqui se dispara tr_crear_perfil, igual que en produccion lo
-- disparara el Lambda de Post-Confirmation. Es el MISMO camino, con otro
-- origen.
--
-- Datos INVENTADOS. Nunca datos reales.
-- =============================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'coordinadora@ejemplo.test',
   '{"nombre": "Coordinadora (prueba)"}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'custodia@ejemplo.test',
   '{"nombre": "Custodia de datos (prueba)"}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'digitador@ejemplo.test',
   '{"nombre": "Digitador (prueba)"}'::jsonb),
  ('44444444-4444-4444-8444-444444444444', 'ana@ejemplo.test',
   '{"nombre": "Ana Lider (prueba)"}'::jsonb),
  ('55555555-5555-4555-8555-555555555555', 'beto@ejemplo.test',
   '{"nombre": "Beto Lider (prueba)"}'::jsonb)
on conflict (id) do nothing;
