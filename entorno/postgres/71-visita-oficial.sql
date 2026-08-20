-- =============================================================================
-- SI YA VINO UNA ENTIDAD, QUE QUEDE DICHO — 19 de agosto de 2026
--
-- «Raiz puede dejar constancia sobre si la edificacion tuvo o ha tenido visitas
-- oficiales.» Es de las cosas mas baratas de construir y de las que mas cambian la
-- conversacion con una entidad, por tres razones distintas:
--
--   NO REPETIR LO YA HECHO. Si el municipio ya mando un tecnico a esa casa, mandar
--   otro es gastar el recurso mas escaso que hay en una emergencia. Hoy nadie lo sabe
--   y por eso se repite.
--
--   NO PERDER LO YA DICHO. El concepto de un tecnico oficial es la evidencia mas
--   fuerte que puede tener un caso, y hoy se queda en la libreta de quien fue.
--
--   SABER DONDE NO HA IDO NADIE. Es la pregunta invertida y es la mas util de las
--   tres: «estas 60 casas no han tenido una sola visita oficial» es una frase que
--   mueve una agenda.
--
-- NO SUBE EL NIVEL DE VERIFICACION POR SI SOLA, y esa es una decision deliberada.
-- Que la familia diga «aqui vino un ingeniero» es, todavia, algo que dijo la familia.
-- Subir el nivel automaticamente convertiria un recuerdo en una validacion
-- institucional, que es exactamente el error que la escala existe para evitar. La
-- constancia queda, y la mesa decide si con eso sube.
--
-- VA EN VIVIENDAS Y NO EN FAMILIAS porque la visita es a la EDIFICACION. Cuando tres
-- hogares comparten una estructura, el tecnico fue una vez y su concepto vale para los
-- tres.
-- =============================================================================

alter table viviendas add column if not exists visita_oficial boolean;
alter table viviendas add column if not exists visita_oficial_entidad text;
alter table viviendas add column if not exists visita_oficial_fecha date;
alter table viviendas add column if not exists visita_oficial_concepto text;

comment on column viviendas.visita_oficial is
  'Si una entidad ya visito la edificacion. Nulo es «no se pregunto», que no es un no.';
comment on column viviendas.visita_oficial_concepto is
  'Que dijeron. Es la evidencia mas fuerte que puede traer un caso, y hoy se pierde.';

-- La pregunta invertida —donde NO ha ido nadie— es la que mueve una agenda, y por eso
-- el indice esta puesto sobre ella y no sobre las visitadas.
create index if not exists idx_viviendas_sin_visita
  on viviendas (familia_id) where visita_oficial is not true;
