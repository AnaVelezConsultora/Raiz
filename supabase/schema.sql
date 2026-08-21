-- =============================================================================
-- RAIZ - Caracterizacion y seguimiento de familias afectadas
-- Esquema PostgreSQL para Supabase (plan gratuito) / portable a RDS o Aurora
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
--
-- Diseno: los nombres de columna replican EXACTAMENTE los nombres de campo del
-- XLSForm de KoboToolbox. Importar es un COPY, no un ETL. Ese es el contrato que
-- hace que la Fase 1 (Kobo) no sea trabajo desechable.
--
-- Reglas aplicadas:
--   - Sin float para dinero: bigint en centavos (sufijo _cop_minor)
--   - select_multiple de Kobo -> text[] (llegan separados por espacio, se castean)
--   - Enums para dominios estables, text para lo que puede cambiar en emergencia
--   - RLS activo en todas las tablas con datos personales
--   - La vista publica NO expone identidad y degrada la coordenada a ~110 m
-- =============================================================================

create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- =============================================================================
-- 1. DOMINIOS
-- =============================================================================

create type zona_t              as enum ('rural', 'urbana');
create type prioridad_t         as enum ('p0', 'p1', 'p2', 'p3');
create type estado_verif_t      as enum ('reportado', 'contactado', 'verificado', 'no_ubicado', 'duplicado');
-- QUE SE VE en la estructura. Nada mas: si se puede vivir ahi y si entrar es
-- peligroso son otras dos preguntas, con sus propios tipos. Estuvieron mezcladas
-- —este enum llego a tener un valor 'riesgo'— y esa mezcla es la que hacia imposible
-- decir «moderada pero inhabitable», que es un caso frecuente y urgente.
create type afectacion_t        as enum ('sin_dano', 'leve', 'moderado', 'severo',
                                         'destruida', 'no_determinado');

-- SI SE PUEDE ESTAR AHI. Depende del dano pero no es el dano: una casa moderadamente
-- danada puede ser inhabitable por el terreno, y una severa puede estar apuntalada.
create type habitabilidad_t     as enum ('habitable', 'habitable_con_restricciones',
                                         'no_habitable', 'evacuada', 'no_determinado');

-- SI ENTRAR ES PELIGROSO HOY. Es una alerta comunitaria, no un dictamen: quien llena
-- la ficha es un lider comunal y no un ingeniero. Por eso el nivel mas alto no dice
-- «riesgo inminente de colapso» —una afirmacion tecnica que no puede sostener— sino lo
-- que ve y lo que hay que hacer.
create type riesgo_visible_t    as enum ('no_observado', 'requiere_evaluacion',
                                         'peligro_evidente');
-- La reconstruccion no afecta solo al propietario: un arrendatario puede necesitar
-- subsidio de arriendo y un ocupante tiene necesidades humanitarias con o sin titulo.
create type tenencia_t          as enum ('propietario', 'arrendatario', 'poseedor',
                                         'usufructo', 'familiar', 'ocupante',
                                         'mayordomo', 'no_informa');
create type rol_t               as enum ('coordinador', 'custodio', 'validador', 'digitador', 'lider');
create type estado_remision_t   as enum ('borrador', 'enviado', 'radicado', 'en_tramite', 'atendido', 'rechazado', 'sin_respuesta');
create type estado_ayuda_t      as enum ('identificada', 'gestionada', 'programada', 'entregada', 'no_procede');

-- Vocabularios cerrados de dos campos que se AGREGAN en los reportes.
--
-- Con texto libre, "agua", "agua potable" y "Agua Potable" son tres necesidades
-- distintas, y el consolidado deja de ser sumable justo cuando hay que sustentar una
-- peticion ante una entidad. Lo mismo con el origen de la coordenada: distinguir el
-- dato medido del aproximado es lo que permite ponderar la fuente, y no sirve si cada
-- cliente escribe el valor a su manera.
--
-- Los valores replican los codigos del XLSForm y del paquete @raiz/dominio, que es el
-- mismo contrato de siempre: un solo vocabulario para Kobo, la PWA, la API y la base.
create type gps_fuente_t as enum ('sitio', 'compartida', 'aprox', 'no_disp');

-- De donde salio el dato y hasta donde esta comprobado. DOS EJES, no uno: el origen
-- no cambia nunca y la verificacion sube con el tiempo. Ver 68-origen-y-verificacion.
create type origen_dato_t as enum ('observado', 'familia', 'tercero', 'listado_entidad');

create type nivel_verificacion_t as enum (
  'r0_autodeclarado', 'r1_reportado_tercero', 'r2_verificado_presencial',
  'r3_verificado_documental', 'r4_verificado_tecnico', 'r5_validado_institucional');

-- El orden es de URGENCIA. Las tres primeras disparan una ruta el mismo dia; el
-- mercado y la ropa esperan a manana. 'proteccion' cubre personas solas, familias
-- expuestas y riesgo de violencia: se marca la necesidad y NO se piden detalles, porque
-- lo que sigue es una ruta especializada y no un campo de texto en una ficha que llena
-- un vecino.
create type necesidad_t  as enum ('atencion_medica', 'proteccion', 'alojamiento_temporal',
                                  'agua_potable', 'alimentos', 'medicamentos',
                                  'apoyo_dependencia', 'alimentacion_especial',
                                  'dormir', 'carpa', 'aseo', 'cocina', 'ropa',
                                  'panales', 'psicosocial', 'transporte', 'documentos');

-- QUE CLASE DE INFRAESTRUCTURA. El orden es el que usa la mesa al priorizar: el
-- acueducto deja sin servicio a mas hogares de un golpe, y una via cerrada aisla
-- veredas enteras y bloquea la ayuda de todas las demas.
create type tipo_punto_t as enum ('acueducto', 'via', 'energia', 'puente',
                                  'alcantarillado', 'puesto_salud', 'escuela',
                                  'centro_comunitario', 'telecomunicaciones', 'otro');

create type estado_servicio_t as enum ('operativo', 'intermitente', 'fuera_servicio',
                                       'destruido');

-- =============================================================================
-- 2. CATALOGOS Y USUARIOS
-- =============================================================================

create table organizaciones (
  id          bigserial primary key,
  nombre      text not null unique,
  tipo        text not null,               -- junta, asociacion, comite, federacion, entidad, ong
  contacto    text,
  telefono    text,
  creado_en   timestamptz not null default now()
);
comment on table organizaciones is 'Nodos de recoleccion y entidades destinatarias';

-- Supabase crea auth.users. Este es el perfil de aplicacion.
create table perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  nombre           text not null,
  rol              rol_t not null default 'lider',
  organizacion_id  bigint references organizaciones(id),
  telefono         text,
  -- Cedula de quien registra. No es un dato administrativo: cuando una entidad
  -- devuelve un caso preguntando quien lo levanto, la respuesta tiene que ser una
  -- persona identificable y no un correo electronico.
  documento        text,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now()
);
-- Unico entre los ACTIVOS: alguien que se retiro y vuelve no debe chocar consigo mismo.
create unique index idx_perfiles_documento
  on perfiles (documento) where documento is not null and activo;

create table entidades (
  id          bigserial primary key,
  nombre      text not null unique,         -- Secretaria de Agricultura y Pesca, Gestion del Riesgo, Alcaldia
  nivel       text not null,                -- municipal, departamental, nacional, cooperacion
  contacto    text,
  correo      text,
  creado_en   timestamptz not null default now()
);

-- =============================================================================
-- 2.b EL EVENTO
-- =============================================================================
--
-- «El terremoto es el evento que pone a funcionar la plataforma. La plataforma debe
-- sobrevivir al terremoto.» Tecnicamente, eso es esta tabla.
--
-- Sin ella, todos los casos pertenecen implicitamente al sismo del 10 de agosto, y el
-- dia que haya una replica fuerte, o El Aguila, o el invierno de noviembre, no habria
-- forma de separarlos. «Muestrame las afectaciones de ESTE evento» es la primera
-- pregunta que hace una entidad.
create table eventos (
  id              bigserial primary key,
  codigo          text not null unique,          -- SISMO-2026-08-10
  tipo            text not null,                 -- sismo, inundacion, deslizamiento
  nombre          text not null,
  ocurrido_en     timestamptz,
  magnitud        text,                          -- texto: cada tipo la mide distinto
  profundidad_km  numeric(6,2),
  fuente_oficial  text,                          -- SGC, IDEAM, UNGRD
  departamento    text,
  municipio       text,
  estado          text not null default 'activo',
  creado_en       timestamptz not null default now()
);

-- =============================================================================
-- 3. FAMILIAS (el caso). Codigo RZ-AAAA-NNNNNN autogenerado.
-- =============================================================================

create sequence seq_caso start 1;

create table familias (
  id                     bigserial primary key,
  codigo                 text not null unique
                           default ('RZ-' || to_char(now(), 'YYYY') || '-' ||
                                    lpad(nextval('seq_caso')::text, 6, '0')),

  -- trazabilidad con Kobo: _id y _uuid del submission. Hacen la carga idempotente.
  kobo_id                integer unique,
  kobo_uuid              text unique,

  -- UUID generado por la PWA en el dispositivo. Es la clave de idempotencia del
  -- envio: si el registro llega al servidor pero la respuesta se pierde por corte
  -- de senal, el reintento actualiza esta misma fila en lugar de crear un
  -- duplicado. En un censo un duplicado silencioso es peor que un fallo visible.
  origen_id              uuid unique,

  -- bloque 0: control
  fecha_registro         date not null default current_date,
  registrador_nombre     text not null,
  registrador_org        text,
  registrador_tel        text,
  -- Se llena solo con el usuario que inserta. Antes quedaba nulo y la politica
  -- "el lider ve lo suyo" no encontraba nada: el voluntario grababa un caso y
  -- acto seguido dejaba de verlo.
  registrador_perfil_id  uuid references perfiles(id) default auth.uid(),
  fuente_dato            text not null,        -- presencial, whatsapp, llamada, lider, otra_entidad
  -- El canal por el que llego (arriba) NO es lo mismo que quien observo (abajo):
  -- presencial + lo dijo la familia es una combinacion legitima y frecuente.
  origen_dato            origen_dato_t,
  nivel_verificacion     nivel_verificacion_t not null default 'r0_autodeclarado',
  nivel_verificado_por   uuid references perfiles(id),
  nivel_verificado_en    timestamptz,
  consentimiento         boolean not null default false,
  -- Ley 1581: los datos sensibles se autorizan aparte y nadie esta obligado a
  -- darlos. Nulo es "no se pregunto", que no es lo mismo que un no.
  autoriza_datos_sensibles    boolean,
  autoriza_remision_entidades boolean,
  -- Prueba de que la autorizacion se pidio: que texto se leyo y cuando respondio.
  version_autorizacion   text,
  autorizado_en          timestamptz,

  -- A que evento pertenece. Ver la tabla `eventos`: sin esta columna, el dia que haya
  -- una replica o una inundacion no habria forma de separar unos casos de otros.
  evento_id              bigint references eventos(id),

  -- bloque 1: ubicacion
  departamento           text not null,
  municipio              text not null,
  zona                   zona_t not null,
  vereda                 text,
  corregimiento          text,
  barrio                 text,
  comuna                 text,
  direccion_ref          text,
  lat                    double precision,
  lon                    double precision,
  geom                   geography(Point, 4326)
                           generated always as (
                             case when lat is not null and lon is not null
                               then st_setsrid(st_makepoint(lon, lat), 4326)::geography
                             end
                           ) stored,
  gps_fuente             gps_fuente_t,

  -- bloque 2: hogar. Identidad solo si consentimiento = true.
  jefe_nombres           text,
  jefe_apellidos         text,
  tipo_doc               text,
  num_doc                text,
  tel_1                  text not null,
  tel_1_whatsapp         boolean,
  tel_2                  text,
  personas_total         integer not null check (personas_total > 0),
  -- De ese total, cuantas estan FUERA por causa del sismo. «Seis, de las cuales cuatro
  -- permanecen y dos estan evacuadas» cambia el calculo de raciones, camas y agua, y
  -- cuenta algo que nadie mas esta contando: cuanta gente se fue del territorio.
  fuera_del_hogar        integer not null default 0 check (fuera_del_hogar >= 0),
  h_0_5 integer default 0, m_0_5 integer default 0,
  h_6_11 integer default 0, m_6_11 integer default 0,
  h_12_17 integer default 0, m_12_17 integer default 0,
  h_18_59 integer default 0, m_18_59 integer default 0,
  h_60 integer default 0, m_60 integer default 0,
  gestantes              integer default 0,
  lactantes              integer default 0,
  discapacidad_n         integer default 0,
  discapacidad_tipo      text[],
  enf_cronica_n          integer default 0,
  -- Fallecidos y heridos. Se cuentan por gravedad para poder sumarlos por vereda,
  -- que es lo que una entidad de salud puede atender. Grave = fue remitido a un
  -- hospital: el criterio es el hecho, porque quien llena la ficha es un lider
  -- comunal y no un enfermero.
  fallecidos             integer not null default 0,
  heridos_leves          integer not null default 0,
  heridos_graves         integer not null default 0,

  -- QUIEN NO PUEDE SALIR SOLO. Distinto de la discapacidad y por eso va aparte:
  -- incluye al adulto mayor dependiente, a la persona lesionada esta semana y a quien
  -- tiene movilidad reducida sin diagnostico. Es lo que un organismo de socorro
  -- necesita ANTES de una replica, y es operativo: no pide diagnostico de nadie.
  requiere_apoyo_evacuar integer not null default 0 check (requiere_apoyo_evacuar >= 0),

  -- Cuantas personas requieren medicacion permanente, NO que enfermedad tienen.
  -- Pedirle a un lider comunal que clasifique una condicion medica aumenta la
  -- exposicion de datos sensibles sin mejorar una sola decision de terreno; que
  -- enfermedad es lo determina despues una entidad de salud.
  requiere_medicamento   boolean,
  etnia                  text,
  victima_conflicto      boolean,
  afiliacion             text[],
  afiliacion_cual        text,

  -- bloque 6.b: ruta de apoyo
  --
  -- Reemplaza la postulacion a un convenio con una organizacion concreta. Dos razones:
  -- la pertenencia a organizaciones sociales es dato sensible, y «el caso se postula al
  -- convenio» promete algo que depende de un tercero. Raiz no entrega la ayuda y no
  -- puede comprometerla; lo unico que puede ofrecer con verdad es preguntar si la
  -- familia QUIERE ser orientada y dejar constancia de a donde se remitio.
  desea_ruta_apoyo        boolean,
  ruta_apoyo_organizacion text,
  ruta_apoyo_estado       text,

  -- bloque 7: triaje
  --
  -- LA PRIORIDAD LA CALCULA EL SERVIDOR con las respuestas de los cuatro pasos, y de
  -- eso guarda el POR QUE. Un caso que llega marcado «P1» obliga a la entidad a confiar
  -- en el criterio de quien lo marco, que varia entre dos voluntarios de la misma
  -- vereda. Uno que llega «P1 porque la vivienda es inhabitable, la familia no tiene
  -- alojamiento seguro y hay quien requiere medicacion permanente» se sostiene solo — y,
  -- sobre todo, se puede discutir con motivos en vez de con una letra.
  --
  -- Quien registra solo puede ELEVARLA: ninguna regla previo la emergencia que alguien
  -- tiene enfrente. Cuando eso pasa, `prioridad_calculada` queda en falso.
  prioridad              prioridad_t not null,
  prioridad_motivos      text[] not null default '{}',
  prioridad_calculada    boolean not null default false,

  -- CON QUE SE SOSTIENE EL CASO. Cuando una alcaldia pregunte de donde salio un dato,
  -- la respuesta util no es «hay una foto»: es «visita presencial, mas lo que reporto
  -- la familia, mas seis fotografias».
  tipos_evidencia        text[] not null default '{}',
  necesidades_inmediatas necesidad_t[] not null default '{}',
  -- La lista cerrada sirve para sumar; no para describir. El texto la acompana.
  necesidades_otra       text,
  ya_recibio_ayuda       boolean,
  ayuda_cual             text,
  ayuda_quien            text,
  observaciones          text,

  -- bloque 8: verificacion
  estado_verificacion    estado_verif_t not null default 'reportado',
  verificado_por         text,
  fecha_verificacion     date,
  duplicado_de_id        bigint references familias(id),

  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

-- HU 1.5.2 — la base rechaza identidad sin autorizacion de la familia.
--
-- POR QUE UNA RESTRICCION Y NO SOLO CODIGO
--
-- La regla ya se aplica dos veces: el cliente no persiste identidad sin marca, y la
-- API la retira en el borde de escritura (aplicarConsentimiento, en @raiz/dominio).
-- Las dos son codigo, y el codigo se puede rodear: un script de carga, una consulta
-- manual del dia de la emergencia, un importador de Kobo escrito con prisa. Esta
-- restriccion es la unica capa que no depende de que quien escriba se acuerde.
--
-- POR QUE AHORA Y NO DESPUES
--
-- Se agrega mientras la tabla esta vacia. Con filas adentro, esto deja de ser una
-- linea y pasa a ser una migracion que hay que negociar con los datos ya escritos de
-- familias reales.
--
-- POR QUE EL TELEFONO NO ESTA AQUI
--
-- tel_1 es obligatorio y viaja siempre, con autorizacion o sin ella. Es un dato
-- personal de contacto directo y por lo tanto una contradiccion abierta con lo que
-- promete la documentacion. Es la decision HU 1.5.1, y sigue sin resolverse: no se
-- mete en la restriccion por decision de alguien que programa. El dia que se resuelva
-- a favor de protegerlo, se agrega a esta lista y a CAMPOS_NOMINALES.
--
-- Se compara contra cadena vacia ademas de nulo porque un cliente que "limpia"
-- escribiendo '' estaria cumpliendo la letra y no la regla.
alter table familias add constraint identidad_exige_consentimiento check (
  consentimiento
  or (coalesce(jefe_nombres, '')   = ''
  and coalesce(jefe_apellidos, '') = ''
  and coalesce(tipo_doc, '')       = ''
  and coalesce(num_doc, '')        = '')
);

-- Derivados utiles, calculados por la base y no por el frontend.
alter table familias add column menores integer
  generated always as (h_0_5 + m_0_5 + h_6_11 + m_6_11 + h_12_17 + m_12_17) stored;
alter table familias add column adultos_mayores integer
  generated always as (h_60 + m_60) stored;
alter table familias add column suma_desagregado integer
  generated always as (h_0_5 + m_0_5 + h_6_11 + m_6_11 + h_12_17 + m_12_17
                       + h_18_59 + m_18_59 + h_60 + m_60) stored;

create index idx_familias_zona        on familias (zona);
create index idx_familias_municipio   on familias (municipio, vereda, barrio);
create index idx_familias_evento      on familias (evento_id);
-- Cuanto de lo que hay esta comprobado. Es la consulta de la franja del tablero.
create index idx_familias_nivel       on familias (nivel_verificacion);
create index idx_familias_prioridad   on familias (prioridad);
create index idx_familias_estado      on familias (estado_verificacion);
create index idx_familias_geom        on familias using gist (geom);
create index idx_familias_doc         on familias (num_doc) where num_doc is not null;
create index idx_familias_tel         on familias (tel_1);

-- =============================================================================
-- 4. VIVIENDA. Una familia puede tener mas de una estructura afectada.
-- =============================================================================

create table viviendas (
  id                     bigserial primary key,
  familia_id             bigint not null references familias(id) on delete cascade,
  es_principal           boolean not null default true,
  tenencia               tenencia_t not null,
  arrendador_contacto    text,
  hogares_en_estructura  integer not null default 1 check (hogares_en_estructura > 0),
  tipo_vivienda          text,
  material_paredes       text,
  material_techo         text,
  -- LOS TRES EJES DEL DANO, que antes iban mezclados en uno. El dano es del muro, la
  -- habitabilidad es de la familia, y el riesgo es de entrar hoy. Fundirlos pierde la
  -- diferencia justo donde decide algo: si esta familia necesita techo esta noche.
  afectacion             afectacion_t not null,
  habitabilidad          habitabilidad_t,
  riesgo_visible         riesgo_visible_t,

  -- LO QUE SE VE, en lista cerrada. Con texto libre, «grietas», «rajaduras» y
  -- «fisuras» son tres cosas distintas y el consolidado por vereda deja de ser sumable
  -- justo cuando hace falta. Describir no es diagnosticar: la lista nombra lo que
  -- cualquiera ve desde afuera.
  danos_visibles         text[] not null default '{}',
  dano_descripcion       text check (dano_descripcion is null or length(dano_descripcion) <= 500),

  -- QUE documento tiene la familia, no el documento. Si despues hay una ruta juridica
  -- o de reconstruccion, ahi se solicita lo que haga falta; recoger escrituras hoy
  -- seria acumular papeles sensibles en telefonos prestados.
  documentos_tenencia    text[] not null default '{}',

  -- SI YA VINO UNA ENTIDAD. Responde tres preguntas y la tercera es la mas util: no
  -- mandar dos veces al mismo tecnico, no perder el concepto que ya dio, y saber DONDE
  -- NO HA IDO NADIE. Nulo es «no se pregunto», que no es un no.
  --
  -- NO sube el nivel de verificacion por si sola: que la familia diga «aqui vino un
  -- ingeniero» es, todavia, algo que dijo la familia.
  visita_oficial          boolean,
  visita_oficial_entidad  text,
  visita_oficial_fecha    date,
  visita_oficial_concepto text,

  donde_duerme           text,
  requiere_vivienda      text[],
  servicios_afectados    text[],
  -- anexo urbano
  estrato                text,
  tipo_unidad            text,
  perdio_medio_vida      boolean,
  medio_vida_desc        text,
  requiere_urbano        text[],
  creado_en              timestamptz not null default now()
);
create index idx_viviendas_familia on viviendas (familia_id);
create index idx_viviendas_afect   on viviendas (afectacion);
create index idx_viviendas_habitabilidad on viviendas (habitabilidad);
-- Parcial: el indice solo existe para las que hay que atender hoy.
create index idx_viviendas_riesgo on viviendas (riesgo_visible)
  where riesgo_visible = 'peligro_evidente';
-- La pregunta invertida —donde NO ha ido nadie— es la que mueve una agenda.
create index idx_viviendas_sin_visita on viviendas (familia_id)
  where visita_oficial is not true;

-- UNA SOLA VIVIENDA PRINCIPAL POR HOGAR.
--
-- Sin esto, una familia con dos principales aparece DOS VECES en el tablero, porque la
-- vista une familias con viviendas y ese left join multiplica la fila. Es el peor
-- defecto posible en un censo y no da error: el total sube solo, y el total es la
-- palanca con la que se le pide a una entidad.
--
-- Paso de verdad, el 20 de agosto, y lo caso una prueba de acceso. La API nunca lo
-- produjo —borra la principal antes de insertar— pero el esquema lo permitia, y una
-- regla que solo vive en el codigo de la aplicacion es una regla que alguna ruta futura
-- se va a saltar.
create unique index uq_vivienda_principal on viviendas (familia_id) where es_principal;

-- =============================================================================
-- 5. PRODUCCION (anexo rural)
-- =============================================================================

create table produccion (
  id                        bigserial primary key,
  familia_id                bigint not null references familias(id) on delete cascade,
  predio_nombre             text,
  area_ha                   numeric(10,2),
  tenencia_predio           text,
  tiene_titulo              boolean,
  via_acceso                text,
  cultivos                  text[],
  cultivos_otro             text,
  area_cultivo_afectada_ha  numeric(10,2),
  perdida_pct               integer check (perdida_pct between 0 and 100),
  -- dinero SIEMPRE en centavos, nunca float
  perdida_estimada_cop_minor bigint,
  bovinos_perdidos          integer default 0,
  porcinos_perdidos         integer default 0,
  aves_perdidas             integer default 0,
  otros_animales            text,
  infra_productiva          text[],
  infra_productiva_otro     text,
  -- Maquinaria y vehiculos: son insumo de la cadena productiva y quedarse por
  -- fuera del listado es justamente como se pierden en el camino.
  maquinaria_afectada       boolean,
  maquinaria_detalle        text,
  requiere_agro             text[],
  requiere_agro_otro        text,
  creado_en                 timestamptz not null default now()
);
create index idx_produccion_familia on produccion (familia_id);

-- =============================================================================
-- 6. FOTOS. El binario se queda en Kobo. Aqui va la referencia.
--    No subir fotos al Storage gratuito de Supabase: 1 GB se agota en 300 fotos.
-- =============================================================================

-- LA IMAGEN NO VIAJA POR LA API. El celular escribe cada bloque directo contra el
-- almacenamiento con un permiso firmado de vida corta; lo unico que la API mueve es la
-- union final, que ocurre dentro de la nube y no sobre la red del voluntario. Por eso
-- la fila conoce el tamano de bloque y la suma: son lo que permite reanudar una subida
-- interrumpida y verificar que lo unido es lo que se mando.
create table fotos (
  id             bigserial primary key,
  familia_id     bigint not null references familias(id) on delete cascade,
  tipo           text not null,            -- fachada, dano, cultivo, documento
  url            text not null,            -- ruta del objeto ya completo
  nombre_orig    text,

  -- UUID que genero el dispositivo. Clave de idempotencia de la subida.
  origen_id      uuid,
  bytes          integer,
  tipo_mime      text,
  -- SHA-256 de la imagen completa, declarado por el dispositivo. Es contra esto que se
  -- verifica lo unido: sin la comparacion, una subida a medias pasaria por buena.
  suma_sha256    text,
  estado         text not null,
  -- Donde viven los bloques mientras la imagen esta a medias. Nulo si ya se unieron.
  partes_prefijo text,
  -- Con `bytes`, dice cuantos bloques son y cuales faltan.
  tamano_bloque  integer,
  autorizada_en  timestamptz,
  confirmada_en  timestamptz,
  creado_en      timestamptz not null default now(),

  constraint foto_estado_valido check (estado in ('autorizada', 'confirmada')),
  -- Una foto confirmada sin fecha de confirmacion es un estado que no puede existir, y
  -- la base es el unico sitio donde eso se puede garantizar de verdad.
  constraint foto_confirmada_tiene_fecha
    check (estado <> 'confirmada' or confirmada_en is not null)
);
create index idx_fotos_familia on fotos (familia_id);
create unique index idx_fotos_origen on fotos (origen_id);

-- =============================================================================
-- 7. REMISIONES. Aqui esta el valor real del sistema: la trazabilidad exigible.
-- =============================================================================

create table remisiones (
  id               bigserial primary key,
  familia_id       bigint not null references familias(id) on delete cascade,
  entidad_id       bigint not null references entidades(id),
  asunto           text not null,
  fecha_envio      date not null default current_date,
  radicado         text,
  estado           estado_remision_t not null default 'borrador',
  responsable      text,
  respuesta        text,
  fecha_respuesta  date,
  -- Los dias sin respuesta NO se almacenan: se calculan al consultar.
  --
  -- Antes esto era una columna generada `stored` sobre current_date, y tenia dos
  -- problemas. El primero es que PostgreSQL la rechaza: una expresion generada
  -- debe ser inmutable y current_date no lo es, asi que el esquema completo
  -- fallaba al crearse.
  --
  -- El segundo importa mas. Aunque se hubiera podido almacenar, el valor habria
  -- quedado congelado el dia de la insercion, y el sentido de este dato es
  -- exactamente el contrario: mide cuanto lleva una entidad SIN responder, asi
  -- que tiene que crecer cada dia que pasa. Congelado en cero, la vista de
  -- presion institucional habria mostrado siempre cero dias de mora.
  --
  -- El calculo vive ahora en v_estado_gestion.
  creado_en        timestamptz not null default now()
);
create index idx_remisiones_familia on remisiones (familia_id);
create index idx_remisiones_entidad on remisiones (entidad_id, estado);
comment on column remisiones.radicado is
  'Numero de radicado de la entidad. Sin este numero la remision no es exigible.';

create table ayudas (
  id             bigserial primary key,
  familia_id     bigint not null references familias(id) on delete cascade,
  tipo_ayuda     text not null,             -- mercado, alojamiento, materiales, semillas
  entidad_id     bigint references entidades(id),
  organizacion_id bigint references organizaciones(id),
  estado         estado_ayuda_t not null default 'identificada',
  cantidad       text,
  fecha_entrega  date,
  recibido_por   text,
  observacion    text,
  creado_en      timestamptz not null default now()
);
create index idx_ayudas_familia on ayudas (familia_id, estado);

create table seguimientos (
  id          bigserial primary key,
  familia_id  bigint not null references familias(id) on delete cascade,
  autor_id    uuid references perfiles(id),
  autor_nombre text,
  nota        text not null,
  creado_en   timestamptz not null default now()
);
create index idx_seguimientos_familia on seguimientos (familia_id, creado_en desc);

-- Control de la importacion desde Kobo. Hace el proceso repetible e idempotente.
create table sync_kobo (
  id            bigserial primary key,
  ejecutado_en  timestamptz not null default now(),
  desde_kobo_id integer,
  hasta_kobo_id integer,
  insertados    integer not null default 0,
  actualizados  integer not null default 0,
  errores       integer not null default 0,
  detalle       text
);

-- =============================================================================
-- 7.c PUNTOS DE SERVICIO: la infraestructura de la que dependen muchos hogares
-- =============================================================================
--
-- LA OTRA UNIDAD DE RAIZ. El censo ordena por familia, y ahi cada familia compite con
-- las demas por la misma ayuda. Esto ordena por INFRAESTRUCTURA, y ahi una sola
-- reparacion resuelve doscientos casos a la vez. Es la unidad en la que piensan el
-- CMGRD, la UNGRD y el operador que gira el dinero, y la unica en la que una obra se
-- prioriza.
--
-- POR QUE ES UNA TABLA APARTE Y NO UNA PREGUNTA DEL FORMULARIO. Un acueducto no le
-- pertenece a una familia: le sirve a muchas. Colgarlo del hogar obligaria a
-- preguntarle a las ciento ochenta familias por el mismo tubo roto, y produciria
-- ciento ochenta versiones de un solo hecho.
--
-- ESTO NO ES DATO PERSONAL, y por eso mas abajo sus politicas son mas abiertas que las
-- de familias: un tubo roto no es de nadie.
create sequence seq_punto;

create table puntos_servicio (
  id                bigserial primary key,
  codigo            text not null unique
                      default ('PS-' || to_char(now(), 'YYYY') || '-' ||
                               lpad(nextval('seq_punto')::text, 4, '0')),
  -- Misma clave de idempotencia que las familias y por la misma razon: el registro se
  -- levanta sin senal y el reintento no puede crear un segundo tubo roto.
  origen_id         uuid unique,
  evento_id         bigint references eventos(id),

  tipo              tipo_punto_t not null,
  nombre            text not null,          -- «Acueducto La Cumbre», como lo llama la gente

  departamento      text not null,
  municipio         text not null,
  zona              zona_t not null,
  vereda            text,                   -- donde ESTA el punto
  direccion_ref     text,
  lat               double precision,
  lon               double precision,

  estado_servicio   estado_servicio_t not null,
  descripcion_afectacion text,
  -- Que hace falta para que vuelva a funcionar. Texto libre a proposito: es lo que la
  -- entidad lee para dimensionar, y encasillarlo en una lista lo empobrece.
  requiere          text,

  -- LAS DOS CIFRAS DE HOGARES. Esta es la decision que hace que el registro sirva:
  -- `hogares_estimados` es lo que declara el lider —se consigue hoy, por telefono— y
  -- se muestra SIEMPRE separado de los hogares registrados, que se calculan contra el
  -- censo en v_puntos_tablero. Promediarlas o quedarse con la mas alta destruye las
  -- dos: la primera es el tamano del problema, la segunda cuanto de ese tamano Raiz
  -- puede sostener con registros.
  hogares_estimados integer check (hogares_estimados is null or hogares_estimados >= 0),
  -- A quienes les sirve. Un acueducto suele cruzar varias veredas.
  veredas_servidas  text[] not null default '{}',

  origen_dato          origen_dato_t,
  nivel_verificacion   nivel_verificacion_t not null default 'r0_autodeclarado',
  nivel_verificado_por uuid references perfiles(id),
  nivel_verificado_en  timestamptz,

  registrador_perfil_id uuid references perfiles(id) default auth.uid(),
  registrador_nombre    text not null,
  fecha_registro        date not null default current_date,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

create index idx_puntos_tipo    on puntos_servicio (tipo, estado_servicio);
create index idx_puntos_lugar   on puntos_servicio (municipio, vereda);
create index idx_puntos_evento  on puntos_servicio (evento_id);
create index idx_puntos_veredas on puntos_servicio using gin (veredas_servidas);

-- CRUZAR EL PUNTO CON EL CENSO.
--
-- «La Cumbre», «la cumbre» y «Vda. La Cumbre» son la misma vereda escrita por tres
-- personas distintas, y sin normalizar serian tres. Se comparan sin mayusculas, sin
-- tildes, sin el prefijo «vereda» y sin puntuacion.
--
-- Esto NO resuelve los errores de ortografia ni los nombres alternos, y conviene no
-- pretender que si: el dia que exista el listado veredal oficial del municipio, esta
-- funcion se reemplaza por una llave contra ese listado. Mientras tanto acerca lo
-- suficiente, y por eso la cifra se rotula «registrados en Raiz» y no como una verdad
-- del territorio.
create or replace function normalizar_lugar(t text) returns text
language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(coalesce(t, ''), 'áéíóúüàèìòùÁÉÍÓÚÜÀÈÌÒÙñÑ', 'aeiouuaeiouAEIOUUAEIOUnN')),
        '^\s*(vda|vereda|corregimiento|cgto)\.?\s+', ''
      ),
      '[^a-z0-9 ]', '', 'g'
    ),
  '');
$$;

create index idx_familias_vereda_norm on familias (normalizar_lugar(vereda));

-- =============================================================================
-- 8. VISTAS
-- =============================================================================

-- ADVERTENCIA SOBRE VISTAS EN POSTGRESQL
-- Una vista se ejecuta con los permisos de SU DUENO, no de quien consulta. Por
-- defecto eso SALTA las politicas de acceso por fila: cualquier usuario autenticado
-- podria leer por la vista lo que la tabla le niega. En una vista con nombres y
-- telefonos de familias eso es una fuga completa del censo.
--
-- Por eso:
--   - Las vistas con identidad llevan security_invoker = true y respetan RLS.
--   - Las vistas agregadas o anonimizadas se dejan como estan a proposito, porque
--     su unica razon de existir es ser una ventana controlada.

-- 8.1 Tablero interno: una fila por familia con todo lo que se consulta a diario.
--     CON IDENTIDAD: se ejecuta con los permisos de quien consulta.
create view v_familias_tablero with (security_invoker = true) as
select
  f.id, f.codigo, f.zona, f.municipio,
  coalesce(f.vereda, f.barrio)         as lugar,
  f.jefe_nombres || ' ' || f.jefe_apellidos as responsable,
  f.tel_1, f.personas_total, f.menores, f.adultos_mayores,
  f.discapacidad_n, f.prioridad, f.estado_verificacion,
  v.tenencia, v.afectacion, v.habitabilidad, v.riesgo_visible,
  f.lat, f.lon,
  (select count(*) from fotos       x where x.familia_id = f.id) as n_fotos,
  (select count(*) from remisiones  r where r.familia_id = f.id) as n_remisiones,
  (select count(*) from remisiones  r where r.familia_id = f.id
     and r.estado in ('enviado','radicado','en_tramite')
     and r.fecha_respuesta is null)                              as remisiones_sin_respuesta,
  (select count(*) from ayudas      a where a.familia_id = f.id
     and a.estado = 'entregada')                                 as ayudas_entregadas,
  f.fecha_registro,
  f.origen_dato,
  f.nivel_verificacion
from familias f
left join viviendas v on v.familia_id = f.id and v.es_principal
where f.estado_verificacion <> 'duplicado';

-- 8.2 Vista PUBLICA. Sin identidad. Coordenada degradada a 3 decimales (~110 m)
--     para que el mapa muestre la afectacion sin senalar la casa de una familia.
create view v_mapa_publico as
select
  f.codigo,
  f.zona,
  f.municipio,
  coalesce(f.vereda, f.barrio) as lugar,
  f.prioridad,
  f.personas_total,
  f.menores,
  f.adultos_mayores,
  v.afectacion,
  v.habitabilidad,
  round(f.lat::numeric, 3) as lat,
  round(f.lon::numeric, 3) as lon,
  f.fecha_registro
from familias f
left join viviendas v on v.familia_id = f.id and v.es_principal
where f.estado_verificacion <> 'duplicado'
  and f.lat is not null;

-- 8.3 Cifras de presion institucional.
create view v_estadisticas as
select
  count(*)                                                   as familias,
  sum(personas_total)                                        as personas,
  sum(menores)                                               as menores,
  sum(adultos_mayores)                                       as adultos_mayores,
  sum(discapacidad_n)                                        as personas_con_discapacidad,
  count(*) filter (where zona = 'rural')                     as rurales,
  count(*) filter (where zona = 'urbana')                    as urbanas,
  count(*) filter (where prioridad = 'p0')                   as urgentes,
  count(*) filter (where estado_verificacion = 'verificado')  as verificadas,
  count(distinct coalesce(vereda, barrio))                   as lugares_reportados
from familias
where estado_verificacion <> 'duplicado';

create view v_estado_gestion as
select
  e.nombre                                             as entidad,
  count(r.id)                                          as casos_remitidos,
  count(r.id) filter (where r.estado = 'atendido')     as atendidos,
  count(r.id) filter (where r.fecha_respuesta is null) as sin_respuesta,
  -- Se calcula al consultar, no al escribir: la mora crece cada dia que la
  -- entidad no responde. Ver el comentario en la tabla remisiones.
  max(case when r.fecha_respuesta is null
           then current_date - r.fecha_envio end)      as dias_max_sin_respuesta
from entidades e
left join remisiones r on r.entidad_id = e.id
group by e.nombre
order by sin_respuesta desc;

-- 8.4 Deteccion de duplicados. Se revisa, no se borra automaticamente.
--     CON IDENTIDAD indirecta (documento y telefono): respeta RLS.
create view v_posibles_duplicados with (security_invoker = true) as
select a.id as id_a, a.codigo as codigo_a, b.id as id_b, b.codigo as codigo_b,
       case when a.num_doc = b.num_doc then 'mismo documento'
            when a.tel_1  = b.tel_1   then 'mismo telefono'
            else 'a menos de 50 m' end as motivo
from familias a
join familias b
  on a.id < b.id
 and (
      (a.num_doc is not null and a.num_doc = b.num_doc)
   or (a.tel_1 = b.tel_1)
   or (a.geom is not null and b.geom is not null
       and st_dwithin(a.geom, b.geom, 50))
     )
where a.estado_verificacion <> 'duplicado'
  and b.estado_verificacion <> 'duplicado';

-- 8.5 Los puntos de servicio, con LAS DOS CIFRAS ya resueltas.
--
--     `hogares_registrados` se calcula en cada consulta y NO se guarda. Guardarlo
--     obligaria a recalcularlo cada vez que entra una familia, y el dia que ese
--     recalculo fallara el numero quedaria viejo sin que nadie lo notara. Son decenas
--     de puntos: el costo de calcularlo al vuelo es irrelevante frente al riesgo de
--     que mienta.
create view v_puntos_tablero with (security_invoker = true) as
select
  p.id, p.codigo, p.tipo, p.nombre,
  p.municipio, p.zona, p.vereda,
  p.direccion_ref, p.lat, p.lon,
  p.estado_servicio, p.descripcion_afectacion, p.requiere,
  p.hogares_estimados,
  p.veredas_servidas,
  (select count(*)
     from familias f
    where f.estado_verificacion <> 'duplicado'
      and normalizar_lugar(coalesce(f.vereda, f.barrio)) = any (
            select normalizar_lugar(v) from unnest(p.veredas_servidas) as v
          )
  ) as hogares_registrados,
  p.origen_dato, p.nivel_verificacion,
  p.registrador_nombre, p.fecha_registro
from puntos_servicio p;

-- =============================================================================
-- 9. RLS. Se activa desde el dia uno: son datos sensibles de poblacion vulnerable.
-- =============================================================================

alter table familias      enable row level security;
alter table viviendas     enable row level security;
alter table produccion    enable row level security;
alter table fotos         enable row level security;
alter table remisiones    enable row level security;
alter table ayudas        enable row level security;
alter table seguimientos  enable row level security;
alter table perfiles      enable row level security;

create or replace function mi_rol() returns rol_t
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;

create or replace function es_mesa() returns boolean
language sql stable as $$
  select mi_rol() in ('coordinador', 'custodio', 'validador')
$$;

-- FAMILIAS -------------------------------------------------------------------
-- La mesa ve y edita todo.
create policy mesa_lee_familias   on familias for select using (es_mesa());
create policy mesa_edita_familias on familias for all    using (es_mesa()) with check (es_mesa());

-- El lider y el digitador ven unicamente lo que ellos mismos reportaron.
create policy propio_lee_familias on familias for select
  using (registrador_perfil_id = auth.uid());

-- Cualquier usuario activo puede CREAR un caso, pero solo a su propio nombre.
-- La condicion sobre registrador_perfil_id impide firmar un registro como otro.
create policy propio_crea_familias on familias for insert
  with check (auth.uid() is not null and registrador_perfil_id = auth.uid());

-- Y puede corregir lo suyo mientras no lo haya verificado la mesa.
create policy propio_edita_familias on familias for update
  using (registrador_perfil_id = auth.uid() and estado_verificacion <> 'verificado')
  with check (registrador_perfil_id = auth.uid());

-- TABLAS HIJAS ---------------------------------------------------------------
-- Heredan el permiso de la familia: la subconsulta pasa por el RLS de familias,
-- de modo que solo se ve o se escribe sobre casos que ya se pueden ver.
create policy hija_viviendas on viviendas for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

create policy hija_produccion on produccion for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

create policy hija_fotos on fotos for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

create policy hija_seguimientos on seguimientos for all
  using (exists (select 1 from familias f where f.id = familia_id))
  with check (exists (select 1 from familias f where f.id = familia_id));

-- Remisiones y ayudas son gestion institucional: solo la mesa.
create policy mesa_remisiones on remisiones for all using (es_mesa()) with check (es_mesa());
create policy mesa_ayudas     on ayudas     for all using (es_mesa()) with check (es_mesa());

-- PERFILES -------------------------------------------------------------------
create policy perfil_lee on perfiles for select using (id = auth.uid() or es_mesa());

-- Solo el custodio asigna roles. Sin esta politica nadie podia ascender a nadie y
-- todos los voluntarios quedaban atrapados en el rol minimo para siempre.
create policy custodio_administra_perfiles on perfiles for update
  using (mi_rol() = 'custodio') with check (mi_rol() = 'custodio');

-- La auditoria se protege en la seccion 10, junto a la creacion de su tabla.

alter table sync_kobo enable row level security;
create policy sync_kobo_mesa on sync_kobo for all using (es_mesa()) with check (es_mesa());

-- CATALOGOS ------------------------------------------------------------------
-- No son sensibles, pero se activa RLS para que la regla sea "todo denegado salvo
-- lo declarado" y no haya que acordarse de revisar tabla por tabla.
alter table organizaciones enable row level security;
alter table entidades      enable row level security;
create policy catalogo_org      on organizaciones for select using (auth.uid() is not null);
create policy catalogo_ent      on entidades      for select using (auth.uid() is not null);
create policy catalogo_org_mesa on organizaciones for all using (es_mesa()) with check (es_mesa());
create policy catalogo_ent_mesa on entidades      for all using (es_mesa()) with check (es_mesa());

-- PERFILES: el coordinador arma su equipo, y no puede ascender a nadie a su nivel.
create policy coordinador_administra_registro on perfiles for update
  using (mi_rol() = 'coordinador' and rol in ('lider', 'digitador'))
  with check (mi_rol() = 'coordinador' and rol in ('lider', 'digitador'));

-- EVENTOS: un catalogo se lee; escribirlo es de la mesa. NO se le abre al anonimo,
-- aunque un evento no sea dato personal: `anon` no recibe permiso sobre ninguna tabla
-- —el mapa publico se sirve de una vista generada aparte— y una politica que promete lo
-- que el permiso niega es peor que no tenerla, porque se lee como si funcionara.
alter table eventos enable row level security;
create policy evento_lee_autenticado on eventos for select to authenticated using (true);
create policy evento_admin_mesa      on eventos for all   to authenticated
  using (es_mesa()) with check (es_mesa());

-- PUNTOS DE SERVICIO: aqui TODO el mundo ve TODO, incluido el lider, que de las
-- familias solo ve las suyas. Es una diferencia deliberada y no un descuido: esto no
-- es dato personal, y si el lider no ve que el acueducto de su vereda ya esta
-- registrado, lo registra otra vez.
alter table puntos_servicio enable row level security;
create policy punto_lee_autenticado  on puntos_servicio for select to authenticated using (true);
create policy punto_crea_autenticado on puntos_servicio for insert to authenticated with check (true);
create policy punto_edita_propio     on puntos_servicio for update to authenticated
  using (registrador_perfil_id = auth.uid())
  with check (registrador_perfil_id = auth.uid());
create policy punto_admin_mesa       on puntos_servicio for all to authenticated
  using (es_mesa()) with check (es_mesa());

-- PERMISOS DE LA API ---------------------------------------------------------
-- Supabase expone por HTTP todo lo que este en el esquema publico. El visitante
-- anonimo solo debe alcanzar lo agregado y anonimizado, nada mas.
revoke all on v_familias_tablero, v_posibles_duplicados from anon;
grant select on v_mapa_publico, v_estadisticas, v_estado_gestion to anon;
grant select on v_familias_tablero, v_posibles_duplicados to authenticated;

-- =============================================================================
-- 10. AUDITORIA MINIMA
-- =============================================================================

create table auditoria (
  id          bigserial primary key,
  tabla       text not null,
  registro_id bigint not null,
  accion      text not null,
  actor       uuid,
  antes       jsonb,
  despues     jsonb,
  creado_en   timestamptz not null default now()
);

-- Guarda copia completa de cada fila antes y despues, INCLUIDA la identidad. Sin
-- RLS, cualquier usuario autenticado podria leer por aqui el censo entero, saltando
-- todas las politicas de las tablas originales.
alter table auditoria enable row level security;

create policy auditoria_solo_custodia on auditoria for select
  using (mi_rol() in ('custodio', 'coordinador'));

-- Nadie escribe a mano en la auditoria: solo el disparador, que corre como definer.
revoke insert, update, delete on auditoria from anon, authenticated;

create or replace function fn_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (tabla, registro_id, accion, actor, antes, despues)
  values (tg_table_name,
          coalesce(new.id, old.id),
          tg_op,
          auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger tr_auditar_familias
  after insert or update or delete on familias
  for each row execute function fn_auditar();

create trigger tr_auditar_remisiones
  after insert or update or delete on remisiones
  for each row execute function fn_auditar();

-- Las cuatro que faltaban. Durante semanas se dijo que «cada cambio queda auditado» y
-- solo era cierto para familias y remisiones: cambiar el nivel de afectacion de una
-- vivienda, o marcar una ayuda como entregada, no dejaba rastro. Un punto de servicio
-- cambia de estado —se repara, empeora, lo verifica un ingeniero— y ese historico es lo
-- que despues sostiene un informe.
create trigger tr_auditar_viviendas
  after insert or update or delete on viviendas
  for each row execute function fn_auditar();

create trigger tr_auditar_produccion
  after insert or update or delete on produccion
  for each row execute function fn_auditar();

create trigger tr_auditar_ayudas
  after insert or update or delete on ayudas
  for each row execute function fn_auditar();

create trigger tr_auditar_puntos
  after insert or update or delete on puntos_servicio
  for each row execute function fn_auditar();

create or replace function fn_touch() returns trigger
language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

create trigger tr_touch_familias before update on familias
  for each row execute function fn_touch();

create trigger tr_touch_puntos before update on puntos_servicio
  for each row execute function fn_touch();

-- =============================================================================
-- 10.b PERFIL AUTOMATICO AL CREAR UN USUARIO
--
-- Sin esto, un voluntario recien creado inicia sesion, no encuentra perfil y queda
-- sin rol: entra y no puede hacer nada, sin mensaje que lo explique.
--
-- El rol por defecto es el MENOS privilegiado. Ascender a alguien es una accion
-- deliberada del custodio de datos, nunca un efecto secundario del registro.
-- =============================================================================

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

create trigger tr_crear_perfil
  after insert on auth.users
  for each row execute function fn_crear_perfil();

-- =============================================================================
-- 11. CARGA DESDE KOBO
--
-- Exportar de Kobo en CSV (separador ; y valores XML, no etiquetas), cargarlo a
-- una tabla staging con las mismas columnas en text, y correr:
--
--   insert into familias (kobo_id, kobo_uuid, municipio, zona, ...)
--   select "_id"::int, "_uuid",  municipio, zona::zona_t, ...
--   from stg_kobo
--   on conflict (kobo_id) do update set
--        estado_verificacion = excluded.estado_verificacion,
--        prioridad           = excluded.prioridad,
--        actualizado_en      = now();
--
-- ON CONFLICT sobre kobo_id hace la carga idempotente: se puede repetir el
-- proceso completo todos los dias sin duplicar un solo registro.
--
-- Los select_multiple de Kobo llegan separados por espacio:
--   string_to_array(nullif(trim(necesidades_inmediatas), ''), ' ')
-- =============================================================================

-- Semilla minima de entidades destinatarias. Ajustar nombres reales.
insert into entidades (nombre, nivel) values
  ('CMGRD Sevilla',                                    'municipal'),
  ('Alcaldia de Sevilla',                              'municipal'),
  ('CDGRD Valle del Cauca',                            'departamental'),
  ('Secretaria de Agricultura y Pesca del Valle',      'departamental'),
  ('Gobernacion del Valle del Cauca',                  'departamental'),
  ('UNGRD',                                            'nacional'),
  ('Cooperacion internacional',                        'cooperacion')
on conflict (nombre) do nothing;
-- Confirmar el nombre exacto de la dependencia de vivienda de Sevilla y del Valle
-- antes de radicar: el oficio debe ir dirigido a la dependencia correcta.
