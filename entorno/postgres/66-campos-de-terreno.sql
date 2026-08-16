-- =============================================================================
-- CAMPOS QUE PIDIO EL TERRENO — 16 de agosto de 2026
--
-- Salen de la primera ficha llenada en campo, de noche y sin internet. No son
-- ideas de escritorio: cada uno es algo que el formulario no dejaba registrar y
-- que alguien necesitaba escribir con la familia enfrente.
--
-- TODAS ADITIVAS Y CON `if not exists`. La regla de la HU 1.1.3 es que una
-- migracion no elimina nada y que se pueda aplicar sobre una base que ya tiene
-- filas. El `if not exists` ademas la hace compatible con una base creada desde
-- cero con el schema.sql ya actualizado, donde estas columnas nacen puestas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fallecidos y heridos
-- -----------------------------------------------------------------------------
-- «Que hubo un herido de la familia y tuvo que ser remitido a un hospital. Esa
-- cifra es de heridos.»
--
-- Se cuentan separados por gravedad y no con un campo de texto: es la unica forma
-- de sumarlos por vereda, y esa suma es lo que una entidad de salud puede atender.
-- Grave se define por el hecho y no por criterio medico —fue remitido a un
-- hospital—, porque quien llena la ficha es un lider comunal, no un enfermero.
alter table familias add column if not exists fallecidos     integer not null default 0;
alter table familias add column if not exists heridos_leves  integer not null default 0;
alter table familias add column if not exists heridos_graves integer not null default 0;

comment on column familias.heridos_graves is
  'Heridos que fueron remitidos o atendidos en un hospital. El criterio es el hecho, no un diagnostico.';

-- -----------------------------------------------------------------------------
-- 2. Necesidad de las proximas 72 horas, en palabras de la familia
-- -----------------------------------------------------------------------------
-- La lista cerrada se queda corta y ese es su precio: sirve para sumar, no para
-- describir. El texto libre acompana a la lista, no la reemplaza.
alter table familias add column if not exists necesidades_otra text;

-- -----------------------------------------------------------------------------
-- 3. Maquinaria y vehiculos
-- -----------------------------------------------------------------------------
-- «En maquinaria y similares, eso tambien es un insumo de la cadena de produccion
-- agricola o pecuaria, y de ahi aprovechan para dejar eso por fuera y sacan plata
-- con eso. Se la roban.»
--
-- Registrarlo es lo que impide que quede por fuera del listado. El detalle en
-- texto porque una guadana, un tractor y una moto de trabajo no se parecen en
-- nada y agruparlos ahora seria inventarse un catalogo sin haber visto los datos.
alter table produccion add column if not exists maquinaria_afectada boolean;
alter table produccion add column if not exists maquinaria_detalle  text;

-- -----------------------------------------------------------------------------
-- 4. Lo que la lista no alcanza a decir
-- -----------------------------------------------------------------------------
-- `cultivos_otro` ya existia. Faltaban sus dos hermanas: infraestructura
-- productiva y lo que la familia necesita para reactivarse.
alter table produccion add column if not exists infra_productiva_otro text;
alter table produccion add column if not exists requiere_agro_otro    text;
