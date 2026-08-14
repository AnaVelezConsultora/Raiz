# ADR 004 — Modelo de entrega y frontera entre plataforma y desarrollo

Fecha: 13 de agosto de 2026
Estado: **Propuesta**

## El problema que resuelve

El equipo aporta **dos a cuatro horas por semana** y es voluntario. Ese dato no es
un detalle de contexto: es la restricción que decide qué modelo de entrega puede
funcionar.

Si contribuir exige entender una nube, configurar credenciales o levantar
infraestructura, el aporte efectivo de alguien con dos horas semanales es cero.
Se le van las dos horas en preparar la máquina y no llega a la segunda semana.

De ahí la regla que gobierna este documento:

> **La infraestructura no depende de quien programa.** Existe antes o en paralelo.
> Los voluntarios proponen cambios por PR y los despliegues ocurren de forma
> controlada y transparente para ellos.

## La propiedad que ya existe y hay que defender

Hoy, sin backend configurado, la aplicación **corre completa en modo local**: el
guarda de sesión deja pasar y el adaptador de transporte se apaga solo. Un
voluntario clona el repositorio, instala, arranca y captura casos sin credenciales
y sin saber que existe una nube.

Eso no es un accidente de configuración. Es lo que hace viable el proyecto y se
eleva a requisito de arquitectura:

**El ciclo de desarrollo no depende de infraestructura desplegada.** El día que
alguien necesite una cuenta en la nube para levantar la aplicación, el modelo se
rompió.

## La frontera

| Plataforma — nunca lo tocan los devs | Desarrollo — nunca toca lo otro |
|---|---|
| Infraestructura como código, cuentas, red, permisos | Código de la PWA y de la API |
| Base de datos, almacenamiento, CDN, identidad | SQL de migración |
| Secretos, rotación, copias de seguridad | Variables que su código *consume* |
| Pipelines, entornos, aprobaciones | Pruebas y empaquetado |
| Alarmas, presupuesto, respuesta a incidentes | Nada de la nube |

### El contrato de la aplicación

Lo único que un dev debe cumplir para que el despliegue le sea transparente:

1. Toda la configuración se lee de variables de entorno. Cero valores de
   infraestructura en el código.
2. El servicio escucha en el puerto que le indiquen.
3. Expone una ruta de salud y otra de disponibilidad.
4. Se empaqueta con un comando estándar, sin argumentos especiales.
5. Los cambios de esquema van como archivo numerado de migración.

Cumplido eso, la plataforma puede cambiar de motor, de región o de proveedor sin
que nadie se entere. **Los nombres de las variables son los mismos en local,
preproducción y producción; solo cambian los valores.**

## De propuesta a producción

```
PR abierto    → verificaciones · pruebas · pruebas de control de acceso
              → vista previa de la PWA con URL propia
integración   → migraciones y despliegue en preproducción · humo
promoción     → aprobación humana · LA MISMA imagen a producción
```

**La promoción no reconstruye.** Lo aprobado en preproducción es byte por byte lo
que entra a producción. Volver atrás es desplegar la etiqueta anterior.

**La vista previa por PR es solo de la PWA.** Un entorno completo por PR es caro y
no hace falta. Pero la vista previa del frontend sí, y no por los devs: es lo que
permite que alguien de **F6 abra un enlace en su Android y pruebe el cambio antes
del merge**, sin instalar nada. El frente más urgente del proyecto, que no
requiere programar, se vuelve accionable con esto.

**No todo se muda.** La PWA es estática y su despliegue actual ya funciona y ya da
vistas previas por PR. Se migra el plano de datos —API, base, almacenamiento,
identidad—; el estático se queda donde está. Es una cosa menos que construir antes
de que los devs puedan trabajar.

## Migraciones

Un archivo de esquema aplicado a mano no sobrevive a despliegues controlados. Hace
falta migraciones numeradas, aplicadas por el pipeline antes de que la versión
nueva reciba tráfico, con credenciales que ningún dev ve.

Y una regla que se deriva directamente del diseño sin conexión:

> **Nunca se puede asumir que todos los clientes están actualizados.** Un
> voluntario en una vereda puede estar corriendo la versión de la semana pasada,
> guardada por el service worker, durante días.

De ahí, tres reglas duras:

1. Migraciones aditivas. Una columna no se elimina en la misma entrega en que se
   deja de usar.
2. La API acepta cargas de clientes viejos.
3. Ningún cambio rompiente sin ventana de convivencia.

**Los catálogos no son migraciones.** El listado de veredas, las organizaciones y
las entidades destinatarias son datos que cambian sin desplegar y necesitan
pantalla de administración. Si entran como migración, cada vereda nueva se
convierte en un PR y un despliegue — y el listado oficial de veredas es
justamente uno de los pendientes que bloquean la entrega.

## Accesos

- El pipeline se autentica contra la nube con identidad federada. **Cero claves de
  larga vida** guardadas en el repositorio.
- Los devs no tienen consola de la nube. Quien necesite depurar recibe lectura de
  registros, nada más.
- **Preproducción nunca recibe datos reales.** Nada de restaurar producción en
  preproducción, nunca. La regla ya está escrita en ESTADO.md §6; aquí deja de ser
  una intención y pasa a ser una propiedad del pipeline.

## El veto del custodio se vuelve efectivo

[ROLES-Y-ESFUERZO.md](../ROLES-Y-ESFUERZO.md) le da al custodio de datos el único
veto unilateral del proyecto: puede frenar cualquier entrega que exponga
información de familias.

Hoy ese veto vive en el chat. En este modelo se ejerce donde importa: **la
aprobación de promoción a producción**. Un cambio que toque exportación nominal,
vistas públicas o políticas de acceso requiere su aprobación registrada. Un veto
que no está en el camino de la entrega no es un veto, es una opinión.

## Consecuencia sobre los roles

`ROLES-Y-ESFUERZO.md` no tiene rol de plataforma. Este modelo crea una
responsabilidad nueva y **permanente**, distinta de "dueño de F9": F9 se termina,
la plataforma se opera siempre.

Y hay una reordenación implícita: la plataforma **arranca antes** que los frentes
que dependen de ella, F3 y F5. Hoy F9 figura sin dueño y como pendiente, después
de todo lo demás.

## Cuándo se revisa

1. Un dev necesita credenciales de la nube para trabajar. Señal de que la frontera
   se rompió.
2. Un despliegue exige coordinación manual entre plataforma y desarrollo más de
   una vez.
3. La cola de PR sin revisar pasa de dos semanas: el cuello dejó de ser la
   infraestructura y pasó a ser la revisión.

## Lo que este modelo NO dice

No dice que los devs no puedan opinar sobre infraestructura, ni que la plataforma
decida sola qué se construye. Dice que **no necesitan saber de ella para aportar**,
que es distinto.

Y no promete despliegue continuo. Promete despliegue **controlado**: automático
hasta preproducción, con una persona aprobando el paso a producción, porque lo que
se despliega toca datos sensibles de familias que están durmiendo a la intemperie.
