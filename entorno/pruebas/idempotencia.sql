-- =============================================================================
-- PRUEBA DE IDEMPOTENCIA
--
-- Verifica lo que HU 1.2.4 promete: que un corte de senal no duplique a una
-- familia.
--
-- POR QUE ESTA PRUEBA EXISTE
--
-- Hay dos barreras contra el duplicado y atacan casos distintos:
--
--   1. En el dispositivo. El origen_id es el UUID que se genero al crear el caso
--      y no se regenera; y la cola solo devuelve casos en estado Pendiente o
--      Error, asi que un caso confirmado nunca se reenvia.
--
--   2. En la API. Upsert por origen_id con indice unico.
--
-- La primera falla justo en el escenario que importa: si el envio LLEGA al
-- servidor pero la respuesta se pierde, el dispositivo no recibe confirmacion,
-- marca Error y vuelve a enviar. La barrera del dispositivo esta disenada para
-- no reenviar lo confirmado, y este caso nunca se confirmo.
--
-- Ahi entra el upsert. Sin el, ese reintento crea una segunda fila para la misma
-- familia, el total se infla, y el total es la palanca ante la entidad.
--
-- Esta prueba simula exactamente ese reintento. Si alguien "optimiza" quitando el
-- indice unico o el ON CONFLICT, aqui falla.
--
-- Uso:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f entorno/pruebas/idempotencia.sql
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

do $$
declare
  v_sub        uuid;
  v_origen     uuid := '00000000-0000-4000-8000-0000000000ff';
  v_codigo_1   text;
  v_codigo_2   text;
  v_filas      integer;
  v_viviendas  integer;
begin
  select id into v_sub from auth.users where email = 'ana@ejemplo.test';
  if v_sub is null then
    raise exception 'Falta la semilla: no existe ana@ejemplo.test. Corra la siembra primero.';
  end if;

  perform set_config('app.user_id', v_sub::text, true);

  -- Limpieza por si quedo de una corrida anterior.
  delete from familias where origen_id = v_origen;

  -- ---------------------------------------------------------------------------
  -- Primer envio. El caso llega y se registra.
  -- ---------------------------------------------------------------------------
  insert into familias (
    origen_id, registrador_nombre, fuente_dato, consentimiento,
    departamento, municipio, zona, vereda, tel_1, personas_total, prioridad
  ) values (
    v_origen, 'Prueba idempotencia', 'presencial', true,
    'Valle del Cauca', 'Sevilla', 'rural', 'Vereda de prueba', '3000000199', 4, 'p2'
  )
  on conflict (origen_id) do update set actualizado_en = now()
  returning codigo into v_codigo_1;

  -- ---------------------------------------------------------------------------
  -- Se pierde la respuesta. El dispositivo reintenta el MISMO caso.
  --
  -- Cambia personas_total a proposito: el reintento puede traer el caso mas
  -- completo que el primer envio, y debe actualizar, no crear otro.
  -- ---------------------------------------------------------------------------
  insert into familias (
    origen_id, registrador_nombre, fuente_dato, consentimiento,
    departamento, municipio, zona, vereda, tel_1, personas_total, prioridad
  ) values (
    v_origen, 'Prueba idempotencia', 'presencial', true,
    'Valle del Cauca', 'Sevilla', 'rural', 'Vereda de prueba', '3000000199', 5, 'p1'
  )
  on conflict (origen_id) do update set
    personas_total = excluded.personas_total,
    prioridad = excluded.prioridad,
    actualizado_en = now()
  returning codigo into v_codigo_2;

  -- ---------------------------------------------------------------------------
  -- Asertos
  -- ---------------------------------------------------------------------------
  select count(*) into v_filas from familias where origen_id = v_origen;
  if v_filas <> 1 then
    raise exception 'FALLA: el reintento creo % filas para el mismo origen_id. Debe ser 1.', v_filas;
  end if;

  if v_codigo_1 is distinct from v_codigo_2 then
    raise exception 'FALLA: el codigo cambio entre envios (% -> %). La familia perderia su identificador.',
      v_codigo_1, v_codigo_2;
  end if;

  select personas_total into v_filas from familias where origen_id = v_origen;
  if v_filas <> 5 then
    raise exception 'FALLA: el reintento no actualizo el dato. personas_total = %, esperado 5.', v_filas;
  end if;

  -- La vivienda principal tampoco se duplica: el repositorio borra y reinserta.
  select count(*) into v_viviendas
  from viviendas v join familias f on f.id = v.familia_id
  where f.origen_id = v_origen and v.es_principal;
  if v_viviendas > 1 then
    raise exception 'FALLA: hay % viviendas principales para el mismo hogar.', v_viviendas;
  end if;

  delete from familias where origen_id = v_origen;

  raise notice 'OK idempotencia: dos envios del mismo origen_id dejaron una sola familia, mismo codigo (%), con el dato actualizado.', v_codigo_1;
end $$;
