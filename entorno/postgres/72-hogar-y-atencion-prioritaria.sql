-- =============================================================================
-- QUIEN NO ESTA, Y QUIEN NO PUEDE SALIR SOLO — 20 de agosto de 2026
--
-- Dos contadores que faltaban, y los dos vienen del enlace institucional. Los dos
-- responden preguntas que hoy no se pueden contestar y que una entidad hace temprano.
--
-- PERSONAS FUERA DEL HOGAR POR EL SISMO. Hoy un hogar de seis personas se registra
-- como seis, esten o no esten. La distincion —«seis, de las cuales cuatro permanecen y
-- dos estan evacuadas»— cambia el calculo de casi todo lo que se entrega: cuantas
-- raciones, cuantas camas, cuanta agua. Y cambia una pregunta que nadie mas esta
-- contando: cuanta gente se fue del territorio, que es el dato con el que despues se
-- discute si hubo desplazamiento.
--
-- PERSONAS QUE NO PUEDEN EVACUAR SOLAS. Es distinto de discapacidad y por eso va
-- aparte: incluye al adulto mayor dependiente, a la persona lesionada esta semana, a
-- quien tiene movilidad reducida sin diagnostico. Es el numero que un organismo de
-- socorro necesita ANTES de una replica, y es operativo: no pide diagnostico de nadie.
--
-- LO QUE NO SE HACE, Y ES DELIBERADO. No se pregunta QUE enfermedad tiene la persona.
-- `medicamento_cual` ya existe en el esquema y deja de pedirse en la pantalla: para la
-- emergencia basta con saber cuantas personas requieren medicacion permanente, y la
-- entidad sanitaria determina despues cual. Registrar diagnosticos aumenta la
-- exposicion de datos sensibles sin mejorar ni una decision de terreno.
--
-- La columna NO se borra: hay registros que la traen y el pasado no se reescribe.
-- =============================================================================

alter table familias add column if not exists fuera_del_hogar integer not null default 0
  check (fuera_del_hogar >= 0);
alter table familias add column if not exists requiere_apoyo_evacuar integer not null default 0
  check (requiere_apoyo_evacuar >= 0);

comment on column familias.fuera_del_hogar is
  'Cuantas personas del hogar estan fuera por causa del sismo. Permite distinguir '
  'las que permanecen de las evacuadas, que es lo que cambia el calculo de la entrega.';
comment on column familias.requiere_apoyo_evacuar is
  'Personas que no pueden salir solas. Distinto de discapacidad: incluye al adulto '
  'mayor dependiente y a la persona lesionada. Operativo, no clinico.';
comment on column familias.medicamento_cual is
  'EN DESUSO desde el 20 de agosto de 2026: la pantalla ya no pregunta que enfermedad. '
  'Se conserva por los registros que la traen. No volver a pedirla.';
