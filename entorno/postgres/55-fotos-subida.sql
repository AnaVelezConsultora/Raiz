-- =============================================================================
-- LA SUBIDA DE FOTOGRAFIAS POR BLOQUES, EN LA BASE
--
-- Corre DESPUES de schema.sql y ANTES de 60-grants.sql. No crea tablas: extiende
-- `fotos`, que schema.sql definio para otra cosa.
--
-- -----------------------------------------------------------------------------
-- DE QUE ERA ESTA TABLA, Y EN QUE SE CONVIRTIO
-- -----------------------------------------------------------------------------
--
-- schema.sql la escribio cuando la captura iba por KoboToolbox: «el binario se
-- queda en Kobo, aqui va la referencia». Una fila era una URL de un adjunto que
-- ya existia. Nada podia estar a medias.
--
-- Con la PWA propia la fotografia la toma un celular en la vereda y sube despues,
-- por una conexion que se cae. La imagen viaja partida en bloques, y entre «el
-- voluntario apreto el boton» y «la imagen esta completa» hay minutos, varios
-- reintentos y a veces dias. En ese intervalo la fila tiene que existir —si no,
-- no hay a que reanudar— pero NO puede decir que la fotografia esta. De ahi
-- `estado`.
--
-- -----------------------------------------------------------------------------
-- QUE NO SE GUARDA AQUI, Y POR QUE
-- -----------------------------------------------------------------------------
--
-- Que bloques llegaron NO se registra en esta tabla. Quien lo sabe es el
-- almacenamiento, y preguntarselo cuesta una llamada; copiarlo aqui crearia una
-- segunda verdad que se desincroniza justo cuando importa —cuando la senal se
-- cayo a mitad— y entonces la aplicacion reenviaria bloques que ya estaban o
-- daria por subidos los que no.
--
-- Lo que si se guarda es donde estan los bloques y de que tamano son: sin eso no
-- hay como preguntar, y sin como preguntar el voluntario vuelve a gastar sus
-- datos desde cero.
-- =============================================================================

alter table fotos
  -- UUID que genera el dispositivo al tomar la foto. Es la clave de idempotencia:
  -- el mismo papel que `origen_id` en `familias`, y por la misma razon.
  add column if not exists origen_id      uuid,
  -- Lo que el dispositivo declaro que pesa. Cada bloque se firma con su tamano
  -- exacto, de modo que un permiso para 200 KB no sirva para subir otra cosa.
  add column if not exists bytes          integer,
  add column if not exists tipo_mime      text,
  -- SHA-256 de la imagen completa, en hexadecimal, tal como lo declaro el
  -- dispositivo. La API vuelve a calcularlo sobre lo que unio y compara: es la
  -- diferencia entre «pesa lo que debia» y «es la fotografia que se tomo».
  add column if not exists suma_sha256    text,
  add column if not exists estado         text,
  -- Prefijo bajo el cual viven los bloques mientras la imagen esta a medias. Se
  -- borra al unirlos; queda en nulo cuando ya no hay nada suelto.
  add column if not exists partes_prefijo text,
  add column if not exists tamano_bloque  integer,
  add column if not exists autorizada_en  timestamptz,
  add column if not exists confirmada_en  timestamptz;

-- Las filas que ya existan vienen de Kobo: su binario esta en Kobo desde antes,
-- asi que 'confirmada' es lo cierto para ellas. Se hace antes del NOT NULL.
update fotos set estado = 'confirmada' where estado is null;
update fotos set confirmada_en = creado_en where estado = 'confirmada' and confirmada_en is null;

alter table fotos alter column estado set not null;

-- A proposito SIN valor por defecto. Con `default 'confirmada'` una ruta nueva que
-- olvide fijarlo declararia presente una fotografia que nadie subio, y el
-- dispositivo la borraria de su memoria. Que falle el insert es lo correcto.
alter table fotos alter column estado drop default;

-- Idempotencia. El reintento tras un corte cae sobre la misma fila en vez de
-- crear una segunda fotografia identica colgando del mismo hogar.
create unique index if not exists idx_fotos_origen on fotos (origen_id);

alter table fotos drop constraint if exists foto_estado_valido;
alter table fotos add constraint foto_estado_valido
  check (estado in ('autorizada', 'confirmada'));

-- Una fotografia confirmada sin fecha de confirmacion es una fila que afirma algo
-- que nadie verifico. La restriccion existe para que esa contradiccion no se pueda
-- escribir, ni siquiera desde psql.
alter table fotos drop constraint if exists foto_confirmada_tiene_fecha;
alter table fotos add constraint foto_confirmada_tiene_fecha
  check (estado <> 'confirmada' or confirmada_en is not null);

comment on column fotos.url is
  'Ruta del objeto ya completo. En las filas de Kobo, la URL del adjunto.';
comment on column fotos.estado is
  'autorizada = se emitio permiso de subida; confirmada = la API verifico el objeto.';
comment on column fotos.partes_prefijo is
  'Donde viven los bloques mientras la imagen esta a medias. Nulo cuando ya se unieron.';
comment on column fotos.tamano_bloque is
  'Tamano de cada bloque. Con bytes, dice cuantos son y cuales faltan.';
comment on column fotos.suma_sha256 is
  'SHA-256 de la imagen completa. Se compara con lo que la API calcula al unir los bloques.';
