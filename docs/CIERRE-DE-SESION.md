# Cerrar una sesión de trabajo

Lista corta de lo que se apaga al terminar, lo que se queda encendido y por qué.

Existe por una razón concreta: **esto lo paga una persona de su bolsillo.** Un
túnel olvidado, un entorno local corriendo o una tarea de prueba en la nube no
rompen nada — simplemente cobran. Y lo segundo que hace esta lista es igual de
importante: comprobar que no quedaron datos inventados en la base real.

---

## 1. Lo que se apaga

```sh
# El túnel a la base, si se levantó para mirar registros
raiz/entorno/aws/tunel-a-la-base.sh --apagar     # ~0,64 USD/mes: sólo el disco
raiz/entorno/aws/tunel-a-la-base.sh --destruir   # 0 USD: no queda nada

# El entorno local: PostgreSQL, LocalStack y Cognito
cd raiz/entorno && make abajo        # conserva los datos
cd raiz/entorno && make limpio       # los borra (obligatorio si cambió el esquema)

# La API corriendo en la máquina, si se arrancó a mano
pkill -f "node api/dist/main.js"
```

El túnel **se apaga solo** a los quince minutos sin sesión, así que olvidarlo
cuesta un cuarto de hora de cómputo. Aun así conviene mirarlo:

```sh
raiz/entorno/aws/tunel-a-la-base.sh --estado
```

---

## 2. Lo que se queda encendido, a propósito

| Pieza | Por qué no se apaga | Estimado |
|---|---|---|
| RDS `raiz-base` | Es el padrón. Tiene protección contra borrado | ~13 USD/mes |
| Balanceador | Le da nombre y TLS a la API; apagarlo tumba `api.apoyo-colombia.com` | ~17 USD/mes |
| Fargate, una réplica | La API. Media hora caída es media jornada de un voluntario | ~9 USD/mes |
| CloudFront + S3 | La PWA y las fotografías. Se paga por uso, no por hora | centavos |
| Cognito | Sin él nadie entra | gratis en este volumen |

Cifras de lista, para dar orden de magnitud. **El gasto real se mira así**, y
tarda hasta un día en reflejarse:

```sh
aws ce get-cost-and-usage --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE --output table
```

Hay un presupuesto de 50 USD/mes con cuatro avisos, configurado **antes** del
primer recurso. Si llega un aviso, la respuesta no es subir el presupuesto: es
mirar qué cambió.

---

## 3. Higiene: que no queden datos de prueba en producción

Probar contra la nube deja casos inventados en la base real. **El padrón no debe
empezar con datos que nadie levantó en una vereda**, y un caso de prueba suma en
los totales que sustentan una petición ante una entidad.

Lo que dejan las pruebas se reconoce por el registrador:

```sql
select codigo, registrador_nombre, creado_en from familias order by creado_en;
delete from familias where registrador_nombre like 'Prueba%';   -- arrastra fotos y viviendas
```

`entorno/pruebas/ciclo-api.mjs` firma sus casos como `Prueba de ciclo (API)` e
imprime al final los identificadores que creó, justamente para esto.

Y en el almacenamiento, que no queden bloques sueltos de subidas que nadie cerró:

```sh
aws s3api list-objects-v2 --bucket raiz-fotos-<cuenta> --prefix partes/ \
  --query 'length(Contents)' --output text
```

Debe dar `0` o `None`. Si hay bloques, son de una subida interrumpida; el ciclo de
vida del bucket los barre a los siete días.

---

## 4. Dejar el trabajo donde se pueda retomar

- **Rama y propuesta de cambio.** Nada se trabaja sobre `main`: el servidor la
  rechaza. Si la rama quedó a medias, un commit que diga qué falta vale más que
  un directorio limpio.
- **El tablero.** Si se cerró una historia, marcarla; si se tomó, asignarla. Las
  herramientas viven fuera del repositorio, en `herramientas/backlog/`.
- **Lo que se aprendió.** Un defecto que costó una hora encontrar y una línea
  arreglar merece dos frases en el commit o en `docs/hallazgos-revision.md`. Los
  tres peores de esta semana —el service worker con la política vieja, el `Blob`
  que iPhone no deja volver a guardar, y `s3:ListBucket` decidiendo si un objeto
  ausente responde 403 o 404— no se deducen leyendo el código.

---

## 5. Volver a empezar

```sh
cd raiz/entorno && make arriba                    # base, S3 y Cognito locales
cd raiz && npm run dev:api                        # la API contra el entorno local
cd raiz/frontend && npm start                     # la PWA en el 4200
raiz/entorno/aws/tunel-a-la-base.sh --abrir       # sólo si hay que mirar producción
```

Levantar el entorno local no requiere credenciales de AWS ni tocar nada
compartido. Esa propiedad es la que hace viable el proyecto con gente que aporta
dos horas a la semana, y conviene no romperla.
