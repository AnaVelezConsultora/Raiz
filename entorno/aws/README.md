# Infraestructura de Raíz en AWS

Guiones que levantan y mantienen lo que corre en la nube. **Todos son
idempotentes**: correr cualquiera dos veces deja lo mismo que correrlo una.

Esto es plataforma, no desarrollo. Quien programa la PWA o la API **no necesita
nada de aquí**: `entorno/` levanta todo en su máquina con un comando y el ciclo de
trabajo no depende de que exista infraestructura desplegada. Es la regla del
[ADR 004](../../docs/adr/004-modelo-de-entrega.md), y el día que deje de ser cierta
se rompió lo que hace viable el proyecto con voluntarios de dos horas semanales.

## Orden

Desde cero, en este orden. Cada guion escribe lo que el siguiente necesita en
`entorno/generado/`, que **no se versiona**.

| # | Guion | Qué deja | Tarda |
|---|---|---|---|
| 1 | `desplegar-presupuesto.sh <correo>` | Alerta de 50 USD/mes con cuatro avisos | segundos |
| 2 | `desplegar-cognito.sh` | Pool de usuarios y cliente de la PWA | segundos |
| 3 | `desplegar-red.sh` | VPC, subredes, grupos de seguridad | ~1 min |
| 4 | `desplegar-base.sh` | RDS PostgreSQL 16 | **8 a 12 min** |
| 5 | `desplegar-cluster.sh` | Clúster de ECS, roles de IAM, registros | segundos |
| 6 | `aplicar-migraciones.sh` | El esquema, desde dentro de la VPC | ~2 min |
| 7 | `publicar-api.sh` | La imagen de la API en ECR | ~2 min |
| 8 | `desplegar-api.sh` | El servicio en Fargate y el balanceador | ~4 min |
| 9 | `desplegar-tls.sh` | Certificado, redirección y `api.apoyo-colombia.com` | ~1 min |
| 10 | `crear-custodio.sh <correo> <nombre>` | El primer custodio | ~1 min |
| 11 | `desplegar-identidad-federada.sh` | Rol del pipeline sin llaves, y rol de solo lectura de registros | segundos |
| 12 | `desplegar-front.sh` | Bucket privado, CloudFront y DNS de `apoyo-colombia.com` | **5 a 15 min** |
| 13 | `publicar-front.sh` | La PWA compilada, subida e invalidada | ~2 min |

**El presupuesto va primero y no es formalismo.** AWS evalúa un presupuesto desde
que existe, así que una alerta configurada el martes no dice nada de lo que se
gastó el lunes. RDS y el balanceador facturan por hora, haya tráfico o no.

## El ciclo normal, ya desplegado

Publicar una versión nueva de la API son dos pasos, y están separados a propósito:

```sh
./publicar-api.sh     # construye y sube la imagen
./desplegar-api.sh    # despliega ESA imagen
```

El ADR 004 pide que la promoción **no reconstruya**: lo aprobado tiene que ser byte
por byte lo que entra a producción. Un guion que construyera y desplegara de un
solo gesto haría imposible cumplirlo.

Si el cambio toca el esquema, `aplicar-migraciones.sh` va **antes** que
`desplegar-api.sh`: la versión nueva no debe recibir tráfico contra una base sin
migrar.

## Dos cosas que conviene no reabrir por error

**Sin puerta de enlace NAT.** Cuesta ~32 USD/mes por existir, sobre un presupuesto
de 50. Los endpoints de interfaz, que parecen la alternativa obvia, son cuatro a
~7,3 USD: se cambia una trampa por otra. La tarea va en subred pública con IP
pública, y quien decide qué entra es el grupo de seguridad, no la subred.

**La base no recibe tráfico público.** Vive en subredes sin ruta a internet y su
grupo de seguridad solo acepta al de la API — por grupo y no por rango, porque una
tarea cambia de IP al reciclarse y el grupo no. Por eso el esquema lo carga una
tarea efímera adentro: abrirla «un rato» es la puerta que después nadie cierra.

## Desplegar sin llaves

`desplegar-identidad-federada.sh` deja montado lo que el flujo
[`.github/workflows/desplegar.yml`](../../.github/workflows/desplegar.yml) necesita:
GitHub firma un token que dice de qué rama viene, AWS lo verifica y entrega
credenciales de una hora. **No hay que crear ningún secreto en GitHub.** Si alguien
agrega un `AWS_ACCESS_KEY_ID` a la configuración del repositorio, está deshaciendo
esto.

La confianza está acotada a `refs/heads/main` con `StringEquals`, no con comodín.
Sin esa acotación, cualquiera que abra una propuesta de cambio con el flujo
modificado desplegaría a producción — y abrir una propuesta puede hacerlo quien
sea. Por eso el flujo de verificación no pide `id-token` siquiera: las propuestas
compilan y construyen las imágenes, y no tocan la nube.

El pipeline **no puede** crear ni borrar red, base, roles ni leer secretos. Esa
clase de cambio la hace una persona. Un pipeline que puede borrar la base es un
pipeline que un día la borra.

**Queda una llave de larga vida viva**: la del usuario que corrió todo esto por
primera vez. Retirarla es el último paso, y va después de comprobar que el
pipeline despliega solo. Es la deuda [D3](../../docs/DEUDA-TECNICA.md), la de mayor
riesgo abierta.

## La protección contra borrado

La instancia la tiene activa. Es una decisión de quien responde por el proyecto:
esto atiende una emergencia humanitaria, y un borrado accidental no cuesta una
tarde sino el padrón de familias ya caracterizadas.

El precio es que `delete-db-instance` falla. Para destruir el entorno de verdad hay
que apagarla a propósito primero:

```sh
aws rds modify-db-instance --db-instance-identifier raiz-base \
  --no-deletion-protection --apply-immediately
```

Ese paso extra **es** la protección. `desplegar-base.sh` la vuelve a activar en cada
corrida, porque lo que pasa después de una destrucción es que nadie se acuerda de
encenderla otra vez.

## Lo que falta

Está en [DEUDA-TECNICA.md](../../docs/DEUDA-TECNICA.md), cada entrada con la
condición escrita que obliga a pagarla. En resumen: la llave de larga vida (D3, la
urgente), el certificado de RDS sin validar (D1), las claves sin rotación
automática (D2) y estos guiones sin código declarativo detrás (D4).

## El front

`desplegar-front.sh` se corre una vez; `publicar-front.sh` en cada entrega. Igual
que con la API, construir y publicar están separados.

**El bucket no es público** — lleva los cuatro bloqueos y solo lo lee CloudFront,
identificándose con un control de acceso de origen. No es por rendimiento: sobre un
bucket público no se pueden poner las cabeceras que esta aplicación necesita, y la
distribución solo sirve de algo si el bucket no se puede saltar.

**Dos políticas de caché, y la del service worker es la que importa.** Los paquetes
llevan hash en el nombre y se guardan un año. `index.html`, `ngsw.json` y
`ngsw-worker.js` van con `no-store`: si un punto de presencia guarda un `ngsw.json`
viejo, el dispositivo del voluntario se queda en una versión anterior y **no hay
forma de corregir un error en campo** sin que desinstale. Por eso la política de
caché de la distribución tiene `MinTTL 0` — para que ese `no-store` sea de verdad y
no una sugerencia.

**El orden de subida no es arbitrario.** Primero lo que lleva hash, después el
index. Al revés habría unos segundos con un index nuevo apuntando a paquetes que no
existen todavía, y quien abra la aplicación en esa ventana recibe una página rota.
Son segundos y casi nunca se notaría — «casi nunca» es la clase de fallo que
aparece el día de la jornada.

**403 y 404 devuelven `index.html` con código 200.** Angular resuelve las rutas en
el navegador; sin esto, recargar en `/casos` da error, y en campo eso se lee como
«la aplicación se dañó». Se atienden los dos códigos porque con el control de
acceso de origen S3 responde 403 —y no 404— a una clave que no existe.

**Este es el único sitio publicado.** Netlify se retiró el 15 de agosto de 2026;
queda en los registros preliminares de la solución y nada más. La consecuencia está
anotada como deuda [D5](../../docs/DEUDA-TECNICA.md): con Netlify se van las vistas
previas por propuesta de cambio, que es lo que permitía a alguien de F6 abrir un
enlace en su Android y probar antes del merge.

## El primer custodio

`POST /voluntarios` exige que quien pide sea custodio, así que nadie puede crear al
primero. `crear-custodio.sh` es ese eslabón y se usa **una vez por despliegue**;
del segundo voluntario en adelante todo pasa por la API y queda registrado con el
nombre de quien lo dio de alta.
