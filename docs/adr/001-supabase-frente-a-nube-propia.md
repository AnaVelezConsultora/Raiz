# ADR 001 — Supabase frente a nube propia

Fecha: 13 de agosto de 2026
Estado: **Aceptada**

## Contexto

Se planteó si Supabase aguanta la carga esperada, o si conviene montar el backend en
AWS o GCP desde el principio. Hay un ofrecimiento de financiar la infraestructura.

La pregunta es legítima. La respuesta depende de tres cosas: cuánta carga habrá de
verdad, cuánto cuesta cada opción **en tiempo del equipo**, y qué tan caro es cambiar
de opinión después.

## Cuánta carga hay de verdad

Sevilla tiene del orden de 40.000 habitantes. Un escenario ambicioso a tres meses, ya
contando expansión a municipios vecinos:

| Magnitud | Escenario ambicioso |
|---|---|
| Familias caracterizadas | 5.000 |
| Voluntarios capturando | 100 |
| Registros en el día pico | 300 |
| Fotografías | 15.000 |

Traducido a carga sobre el servidor:

- **Escrituras en el día pico:** 300 registros más 900 fotografías, repartidos en unas
  doce horas. Son **0,03 escrituras por segundo**.
- **Filas en la base:** unas 30.000 contando tablas hijas. Decenas de megabytes.
- **Almacenamiento de fotos:** 15.000 × 200 KB comprimidos ≈ **3 GB**.
- **Lecturas:** el tablero es agregado y cacheable. Irrelevante.

Un solo PostgreSQL modesto absorbe eso sin enterarse. **La capacidad de cómputo sobra
por tres órdenes de magnitud.** No es el problema.

### Lo que sí es un límite real

El almacenamiento de fotografías. El plan gratuito da 1 GB y se agota alrededor de las
5.000 fotos. El plan de pago, unos 25 dólares al mes, da 100 GB: cubre 500.000
fotografías, muy por encima de cualquier escenario realista para este proyecto.

El otro límite del plan gratuito es que el proyecto se suspende tras una semana sin
actividad. En el plan de pago no ocurre.

**Los dos límites reales se resuelven con 25 dólares al mes.** Ninguno tiene que ver
con el rendimiento.

## El costo que no se ve

Montar esto en AWS o GCP no es pagar una factura. Es:

- Base de datos administrada y sus copias de seguridad
- Autenticación con roles
- Almacenamiento de archivos con permisos por objeto
- Una API delante de todo eso
- Infraestructura como código para poder reconstruirlo
- Integración continua
- Y alguien que responda cuando se caiga un domingo

Son semanas de trabajo de un equipo cuyos integrantes aportan **dos a cuatro horas por
semana**. Ese tiempo saldría directamente del Hito 1, que es lo único que le sirve hoy
a una familia sin techo.

Supabase entrega todo eso configurado. No porque sea mejor tecnología, sino porque el
trabajo ya está hecho.

## La propiedad que cambia el cálculo

**La aplicación funciona sin el servidor.** La captura ocurre en el dispositivo; el
backend solo recibe lo que ya está guardado.

Si Supabase se cae dos horas, ningún voluntario se entera: sigue registrando y
sincroniza después. La cola reintenta sola.

Esto significa que la disponibilidad del backend **no es crítica**, y ese es
precisamente el argumento que justificaría infraestructura propia. Aquí no aplica.

## Qué tan caro es cambiar de opinión

Barato, y a propósito.

El dominio de la aplicación depende de dos interfaces, `SincronizacionPort` y
`AuthPort`. Supabase vive detrás de ellas, en dos archivos. Sustituirlo por un backend
propio es escribir dos adaptadores nuevos y cambiar dos líneas en `app.config.ts`.
Ningún componente se entera.

Y los datos no quedan atrapados: Supabase **es** PostgreSQL. Migrar es un `pg_dump` y
restaurar donde sea.

Por eso esta decisión no hay que acertarla hoy. Hay que poder revertirla mañana, y se
puede.

## Decisión

**Supabase, plan de pago, con los puertos ya construidos como seguro.**

Se acepta el ofrecimiento de financiación y se dirige a lo que hoy sí hace falta:

| Concepto | Costo mensual |
|---|---|
| Supabase Pro | ~25 USD |
| Dominio propio | ~1 USD |
| Alojamiento del frontend | 0 |
| **Total** | **~26 USD** |

Con eso el proyecto opera meses sin tocar ningún límite.

## Cuándo se revisa

No por intuición. Se abre de nuevo esta decisión cuando ocurra **cualquiera** de estas:

1. El almacenamiento supera 80 GB.
2. Se suman más de 30 municipios o más de 3 departamentos.
3. Una entidad exige por escrito que los datos residan en Colombia.
4. Se necesitan procesos en segundo plano que las funciones de borde no cubran.
5. Se sostienen más de 50 peticiones por segundo.
6. El equipo tiene alguien con capacidad real de operar infraestructura, con turnos y
   monitoreo, no de montarla y desaparecer.

La sexta es la más importante y la que más se subestima. Infraestructura propia sin
quien la opere es peor que un servicio administrado.

## Lo que esta decisión NO dice

No dice que Supabase sea superior. Hay casos donde queda corto: cómputo pesado, colas
de trabajos complejas, escritura muy intensa, control fino de red, exigencias de
residencia de datos.

Dice que **ninguno de esos casos es el nuestro hoy**, y que gastar semanas de un equipo
voluntario resolviendo un problema que no tenemos retrasa el único hito que le importa
a una familia que está durmiendo a la intemperie.

Cuando el problema exista, la salida ya está construida.
