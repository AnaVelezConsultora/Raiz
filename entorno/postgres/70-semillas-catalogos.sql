-- =============================================================================
-- SEMILLAS: CATALOGOS
--
-- Datos INVENTADOS. Regla del proyecto (ESTADO.md, seccion 6):
-- "Para desarrollar y probar se usan datos inventados. Nunca datos reales."
--
-- Las entidades destinatarias reales ya vienen sembradas por schema.sql.
-- Aqui solo van las organizaciones de recoleccion, que son ficticias.
-- =============================================================================

insert into organizaciones (nombre, tipo, contacto, telefono) values
  ('Junta de Accion Comunal Ficticia Uno', 'junta',      'Contacto de prueba', '3000000001'),
  ('Asociacion Campesina El Ejemplo (ficticia)',     'asociacion', 'Contacto de prueba', '3000000002'),
  ('Comite de Prueba Casco Urbano (ficticio)',       'comite',     'Contacto de prueba', '3000000003')
on conflict (nombre) do nothing;
