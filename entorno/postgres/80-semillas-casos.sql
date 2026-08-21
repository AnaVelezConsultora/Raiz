-- =============================================================================
-- SEMILLAS: PERFILES Y CASOS DE PRUEBA
--
-- NO corre en la inicializacion de PostgreSQL. Lo ejecuta el servicio
-- `siembra` DESPUES de que Cognito haya creado los usuarios, porque el `sub`
-- lo genera Cognito y no nosotros.
--
-- Ese orden no es capricho del entorno local: es exactamente el flujo de
-- produccion. Cognito crea el usuario -> el Lambda de Post-Confirmation inserta
-- en auth.users -> el disparador tr_crear_perfil crea el perfil con rol 'lider'.
-- Aqui pasa lo mismo, con el bootstrap haciendo de Lambda.
--
-- Por eso nada de esto referencia UUID escritos a mano: se resuelve por correo.
--
-- Datos INVENTADOS. Nunca datos reales.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Roles.
--
-- El rol vive en `perfiles.rol`, NO en el token ni en grupos de Cognito. Es
-- deliberado: `mi_rol()` lo lee de la base, asi que el custodio puede ascender o
-- degradar a alguien y surte efecto en la siguiente consulta, sin tocar el
-- proveedor de identidad y sin esperar a que caduque un token.
--
-- Todos entraron como 'lider' por el disparador. Aqui se ajustan los de prueba.
-- ---------------------------------------------------------------------------
update perfiles p set rol = 'coordinador'
  from auth.users u where u.id = p.id and u.email = 'coordinadora@ejemplo.test';

update perfiles p set rol = 'custodio'
  from auth.users u where u.id = p.id and u.email = 'custodia@ejemplo.test';

update perfiles p set rol = 'digitador'
  from auth.users u where u.id = p.id and u.email = 'digitador@ejemplo.test';

-- ana@ y beto@ se quedan como 'lider': son los dos sujetos de la prueba de
-- aislamiento, la que verifica que ninguno vea los casos del otro.

update perfiles p set nombre = 'Ana Lider (prueba)'
  from auth.users u where u.id = p.id and u.email = 'ana@ejemplo.test';
update perfiles p set nombre = 'Beto Lider (prueba)'
  from auth.users u where u.id = p.id and u.email = 'beto@ejemplo.test';

-- ---------------------------------------------------------------------------
-- Un caso por cada lider.
--
-- Coordenadas dentro del municipio pero desplazadas: no corresponden a ninguna
-- vivienda. Los nombres son inventados y estan marcados como tales.
-- ---------------------------------------------------------------------------
insert into familias (
  origen_id, fecha_registro, registrador_nombre, registrador_perfil_id,
  fuente_dato, consentimiento,
  departamento, municipio, zona, vereda,
  lat, lon, gps_fuente,
  jefe_nombres, jefe_apellidos, tipo_doc, num_doc,
  tel_1, personas_total,
  h_0_5, m_0_5, h_18_59, m_18_59, h_60, m_60,
  prioridad, necesidades_inmediatas, estado_verificacion
)
select
  '00000000-0000-4000-8000-000000000001', current_date,
  'Ana Lider (prueba)', u.id,
  'presencial', true,
  'Valle del Cauca', 'Sevilla', 'rural', 'Vereda Ficticia Uno',
  4.3210, -75.9010, 'sitio',
  'Familia', 'Inventada Uno', 'CC', '10000001',
  '3000000101', 4,
  1, 0, 1, 1, 0, 1,
  'p1', array['agua_potable', 'carpa']::necesidad_t[], 'reportado'
from auth.users u where u.email = 'ana@ejemplo.test'
on conflict (origen_id) do nothing;

insert into familias (
  origen_id, fecha_registro, registrador_nombre, registrador_perfil_id,
  fuente_dato, consentimiento,
  departamento, municipio, zona, barrio,
  lat, lon, gps_fuente,
  jefe_nombres, jefe_apellidos, tipo_doc, num_doc,
  tel_1, personas_total,
  h_6_11, m_6_11, h_18_59, m_18_59,
  prioridad, necesidades_inmediatas, estado_verificacion
)
select
  '00000000-0000-4000-8000-000000000002', current_date,
  'Beto Lider (prueba)', u.id,
  'presencial', true,
  'Valle del Cauca', 'Sevilla', 'urbana', 'Barrio Ficticio Dos',
  4.2680, -75.9350, 'sitio',
  'Familia', 'Inventada Dos', 'CC', '10000002',
  '3000000102', 3,
  1, 0, 1, 1,
  'p0', array['alimentos']::necesidad_t[], 'reportado'
from auth.users u where u.email = 'beto@ejemplo.test'
on conflict (origen_id) do nothing;

-- Vivienda principal de cada caso, para que v_familias_tablero y v_mapa_publico
-- devuelvan las columnas del join en lugar de nulos.
insert into viviendas (familia_id, es_principal, tenencia, afectacion, habitabilidad, riesgo_visible)
select f.id, true, 'arrendatario'::tenencia_t, 'severo'::afectacion_t,
       'no_habitable'::habitabilidad_t, 'peligro_evidente'::riesgo_visible_t
from familias f where f.origen_id = '00000000-0000-4000-8000-000000000001'
on conflict do nothing;

insert into viviendas (familia_id, es_principal, tenencia, afectacion, habitabilidad, riesgo_visible)
select f.id, true, 'propietario'::tenencia_t, 'moderado'::afectacion_t,
       'habitable'::habitabilidad_t, 'no_observado'::riesgo_visible_t
from familias f where f.origen_id = '00000000-0000-4000-8000-000000000002'
on conflict do nothing;
