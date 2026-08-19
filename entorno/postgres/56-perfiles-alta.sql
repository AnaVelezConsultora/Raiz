-- =============================================================================
-- LA CADENA DE ALTAS, Y LA CEDULA
--
-- Corre DESPUES de schema.sql y ANTES de 60-grants.sql.
--
-- -----------------------------------------------------------------------------
-- POR QUE LA CEDULA
-- -----------------------------------------------------------------------------
--
-- Quien registra a una familia damnificada firma ese registro. Cuando una entidad
-- devuelva un caso preguntando quien lo levanto, la respuesta no puede ser un
-- correo electronico: tiene que ser una persona identificable. Por eso el alta
-- pide documento, nombres completos y telefono, y no solo un correo.
--
-- Es UNICA entre los perfiles activos: dos cuentas con la misma cedula son la
-- misma persona dos veces, y eso rompe cualquier reporte que cuente voluntarios.
--
-- -----------------------------------------------------------------------------
-- QUIEN PUEDE CREAR A QUIEN
-- -----------------------------------------------------------------------------
--
--   custodio     -> coordinador, validador, digitador, lider
--   coordinador  -> lider y digitador, que son los roles que registran
--   los demas    -> nadie
--
-- NADIE CREA CUSTODIOS. El primero lo siembra `entorno/aws/crear-custodio.sh`, y
-- que la cima de la cadena quede fuera del alcance de la aplicacion es
-- deliberado: el custodio responde por la proteccion de datos personales, y ese
-- nombramiento no puede ser el efecto secundario de un formulario.
--
-- La regla se comprueba en el codigo —para dar un mensaje decente— y aqui, que es
-- donde tiene que ser cierta aunque manana alguien escriba otra ruta.
-- =============================================================================

alter table perfiles
  add column if not exists documento text;

comment on column perfiles.documento is
  'Cedula de quien registra. Una entidad que devuelve un caso pregunta por una persona, no por un correo.';

-- Unico solo entre quienes tienen acceso: una cuenta retirada conserva su
-- documento en el historial y no debe estorbar si la persona vuelve a entrar.
create unique index if not exists idx_perfiles_documento
  on perfiles (documento) where documento is not null and activo;

-- -----------------------------------------------------------------------------
-- El perfil nace con lo que se declaro en el alta
-- -----------------------------------------------------------------------------
-- El ROL sigue naciendo en 'lider', el menos privilegiado, y no se toma de los
-- metadatos. Ascender es una accion aparte, explicita, que pasa por las politicas
-- de abajo: si el rol viniera en el alta, quien pudiera escribir en auth.users
-- podria fabricarse un coordinador sin que ninguna politica lo mirara.
create or replace function fn_crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, rol, telefono, documento, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    'lider',
    new.raw_user_meta_data->>'telefono',
    new.raw_user_meta_data->>'documento',
    true
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- El coordinador administra a quien registra, y a nadie mas
-- -----------------------------------------------------------------------------
-- `using` acota QUE FILAS puede tocar y `with check` EN QUE ESTADO puede dejarlas.
-- Hacen falta las dos, y la primera es la que impide lo grave: sin ella un
-- coordinador podria degradar al custodio a lider, que es tomarse el sistema.
--
-- Con las dos, un coordinador solo alcanza filas que YA son de registro y solo
-- puede dejarlas como roles de registro. No puede ascender a nadie por encima de
-- si mismo ni tocar a la mesa.
drop policy if exists coordinador_administra_registro on perfiles;
create policy coordinador_administra_registro on perfiles for update
  using (mi_rol() = 'coordinador' and rol in ('lider', 'digitador'))
  with check (mi_rol() = 'coordinador' and rol in ('lider', 'digitador'));
