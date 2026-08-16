# Raíz — Frentes de trabajo

Guía de incorporación técnica. Sevilla, Valle del Cauca.

Ocho frentes que avanzan en paralelo sin pisarse. Cada uno toca carpetas distintas,
tiene una entrada clara y se puede tomar sin conocer el resto del sistema.
**Escoja uno y avise cuál toma.**

---

## El objetivo

Caracterizar a cada familia afectada **una sola vez**, con datos que la entidad
competente pueda usar, y acompañar cada caso hasta que alguien responda por él.

1. **Remitir.** Entregar a cada entidad el reporte que le corresponde, con radicado.
2. **Hacer seguimiento.** Saber qué pasó con cada familia: si fue verificada, a quién
   se remitió, qué respondieron y cuántos días lleva sin respuesta.
3. **Ser puente.** Dejar la caracterización lista para que la cooperación
   internacional actúe sin volver a levantar información.

> **La restricción que define todo el diseño:** no hay capacidad de ir al terreno y en
> la zona veredal no hay señal. Quien captura es un líder que ya vive allá, con el
> celular que ya tiene. Por eso la aplicación funciona sin conexión y sincroniza
> después. Cualquier decisión técnica que rompa eso está mal, por elegante que sea.

---

## Cómo está armado

| Capa | Qué contiene | Dónde |
|---|---|---|
| Dominio | Tipos, enums y puertos. No depende de nada. | `core/domain/` |
| Infraestructura | Implementa los puertos: IndexedDB con Dexie, transporte a Supabase. | `core/infra/` |
| Servicios | Cola de sincronización, GPS, compresión de fotos, construcción de casos. | `core/services/` |
| Funcionalidades | Formulario por pasos y listado de casos. | `features/` |

Las capas se comunican por interfaces (`CasoStoragePort`, `FotoStoragePort`,
`SincronizacionPort`) que se enlazan en un solo archivo, `app.config.ts`. Reemplazar
Supabase por un backend propio es cambiar una línea ahí; ningún componente se entera.

**Regla de convivencia:** cada frente toca carpetas distintas. Si dos frentes
necesitan el mismo archivo, avísenlo en el grupo antes de empezar, no después del
conflicto.

---

## Los ocho frentes

### F1 · Captura offline — FUNCIONANDO

El núcleo: guardar caso, fotos y coordenada en el dispositivo sin conexión, con
guardado incremental paso a paso. Está probado en navegador real con la red apagada.
Se mantiene, no se reescribe.

- **Toca:** `core/domain/`, `core/infra/`, `core/services/`
- **Perfil:** Angular, IndexedDB

### F2 · Identidad y acceso — CÓDIGO LISTO, FALTA EL SERVIDOR

Autenticación con cinco roles: coordinador, custodio, validador, digitador y líder.
El líder solo ve lo que él mismo reportó; el digitador carga pero no exporta.

Ya construido: puerto `AuthPort` y adaptador de Supabase, `SesionService` con estado
por señales, guardas de ruta, pantalla de acceso, disparador que crea el perfil al dar
de alta un usuario, y permisos derivados del rol en una función pura.

**La regla que gobierna esta capa:** iniciar sesión requiere conexión, capturar no. Un
voluntario que entró en el casco urbano y subió a una vereda sigue registrando aunque
su token haya expirado; lo único que exige sesión vigente es sincronizar. Sin esa
regla, el primer token que caduca en el monte cuesta una jornada completa de trabajo.

Falta: crear el proyecto en Supabase, correr el esquema, dar de alta a los voluntarios
y asignarles rol. **Hasta que eso pase la base central no se conecta.** Una URL pública
contra una base con datos nominales y sin políticas activas expone el censo completo.

- **Toca:** `core/domain/auth.model.ts`, `core/infra/supabase-auth.adapter.ts`,
  `core/services/sesion.service.ts`, `core/guards/`, `features/auth/`
- **No toca:** el formulario ni el listado
- **Perfil:** Supabase, PostgreSQL, administración de accesos
- **Tamaño:** lo que queda es operativo · 1 persona

### F3 · Sincronización y servidor — ABIERTO

Levantar el proyecto en Supabase, correr el esquema, y terminar el adaptador de
transporte: subida de fotos a almacenamiento y carga idempotente por `origen_id`. La
lógica de la cola ya está: envía casos antes que fotos, prioridad de riesgo de vida
primero, secuencial, y se detiene si se cae la red.

- **Toca:** `core/infra/supabase-sync.adapter.ts`, `supabase/`
- **Depende de:** F2
- **Perfil:** PostgreSQL, APIs
- **Tamaño:** mediano · 1 o 2 personas

### F4 · Vistas de consulta — ABIERTO

Contadores, filtros y mapa **dentro de la aplicación que ya existe**, como módulos
junto a casos y voluntarios. Con sesión y con roles: cada quien ve lo que le
corresponde, y lo garantizan las políticas por fila, no la pantalla.

Son dos audiencias y conviene no fusionarlas:

- **La mesa** —coordinación, custodia, quien destina recursos— necesita el conjunto:
  listado, cifras, mapa y la fotografía del daño para sustentar una remisión.
- **El líder** necesita lo suyo: hoy la lista se llama «Casos en este celular» y es
  literal, así que quien cambia de teléfono pierde de vista su propio trabajo aunque
  el servidor lo tenga entero.

**El tablero estático de `tablero/` no es parte de esto y no se despliega.** Es una
herramienta de reunión: se abre desde el disco, sin servidor. Publicar algo sin sesión
exige antes la decisión HU 2.1.1, que sigue abierta.

No toca la captura en absoluto: se puede construir en paralelo, incluso con los datos
de ejemplo del entorno local.

- **Toca:** `features/` (módulos nuevos) y rutas de consulta en la API
- **No toca:** el formulario ni la cola de sincronización
- **Perfil:** Angular, Leaflet, visualización de datos
- **Tamaño:** mediano · 1 o 2 personas

### F5 · Remisiones y seguimiento — ABIERTO

El diferenciador del proyecto. Registrar a qué entidad se remitió cada familia, con
qué número de radicado, qué respondieron y cuántos días llevan sin responder. Las
tablas y las vistas ya están en el esquema; falta la interfaz de la mesa.

Sin este frente, Raíz es una base de datos más. Con él, es un instrumento de
exigibilidad.

- **Toca:** `features/remisiones/` (nuevo)
- **Depende de:** F2
- **Perfil:** Angular, modelado de procesos
- **Tamaño:** grande · 2 personas

### F6 · Calidad y prueba en campo — EMPIEZA HOY

Instalar Raíz en celulares reales, de gama baja y con poca memoria, ponerlos en modo
avión y registrar casos de prueba. Reportar todo lo que incomode: un botón que no se
alcanza con el pulgar, un texto ilegible bajo el sol, una pantalla que pide un dato
que la familia no sabe.

**Esta es la tarea de mayor impacto y no requiere escribir código.** Un formulario que
el voluntario abandona a mitad no produce datos, y eso no lo detecta ninguna prueba
automática.

- **Toca:** reportes en el repositorio
- **Perfil:** cualquiera con un celular Android
- **Tamaño:** pequeño y continuo · varias personas

### F7 · Datos y cumplimiento — ABIERTO

Política de tratamiento de datos, texto de autorización, tiempos de retención,
procedimiento de eliminación a solicitud de la familia, y la separación entre la
versión nominal que va a la entidad y la versión agregada que va a prensa y
presentaciones.

Son datos sensibles de población vulnerable bajo la Ley 1581 de 2012. Este frente no
es papeleo: es lo que permite que el listado sea admisible y que nadie quede expuesto.

- **Toca:** `docs/`, revisión de `supabase/schema.sql`
- **Perfil:** protección de datos. Se coordina con el equipo jurídico
- **Tamaño:** mediano · 1 persona

### F8 · Multi-municipio — ABIERTO

El modelo ya lo soporta: municipio y departamento son campos, no constantes, y las
tres bases nunca se separaron. Lo único atado a Sevilla hoy son los valores por
defecto. Falta el listado oficial de veredas por municipio, la normalización de
nombres y el despliegue por territorio.

Es lo que convierte esto en una herramienta reutilizable en vez de un proyecto de una
sola emergencia.

- **Toca:** `environments/`, catálogos, despliegue
- **Perfil:** datos geográficos, despliegue
- **Tamaño:** mediano · 1 persona

---

## Orden sugerido

| Momento | Frentes | Por qué |
|---|---|---|
| Ahora | F6 y F2 | F6 no depende de nada y da información inmediata. F2 desbloquea el resto. |
| En paralelo | F4 y F7 | No tocan el núcleo. Se pueden hacer con datos de prueba. |
| Cuando F2 esté | F3 y F5 | Necesitan identidad y roles para tener sentido. |
| Después | F8 | Cuando la herramienta esté probada en un municipio. |

---

## Arrancar

```bash
git clone https://github.com/anavelezconsultoria/raiz.git
cd raiz/frontend
npm install
npm start
```

Requiere Node 20.19 o 22.12 en adelante. Angular 21.

Para probar el modo sin conexión hay que compilar (`npm run build`) y servir el
resultado, porque el service worker no se activa en desarrollo.

### Convenciones que se respetan

- Nunca el tipo `any`. Interfaces explícitas.
- Montos en enteros de centavos, jamás en punto flotante.
- Métodos pequeños, una responsabilidad cada uno.
- Las decisiones técnicas se documentan en el repositorio, no solo en el chat.

---

## Innegociable: datos de familias

- En el grupo de chat **no** se publican nombres, cédulas, teléfonos ni fotografías de
  familias afectadas.
- Para desarrollar y probar se usan datos inventados. Nunca datos reales en un entorno
  de pruebas.
- La regla de consentimiento se aplica en el borde de salida hacia el servidor, no en
  la interfaz: sin autorización de la familia, la identidad no viaja, y ninguna ruta
  de la aplicación puede saltarse esa validación.
- Toda vista pública es agregada y con la coordenada degradada. Ubica la afectación,
  no la vivienda.

---

## A quién le entregamos

El destinatario cambia según el tipo de afectación. Por eso el registro es **uno solo**
y los reportes son filtros sobre el mismo dato.

**Vivienda y emergencia, urbano y rural**
Consejo Municipal de Gestión del Riesgo de Sevilla · Alcaldía de Sevilla · Consejo
Departamental de Gestión del Riesgo del Valle · Gobernación del Valle del Cauca

**Vivienda rural, cultivos y producción**
Secretaría de Agricultura y Pesca del Valle del Cauca · Comités de reforma agraria del
departamento · Asociaciones campesinas

**Convenio de cooperación**
Federación — convenio Mónica González y cooperación catalana

**Nivel nacional y cooperación**
UNGRD · Organismos de cooperación internacional

### Pendiente de confirmar antes de radicar el primer reporte

- Nombre exacto de la dependencia responsable de vivienda urbana.
- Entidades y contactos identificados por Miguel, con nombre exacto de dependencia.
- Sigla y nombre completo de la organización internacional bajo la cual se hace la
  representación.

Un oficio dirigido a una dependencia que no existe se devuelve.

---

Documento técnico de incorporación. No contiene datos personales. El trabajo es
voluntario y el código es abierto: lo que se construya aquí debe servirle a la próxima
emergencia en otro municipio.
