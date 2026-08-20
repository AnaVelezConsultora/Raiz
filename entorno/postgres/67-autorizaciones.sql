-- =============================================================================
-- LAS TRES AUTORIZACIONES, Y LA PRUEBA DE QUE SE PIDIERON — 19 de agosto de 2026
--
-- Hasta hoy el sistema guardaba una sola casilla, `consentimiento`, y esa casilla
-- protegia exactamente cuatro campos: nombres, apellidos, tipo y numero de
-- documento. Todo lo demas se guardaba siempre — gestantes, discapacidad,
-- enfermedad cronica, y desde el 16 de agosto fallecidos y heridos.
--
-- Eso son datos de salud. La Ley 1581 los trata como sensibles, exige autorizacion
-- explicita y establece que nadie esta obligado a darla. Una autorizacion en bloque,
-- donde la unica forma de quedar caracterizado es aceptar todo, es discutible por no
-- ser libre.
--
-- Aditiva y con `if not exists`, como todas: se aplica sobre la base que ya tiene
-- familias reales adentro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las dos autorizaciones que faltaban
-- -----------------------------------------------------------------------------
-- `consentimiento` se queda como esta y significa lo que siempre significo:
-- autorizacion para tratar los datos personales. Renombrarla habria roto el codigo
-- desplegado sin ganar nada.
--
-- Nacen NULAS y no en false, y la diferencia importa: null es «no se pregunto», que
-- es la verdad de los registros que ya existen. Ponerlas en false afirmaria que esas
-- familias dijeron que no, y eso seria escribir en su nombre.
alter table familias add column if not exists autoriza_datos_sensibles    boolean;
alter table familias add column if not exists autoriza_remision_entidades boolean;

comment on column familias.autoriza_datos_sensibles is
  'Ley 1581: salud, discapacidad, gestacion, etnia. Sin esto esos campos no se conservan.';
comment on column familias.autoriza_remision_entidades is
  'Sin esto la familia cuenta en el consolidado pero no sale nominalmente en un oficio.';

-- -----------------------------------------------------------------------------
-- 2. La prueba de que la autorizacion se pidio
-- -----------------------------------------------------------------------------
-- La ley exige poder consultar la autorizacion despues y conservar prueba de haber
-- informado. Guardar «autorizo: si» no alcanza: hay que poder decir QUE TEXTO EXACTO
-- se le leyo a esa familia ese dia.
--
-- El texto vive versionado en docs/cumplimiento/autorizacion.md. Aqui queda la
-- version que estaba vigente y el momento en que la familia respondio, que puede ser
-- otro dia distinto al de la captura.
alter table familias add column if not exists version_autorizacion text;
alter table familias add column if not exists autorizado_en        timestamptz;

comment on column familias.version_autorizacion is
  'Version del texto leido a la familia. Ver docs/cumplimiento/autorizacion.md.';

-- -----------------------------------------------------------------------------
-- 3. Segregar lo ya capturado
-- -----------------------------------------------------------------------------
-- Decision por defecto de sistemas mientras el frente juridico resuelve, tomada el
-- 19 de agosto y reversible a proposito.
--
-- Los datos sensibles de las familias registradas ANTES de que existiera la
-- autorizacion especifica no se borran y no se usan: quedan marcados. Purgar seria
-- destruir informacion que quiza la familia si habria autorizado; seguir usandolos
-- seria mantener la exposicion. Marcar permite las dos salidas.
--
-- La marca es la ausencia de respuesta —`autoriza_datos_sensibles is null`— y por eso
-- no hace falta otra columna. Lo que hace falta es que las vistas y las
-- exportaciones la respeten, y eso es codigo, no esquema.
alter table familias add column if not exists sensibles_segregados_en timestamptz;

update familias
   set sensibles_segregados_en = now()
 where sensibles_segregados_en is null
   and autoriza_datos_sensibles is null
   and (coalesce(gestantes, 0) > 0
     or coalesce(discapacidad_n, 0) > 0
     or coalesce(enf_cronica_n, 0) > 0
     or coalesce(fallecidos, 0) > 0
     or coalesce(heridos_leves, 0) > 0
     or coalesce(heridos_graves, 0) > 0
     or etnia is not null
     or victima_conflicto is not null);

comment on column familias.sensibles_segregados_en is
  'Capturados antes de que existiera la autorizacion especifica. No se usan hasta regularizar.';

-- -----------------------------------------------------------------------------
-- 4. La auditoria que faltaba
-- -----------------------------------------------------------------------------
-- El disparador cubria `familias` y `remisiones`. Los cambios en viviendas,
-- produccion y ayudas no quedaban registrados — y `ayudas` es justamente donde va a
-- quedar quien entrego que a quien.
--
-- El instrumento de articulacion que se le presenta a las entidades promete
-- «mantener trazabilidad de los registros». Esto es lo que hace que esa frase sea
-- cierta.
drop trigger if exists tr_auditar_viviendas on viviendas;
create trigger tr_auditar_viviendas
  after insert or update or delete on viviendas
  for each row execute function fn_auditar();

drop trigger if exists tr_auditar_produccion on produccion;
create trigger tr_auditar_produccion
  after insert or update or delete on produccion
  for each row execute function fn_auditar();

drop trigger if exists tr_auditar_ayudas on ayudas;
create trigger tr_auditar_ayudas
  after insert or update or delete on ayudas
  for each row execute function fn_auditar();
