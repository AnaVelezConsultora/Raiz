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

## Lo que falta

- **`sslmode=no-verify`** entre la API y RDS. Se cifra, no se valida la autoridad:
  el paquete de certificados de Amazon no está en la imagen. El tráfico no sale de
  la VPC, así que protege contra escucha pasiva y no contra alguien ya adentro.
- **La instancia no tiene protección contra borrado.** Es lo que permite destruirla
  y volverla a levantar, que es criterio de la HU 1.1.1. **Hay que invertirlo antes
  de que entre la primera familia real.**
- **Sin rotación automática de claves.** Rotarlas hoy es cambiar el secreto y
  volver a correr `aplicar-migraciones.sh`, que las reconcilia.
- **Nada de esto está en un pipeline.** Los guiones se corren a mano desde una
  máquina con credenciales. Es la HU 1.1.2, y hasta que exista sigue habiendo una
  llave de larga vida.

## El primer custodio

`POST /voluntarios` exige que quien pide sea custodio, así que nadie puede crear al
primero. `crear-custodio.sh` es ese eslabón y se usa **una vez por despliegue**;
del segundo voluntario en adelante todo pasa por la API y queda registrado con el
nombre de quien lo dio de alta.
