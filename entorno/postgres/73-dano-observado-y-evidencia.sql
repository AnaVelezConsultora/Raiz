-- =============================================================================
-- DOCUMENTAR NO ES DICTAMINAR — 20 de agosto de 2026
--
-- La tercera pantalla mezclaba tres cosas distintas en un solo campo, y la cuarta
-- reducia toda la evidencia a fotografias. Las dos cosas le quitan fuerza al registro
-- justo donde mas la necesita: delante de una entidad.
--
-- -----------------------------------------------------------------------------
-- TRES EJES, NO UNO
-- -----------------------------------------------------------------------------
--
--   DANO OBSERVABLE     que se ve. Del muro, no de la familia.
--   HABITABILIDAD       si se puede estar ahi. Depende del dano, pero no es el dano:
--                       una casa con dano moderado puede ser inhabitable por el
--                       terreno, y una severa puede estar apuntalada y habitable.
--   RIESGO VISIBLE      si entrar es peligroso HOY. Es una alerta, no un dictamen.
--
-- `afectacion_t` ya traia un valor 'riesgo' que era justamente la mezcla: describia el
-- riesgo dentro de la escala del dano. Se conserva por los registros que lo tienen y
-- deja de ofrecerse.
--
-- LA REGLA QUE PROTEGE AL PROYECTO: quien llena esta ficha es un lider comunal, no un
-- ingeniero. Puede afirmar «se observan grietas grandes y la familia no puede estar
-- ahi». No puede afirmar «la vivienda tiene dano estructural grado 3». Por eso el
-- nivel mas alto de riesgo no dice «hay riesgo inminente de colapso» sino «hay peligro
-- evidente, no ingresar»: describe lo que se ve y lo que hay que hacer, sin firmar un
-- diagnostico que despues no se puede sostener.
--
-- -----------------------------------------------------------------------------
-- QUE SE OBSERVA
-- -----------------------------------------------------------------------------
-- Una lista cerrada de danos visibles convierte una impresion en una descripcion que
-- se puede sumar por vereda y que un ingeniero puede leer antes de subir. Con texto
-- libre, grietas, rajaduras y fisuras son tres cosas distintas y el consolidado deja
-- de ser sumable justo cuando hace falta.
--
-- Y una descripcion breve al lado, porque la lista nunca alcanza.
--
-- -----------------------------------------------------------------------------
-- LA EVIDENCIA NO ES SOLO LA FOTOGRAFIA
-- -----------------------------------------------------------------------------
-- Cuando una alcaldia pregunte de donde salio un dato, la respuesta util no es «hay
-- una foto». Es «visita presencial, mas lo que reporto la familia, mas seis
-- fotografias». Registrar QUE CLASE de evidencia respalda el caso vale mas que la
-- evidencia sola, porque es lo que permite decir con que fuerza se sostiene.
--
-- -----------------------------------------------------------------------------
-- LA PRIORIDAD SE CALCULA, NO SE ELIGE
-- -----------------------------------------------------------------------------
-- Y de eso se guarda el POR QUE. Un caso que llega marcado P1 obliga a la entidad a
-- confiar en el criterio de quien lo marco; un caso que llega «P1 porque la vivienda
-- es inhabitable, la familia no tiene alojamiento seguro y hay una persona que
-- requiere medicacion permanente» se sostiene solo.
-- =============================================================================

-- Los valores nuevos de los tipos que ya existen.
alter type afectacion_t add value if not exists 'no_determinado';
alter type tenencia_t   add value if not exists 'no_informa';

alter type necesidad_t add value if not exists 'alojamiento_temporal';
alter type necesidad_t add value if not exists 'atencion_medica';
alter type necesidad_t add value if not exists 'apoyo_dependencia';
alter type necesidad_t add value if not exists 'alimentacion_especial';
-- Proteccion: personas solas, familias expuestas, riesgo de violencia. Se marca la
-- necesidad y NO se piden detalles: lo que sigue es una ruta especializada, no un
-- campo de texto en una ficha que llena un vecino.
alter type necesidad_t add value if not exists 'proteccion';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'habitabilidad_t') then
    create type habitabilidad_t as enum (
      'habitable',
      'habitable_con_restricciones',
      'no_habitable',
      'evacuada',
      'no_determinado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'riesgo_visible_t') then
    create type riesgo_visible_t as enum (
      'no_observado',
      'requiere_evaluacion',
      'peligro_evidente'
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- La vivienda
-- -----------------------------------------------------------------------------
alter table viviendas add column if not exists habitabilidad habitabilidad_t;
alter table viviendas add column if not exists riesgo_visible riesgo_visible_t;
alter table viviendas add column if not exists danos_visibles text[] not null default '{}';
alter table viviendas add column if not exists dano_descripcion text
  check (dano_descripcion is null or length(dano_descripcion) <= 500);
-- Que documento tiene la familia, NO el documento. Caracterizar sin pedir papeles: si
-- despues hay una ruta juridica, ahi se solicita lo que haga falta. Recoger escrituras
-- hoy seria acumular documentos sensibles que nadie necesita todavia.
alter table viviendas add column if not exists documentos_tenencia text[] not null default '{}';

comment on column viviendas.habitabilidad is
  'Si se puede estar ahi. Depende del dano pero NO es el dano.';
comment on column viviendas.riesgo_visible is
  'Alerta comunitaria, no dictamen. El nivel alto dice no ingresar, no colapso inminente.';
comment on column viviendas.danos_visibles is
  'Lista cerrada, para que el consolidado por vereda sea sumable.';

-- El booleano anterior queda, y se rellena el eje nuevo con lo que ya se sabia. Un
-- registro viejo con habitable=false no dice si la familia evacuo ni si hay
-- restricciones, asi que se traduce a lo minimo defendible y nada mas.
--
-- «A simple vista, esta casa amenaza con caerse» se traduce a PELIGRO EVIDENTE y no a
-- «requiere evaluacion». Ante la duda se sobreestima: equivocarse hacia arriba manda a
-- alguien a mirar de mas, y hacia abajo deja a una familia bajo algo que se puede caer.
-- Es la misma regla que usa el calculo de prioridad, escrita en los dos sitios porque
-- se aplica a cosas distintas —el pasado aqui, lo que llega alla— y tiene que coincidir.
update viviendas
   set habitabilidad = (case when habitable then 'habitable' else 'no_habitable' end)::habitabilidad_t
 where habitabilidad is null;

update viviendas
   set riesgo_visible = (case when riesgo_colapso then 'peligro_evidente' else 'no_observado' end)::riesgo_visible_t
 where riesgo_visible is null;

create index if not exists idx_viviendas_habitabilidad on viviendas (habitabilidad);
create index if not exists idx_viviendas_riesgo on viviendas (riesgo_visible)
  where riesgo_visible = 'peligro_evidente';

-- -----------------------------------------------------------------------------
-- El caso
-- -----------------------------------------------------------------------------
alter table familias add column if not exists tipos_evidencia text[] not null default '{}';
alter table familias add column if not exists prioridad_motivos text[] not null default '{}';
-- Si la calculo el sistema o la puso una persona. La excepcion manual existe para la
-- emergencia que no cabe en ninguna regla, y conviene poder distinguirlas despues.
alter table familias add column if not exists prioridad_calculada boolean not null default false;

-- Ruta de apoyo, en lugar del convenio con una organizacion concreta.
--
-- La pertenencia a organizaciones sociales es dato sensible, y «el caso se postula al
-- convenio» promete algo que depende de un tercero. Se cambia por lo unico que Raiz
-- puede ofrecer con verdad: preguntar si la familia QUIERE ser orientada, y dejar
-- constancia del estado de esa remision.
alter table familias add column if not exists desea_ruta_apoyo boolean;
alter table familias add column if not exists ruta_apoyo_organizacion text;
alter table familias add column if not exists ruta_apoyo_estado text;

comment on column familias.prioridad_motivos is
  'Por que quedo en esa prioridad. Es lo que hace que la letra se sostenga sola.';
comment on column familias.desea_ruta_apoyo is
  'Si la familia quiere ser orientada hacia un programa de apoyo. Reemplaza la '
  'postulacion a un convenio concreto, que prometia lo que depende de un tercero.';

-- -----------------------------------------------------------------------------
-- UNA SOLA VIVIENDA PRINCIPAL POR HOGAR
-- -----------------------------------------------------------------------------
-- Se descubrio el 20 de agosto corriendo las pruebas de acceso: una familia con dos
-- viviendas marcadas como principal aparece DOS VECES en el tablero, porque la vista
-- une familias con viviendas y ese `left join` multiplica la fila.
--
-- Es el peor defecto posible en un censo y no da error: el total sube solo, y el total
-- es la palanca con la que se le pide a una entidad. Una cifra inflada que alguien
-- verifique en terreno desmonta la confianza del registro entero.
--
-- Como llegaron a haber dos. Las semillas locales usaban `on conflict do nothing`
-- creyendo que eso bastaba, pero `on conflict` sin una restriccion que violar no
-- protege de nada: la segunda insercion simplemente entra. Al reiniciarse el entorno,
-- la siembra corrio de nuevo y duplico las viviendas de los dos casos de prueba.
--
-- La API no tenia el defecto —borra la principal antes de insertar— pero el esquema si
-- lo permitia, y una regla que solo vive en el codigo de la aplicacion es una regla que
-- alguna ruta futura se va a saltar.
--
-- Se limpian los duplicados conservando el mas reciente: es el que refleja la ultima
-- visita, y ademas es el que la API habria dejado.
delete from viviendas v
 where v.es_principal
   and exists (
     select 1 from viviendas otra
      where otra.familia_id = v.familia_id
        and otra.es_principal
        and otra.id > v.id
   );

create unique index if not exists uq_vivienda_principal
  on viviendas (familia_id) where es_principal;
