-- =============================================================================
-- PRUEBAS DE CONTROL DE ACCESO
--
-- SEGURIDAD.md deja seis verificaciones para "quien tome F3", con esta
-- advertencia: "Este documento describe lo que dice el archivo. Lo que importa
-- es lo que quede en el servidor."
--
-- Este archivo convierte esa lista de chequeo manual en una suite ejecutable que
-- corre contra el mismo esquema que va a RDS. Deja de depender de que alguien se
-- acuerde de revisarla.
--
-- Correr:  docker compose exec -T db psql -U postgres -d raiz -f /pruebas/seguridad.sql
--     o:   make pruebas
--
-- Falla al primer error y devuelve codigo de salida distinto de cero, para que la
-- pipeline la use como compuerta de merge.
--
-- Lo que NO cubre: el punto 6 de SEGURIDAD.md, las politicas del bucket de fotos.
-- Eso es un sistema aparte y solo se verifica contra AWS real. Sigue siendo, en
-- palabras del propio documento, "el que mas se olvida".
-- =============================================================================

\set ON_ERROR_STOP on
\timing off
\set QUIET on

\echo ''
\echo '=============================================='
\echo ' Raiz - pruebas de control de acceso'
\echo '=============================================='

-- =============================================================================
-- P0 - Todo denegado salvo lo declarado  (hallazgo H6)
--
-- No basta con que las tablas de hoy tengan RLS: la regla es que NINGUNA tabla
-- del esquema publico quede sin activarlo. Asi la proxima tabla que alguien
-- agregue falla aqui en vez de fallar en produccion.
-- =============================================================================
do $$
declare
  sin_rls text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into sin_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
    -- PostGIS instala spatial_ref_sys en el esquema publico. Es un catalogo de
    -- sistemas de coordenadas, no tiene datos nuestros y no le corresponde RLS.
    -- Se excluye todo lo que pertenezca a una extension, no solo esa tabla, para
    -- que instalar otra extension manana no rompa la prueba por una razon falsa.
    and c.oid not in (
      select d.objid from pg_depend d
      where d.deptype = 'e' and d.classid = 'pg_class'::regclass
    );

  if sin_rls is not null then
    raise exception 'FALLO P0: tablas sin RLS -> %', sin_rls;
  end if;
  raise notice 'OK  P0   todas las tablas del esquema publico tienen RLS activo';
end $$;

-- =============================================================================
-- P1 - Las vistas con identidad respetan las politicas  (hallazgo H1)
--
-- En PostgreSQL una vista corre con los permisos de SU DUENO salvo que lleve
-- security_invoker. Sin ese atributo, v_familias_tablero le entrega el censo
-- completo con nombre y telefono a cualquier usuario autenticado, saltandose el
-- RLS de la tabla de origen.
--
-- Se verifica el atributo directamente para que la regresion se detecte aunque
-- no haya datos que la revelen.
-- =============================================================================
do $$
declare
  desprotegidas text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into desprotegidas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('v_familias_tablero', 'v_posibles_duplicados')
    and (c.reloptions is null or not ('security_invoker=true' = any(c.reloptions)));

  if desprotegidas is not null then
    raise exception 'FALLO P1: vistas con identidad sin security_invoker -> %', desprotegidas;
  end if;
  raise notice 'OK  P1   las vistas con identidad llevan security_invoker';
end $$;

-- =============================================================================
-- P2 - Prueba de lider: ninguno ve lo del otro
--
-- Es la prueba que mas importa en campo. Si falla al reves (el lider deja de ver
-- lo suyo) el voluntario lee "la aplicacion me borro el trabajo" y abandona la
-- herramienta. Ese fue el hallazgo H4.
-- =============================================================================
begin;
  do $$ begin perform set_config('app.user_id',
    (select id::text from auth.users where email = 'ana@ejemplo.test'), true); end $$;
  set local role authenticated;

  do $$
  declare
    propios int;
    ajenos  int;
    en_vista int;
  begin
    select count(*) into propios from familias where registrador_nombre like 'Ana%';
    select count(*) into ajenos  from familias where registrador_nombre like 'Beto%';
    select count(*) into en_vista from v_familias_tablero;

    if propios <> 1 then
      raise exception 'FALLO P2: Ana no ve su propio caso (vio %)', propios;
    end if;
    if ajenos <> 0 then
      raise exception 'FALLO P2: Ana ve % caso(s) de Beto en la tabla', ajenos;
    end if;
    if en_vista <> 1 then
      raise exception 'FALLO P2: v_familias_tablero le muestra a Ana % filas, esperado 1', en_vista;
    end if;
    raise notice 'OK  P2a  Ana ve su caso y solo el suyo, en tabla y en vista';
  end $$;
rollback;

begin;
  do $$ begin perform set_config('app.user_id',
    (select id::text from auth.users where email = 'beto@ejemplo.test'), true); end $$;
  set local role authenticated;

  do $$
  declare propios int; ajenos int;
  begin
    select count(*) into propios from familias where registrador_nombre like 'Beto%';
    select count(*) into ajenos  from familias where registrador_nombre like 'Ana%';

    if propios <> 1 then
      raise exception 'FALLO P2: Beto no ve su propio caso (vio %)', propios;
    end if;
    if ajenos <> 0 then
      raise exception 'FALLO P2: Beto ve % caso(s) de Ana', ajenos;
    end if;
    raise notice 'OK  P2b  Beto ve su caso y solo el suyo';
  end $$;
rollback;

-- =============================================================================
-- P3 - Prueba de anonimo
--
-- Con la clave publica y sin sesion: la vista agregada del mapa debe responder;
-- todo lo demas debe estar cerrado. Sirve tanto un resultado vacio como un error
-- de privilegios: lo inaceptable es que devuelva datos.
-- =============================================================================
begin;
  set local role anon;

  do $$
  declare
    n int;
    cerrado boolean;
  begin
    -- familias
    cerrado := false;
    begin
      select count(*) into n from familias;
      cerrado := (n = 0);
    exception when insufficient_privilege then cerrado := true;
    end;
    if not cerrado then raise exception 'FALLO P3: el anonimo lee familias'; end if;

    -- vista con identidad
    cerrado := false;
    begin
      select count(*) into n from v_familias_tablero;
      cerrado := (n = 0);
    exception when insufficient_privilege then cerrado := true;
    end;
    if not cerrado then raise exception 'FALLO P3: el anonimo lee v_familias_tablero'; end if;

    -- auditoria: la puerta trasera del hallazgo H2
    cerrado := false;
    begin
      select count(*) into n from auditoria;
      cerrado := (n = 0);
    exception when insufficient_privilege then cerrado := true;
    end;
    if not cerrado then raise exception 'FALLO P3: el anonimo lee auditoria'; end if;

    raise notice 'OK  P3a  el anonimo no alcanza familias, ni la vista con identidad, ni auditoria';

    -- y lo que SI debe funcionar
    select count(*) into n from v_mapa_publico;
    if n < 1 then
      raise exception 'FALLO P3: v_mapa_publico no responde al anonimo (% filas)', n;
    end if;
    raise notice 'OK  P3b  v_mapa_publico responde al anonimo (% filas)', n;
  end $$;
rollback;

-- =============================================================================
-- P3c - La vista publica no filtra identidad ni coordenada exacta
--
-- No estaba en la lista de SEGURIDAD.md. Se agrega porque es la unica superficie
-- que se expone sin sesion, y porque el redondeo a 3 decimales (~110 m) es lo que
-- separa "ubica la afectacion" de "senala la casa de una familia".
-- =============================================================================
begin;
  set local role anon;

  do $$
  declare
    columnas text;
    exactas  int;
  begin
    select string_agg(column_name, ', ' order by column_name) into columnas
    from information_schema.columns
    where table_name = 'v_mapa_publico'
      and column_name in ('jefe_nombres','jefe_apellidos','num_doc','tipo_doc',
                          'tel_1','tel_2','responsable','direccion_ref');
    if columnas is not null then
      raise exception 'FALLO P3c: v_mapa_publico expone identidad -> %', columnas;
    end if;

    select count(*) into exactas from v_mapa_publico
    where lat is not null and lat::numeric <> round(lat::numeric, 3);
    if exactas > 0 then
      raise exception 'FALLO P3c: % fila(s) con coordenada sin degradar', exactas;
    end if;

    raise notice 'OK  P3c  v_mapa_publico sin identidad y con coordenada degradada a ~110 m';
  end $$;
rollback;

-- =============================================================================
-- P4 - Prueba de suplantacion  (hallazgo H3)
--
-- Un lider no puede firmar un registro como si lo hubiera levantado otro.
-- =============================================================================
begin;
  do $$ begin perform set_config('app.user_id',
    (select id::text from auth.users where email = 'ana@ejemplo.test'), true); end $$;
  do $$ begin perform set_config('app.otro_id',
    (select id::text from auth.users where email = 'beto@ejemplo.test'), true); end $$;
  set local role authenticated;

  do $$
  declare rechazado boolean := false;
  begin
    begin
      insert into familias (
        origen_id, registrador_nombre, registrador_perfil_id, fuente_dato,
        departamento, municipio, zona, tel_1, personas_total, prioridad
      ) values (
        '00000000-0000-4000-8000-0000000000ff', 'Suplantacion',
        current_setting('app.otro_id')::uuid, 'presencial',
        'Valle del Cauca', 'Sevilla', 'rural', '3000000000', 1, 'p3'
      );
    exception when insufficient_privilege then rechazado := true;
    end;

    if not rechazado then
      raise exception 'FALLO P4: Ana inserto un caso a nombre de Beto';
    end if;
    raise notice 'OK  P4   no se puede firmar un registro a nombre de otro';
  end $$;
rollback;

-- =============================================================================
-- P5 - Prueba de escalada  (hallazgo H5)
--
-- Un lider no puede ascenderse. Ojo: aqui el rechazo NO llega como error. La
-- politica filtra las filas del UPDATE, asi que la sentencia "tiene exito"
-- afectando cero filas. Por eso se verifica el rol despues, no la excepcion.
-- Una prueba escrita al reves pasaria estando el sistema roto.
-- =============================================================================
begin;
  do $$ begin perform set_config('app.user_id',
    (select id::text from auth.users where email = 'ana@ejemplo.test'), true); end $$;
  set local role authenticated;

  do $$
  declare rol_final text;
  begin
    begin
      update perfiles set rol = 'coordinador' where id = auth.uid();
    exception when insufficient_privilege then null;
    end;

    select rol::text into rol_final from perfiles where id = auth.uid();
    if rol_final is distinct from 'lider' then
      raise exception 'FALLO P5: Ana escalo su rol a %', rol_final;
    end if;
    raise notice 'OK  P5   un lider no puede cambiarse el rol';
  end $$;
rollback;

-- =============================================================================
-- P6 - La auditoria no es una puerta trasera  (hallazgo H2)
--
-- `auditoria` guarda to_jsonb(old) y to_jsonb(new) de familias: nombre,
-- apellidos y documento. Si un lider pudiera leerla reconstruiria el censo
-- entero saltandose todas las politicas. Y nadie escribe a mano: solo el
-- disparador, que corre como definer.
-- =============================================================================
begin;
  do $$ begin perform set_config('app.user_id',
    (select id::text from auth.users where email = 'ana@ejemplo.test'), true); end $$;
  set local role authenticated;

  do $$
  declare n int; rechazado boolean := false;
  begin
    select count(*) into n from auditoria;
    if n <> 0 then
      raise exception 'FALLO P6: un lider lee % fila(s) de auditoria', n;
    end if;

    begin
      insert into auditoria (tabla, registro_id, accion) values ('familias', 1, 'FALSA');
    exception when insufficient_privilege then rechazado := true;
    end;
    if not rechazado then
      raise exception 'FALLO P6: se pudo escribir a mano en auditoria';
    end if;

    raise notice 'OK  P6a  un lider no lee ni escribe auditoria';
  end $$;
rollback;

begin;
  do $$ begin perform set_config('app.user_id',
    (select id::text from auth.users where email = 'custodia@ejemplo.test'), true); end $$;
  set local role authenticated;

  do $$
  declare n int;
  begin
    select count(*) into n from auditoria;
    if n < 1 then
      raise exception 'FALLO P6: la custodia no ve la auditoria (% filas)', n;
    end if;
    raise notice 'OK  P6b  la custodia si lee auditoria (% filas)', n;
  end $$;
rollback;

-- =============================================================================
-- P7 - Sin autorizacion de la familia, la identidad no entra  (HU 1.5.2)
--
-- La regla ya vive en el cliente y en la API, y las dos son codigo que se puede
-- rodear: una carga masiva, un importador de Kobo, una consulta a mano el dia de
-- la emergencia. Esta prueba verifica la unica capa que no depende de que quien
-- escriba se acuerde.
--
-- Se prueba tambien el camino positivo. Una restriccion que rechaza todo tambien
-- pasaria la mitad de esta prueba, y romperia la captura de las familias que si
-- autorizaron.
-- =============================================================================
begin;
  do $$
  declare rechazado boolean := false; id_ok bigint;
  begin
    -- Negativo: consentimiento en false y nombre puesto.
    begin
      insert into familias (
        origen_id, registrador_nombre, fuente_dato, consentimiento,
        departamento, municipio, zona, tel_1, personas_total, prioridad,
        jefe_nombres, jefe_apellidos
      ) values (
        '00000000-0000-4000-8000-00000000f001', 'Prueba 1.5.2', 'presencial', false,
        'Valle del Cauca', 'Sevilla', 'rural', '3000000000', 1, 'p3',
        'Nombre', 'Apellido'
      );
    exception when check_violation then rechazado := true;
    end;
    if not rechazado then
      raise exception 'FALLO P7: se guardo identidad sin autorizacion de la familia';
    end if;
    raise notice 'OK  P7a  la base rechaza identidad sin autorizacion';

    -- Negativo: la cadena vacia no puede usarse para cumplir la letra.
    rechazado := false;
    begin
      insert into familias (
        origen_id, registrador_nombre, fuente_dato, consentimiento,
        departamento, municipio, zona, tel_1, personas_total, prioridad,
        num_doc
      ) values (
        '00000000-0000-4000-8000-00000000f002', 'Prueba 1.5.2', 'presencial', false,
        'Valle del Cauca', 'Sevilla', 'rural', '3000000000', 1, 'p3',
        '1234567890'
      );
    exception when check_violation then rechazado := true;
    end;
    if not rechazado then
      raise exception 'FALLO P7: se guardo el documento sin autorizacion de la familia';
    end if;
    raise notice 'OK  P7b  el documento tampoco entra sin autorizacion';

    -- Positivo: sin identidad, el caso entra igual. El hogar queda contado.
    insert into familias (
      origen_id, registrador_nombre, fuente_dato, consentimiento,
      departamento, municipio, zona, tel_1, personas_total, prioridad
    ) values (
      '00000000-0000-4000-8000-00000000f003', 'Prueba 1.5.2', 'presencial', false,
      'Valle del Cauca', 'Sevilla', 'rural', '3000000000', 4, 'p1'
    ) returning id into id_ok;
    if id_ok is null then
      raise exception 'FALLO P7: un caso sin identidad y sin autorizacion no pudo entrar';
    end if;
    raise notice 'OK  P7c  el caso sin identidad se registra: la familia queda contada';

    -- Positivo: con autorizacion, la identidad si entra.
    insert into familias (
      origen_id, registrador_nombre, fuente_dato, consentimiento,
      departamento, municipio, zona, tel_1, personas_total, prioridad,
      jefe_nombres, jefe_apellidos, tipo_doc, num_doc
    ) values (
      '00000000-0000-4000-8000-00000000f004', 'Prueba 1.5.2', 'presencial', true,
      'Valle del Cauca', 'Sevilla', 'rural', '3000000000', 3, 'p2',
      'Nombre', 'Apellido', 'CC', '1234567890'
    );
    raise notice 'OK  P7d  con autorizacion la identidad si se guarda';
  end $$;
rollback;

\echo ''
\echo '=============================================='
\echo ' Todas las pruebas de acceso pasaron'
\echo '=============================================='
\echo ''
\echo ' Pendiente, y no se puede probar aqui:'
\echo ' politicas del bucket de fotos (SEGURIDAD.md, punto 6).'
\echo ' Es un sistema aparte y solo se verifica contra AWS real.'
\echo ''
