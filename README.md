# Raíz

Caracterizacion y seguimiento de familias afectadas por desastres.

Levantamiento y seguimiento de familias afectadas por el sismo en **Sevilla, Valle del Cauca**
(casco urbano y zona veredal). El objetivo no es solo contar damnificados: es caracterizar,
remitir a la entidad competente con numero de radicado y hacer seguimiento hasta la
reconstruccion.

## Para quien llega a colaborar

Lea primero **[docs/ESTADO.md](docs/ESTADO.md)**: objetivo, decisiones tomadas, que
funciona hoy y que falta.

Luego **[docs/FRENTES.md](docs/FRENTES.md)**: ocho frentes de trabajo que avanzan en
paralelo sin pisarse, con lo que toca cada uno y por donde empezar hoy.

Y **[docs/ROLES-Y-ESFUERZO.md](docs/ROLES-Y-ESFUERZO.md)**: quien responde por que,
cuanto cuesta cada frente y en que orden se hace.

Las decisiones de arquitectura ya tomadas viven en **[docs/adr/](docs/adr/)**. Antes de
reabrir una, lea el registro correspondiente.

## Principio de arquitectura

**Una sola base de datos, tres reportes.** No existen BD separadas para rural, urbano y
convenio. Existe un registro unico de HOGARES con marcadores (`zona`, `afiliacion`,
`aplica_convenio`) y los entregables a cada entidad son filtros sobre esa base.

Razon: una familia rural afiliada a la federacion entraria en dos listados y los totales no
cuadrarian al compararlos entre entidades. El total consolidado es la palanca de negociacion;
si no cuadra, se pierde.

## Unidad de registro

La unidad es el **hogar**, no la vivienda. Un inmueble puede alojar varias familias y cada una
se registra por separado. Los arrendatarios e inquilinos se registran (aplican a subsidio de
arriendo). Las familias no afiliadas a ninguna organizacion se registran.

## Estructura

```
raiz/
  frontend/          Angular 21 PWA. Captura offline, mapa y tablero.
  supabase/          Esquema PostgreSQL, politicas RLS, vistas y carga desde Kobo.
  docs/              Protocolo operativo, plantillas de campo, formulario XLSForm.
```

## Estado por fases

| Fase | Alcance | Estado |
|------|---------|--------|
| 0 | Captura con KoboToolbox + tablero estatico. Costo 0, operativo en horas. | En operacion |
| 1 | PWA propia con captura offline, cola de sincronizacion, fotos y GPS. | En construccion |
| 2 | Supabase como sistema de registro. Remisiones, radicados, ayudas y seguimiento. | Esquema listo |
| 3 | Backend propio y despliegue en infraestructura administrada. | No iniciada |

La fase 0 corre en paralelo y **no se detiene** mientras se construye la fase 1. Las columnas
de PostgreSQL replican los nombres de campo del XLSForm, de modo que migrar de Kobo a la base
propia es una carga, no una reescritura.

## Proteccion de datos

Datos personales y sensibles de poblacion vulnerable, sujetos a la Ley 1581 de 2012.

- Autorizacion previa obligatoria. Sin autorizacion se registra el caso agregado, sin
  identidad ni fotografias.
- La version nominal se comparte unicamente con la entidad destinataria, por canal formal.
- Toda vista publica es agregada, sin identidad, y con la coordenada redondeada a tres
  decimales (~110 m) para no señalar la vivienda de una familia.
- RLS activo desde el primer despliegue. Los lideres solo ven lo que ellos reportaron.

## Requisitos

- Node ^20.19 o ^22.12 (probado en 22.14). Angular CLI 21.
- Cuenta gratuita de Supabase para la fase 2.

## Puesta en marcha

```bash
cd frontend
npm install
npm start      # desarrollo en http://localhost:4200
npm run servir # compila y sirve en 4300 PARA PROBAR EL MODO SIN CONEXION
```

`npm start` NO activa el service worker, asi que ahi no se puede verificar el modo sin
conexion. Guia completa en **[docs/DESARROLLO.md](docs/DESARROLLO.md)**.
