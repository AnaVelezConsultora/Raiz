# Raíz — Levantarlo en local

Guía para correr el proyecto en su máquina. Toma unos cinco minutos.

---

## Requisitos

| | |
|---|---|
| Node | 20.19 o 22.12 en adelante. Probado en 22.14 |
| npm | Viene con Node |
| Git | Cualquier versión reciente |

Verifique antes de empezar:

```bash
node --version
npm --version
git --version
```

Si Node es más viejo, actualícelo. Angular 21 no arranca por debajo de esas versiones.

---

## Levantarlo

```bash
git clone https://github.com/anavelezconsultoria/raiz.git
cd raiz/frontend
npm install
npm start
```

Abre en <http://localhost:4200>.

La primera instalación baja bastante; las siguientes son rápidas.

---

## La trampa: `npm start` NO prueba el modo sin conexión

En desarrollo, el service worker viene **desactivado a propósito** — si no, cada cambio
de código quedaría atrapado en caché y volvería loco a cualquiera.

Consecuencia: con `npm start` usted **no puede verificar lo que hace útil a Raíz**. Si
apaga la red ahí, la aplicación se cae, y eso es un falso negativo.

Para probar el modo sin conexión de verdad:

```bash
npm run servir
```

Compila y sirve el resultado en <http://localhost:4300>, reproduciendo lo que hace
la distribución de CloudFront que sirve la aplicación publicada: reserva de ruta para
que `/casos` funcione al recargar, y service worker sin caché para que no se quede
pegada una versión vieja.

### Cómo comprobar que funciona sin conexión

1. `npm run servir` y abra <http://localhost:4300>
2. Registre un caso completo y guárdelo
3. **F12 → pestaña Network → marque Offline**
4. Recargue la página

La aplicación debe abrir igual, la barra superior debe decir **SIN CONEXION**, y el
caso debe seguir ahí. Si eso pasa, el núcleo está funcionando.

---

## Verificar antes de subir un cambio

```bash
npm run verificar
```

Corre el chequeo de tipos y la compilación. Si eso pasa, no rompió nada obvio.

---

## Notas prácticas

**GPS y cámara solo funcionan en sitio seguro.** `localhost` cuenta como seguro, así
que en su máquina funcionan. Desde otro dispositivo por dirección IP **no**: el
navegador los bloquea sin HTTPS. Para probar en un celular real hay que usar la versión
publicada.

**Los datos viven en su navegador.** Cada perfil de navegador tiene su propia base
local. Para empezar de cero: F12 → Application → Storage → Clear site data.

**Sin Supabase configurado, la aplicación corre en modo local.** No hace falta servidor
para desarrollar la captura: todo se guarda en el dispositivo. La configuración vive en
`src/environments/environment.ts` y por defecto está vacía a propósito.

**No ponga la carpeta dentro de una nube sincronizada.** `node_modules` son decenas de
miles de archivos y la sincronización se vuelve un problema.

---

## Estructura, para ubicarse

```
frontend/src/app/
  core/domain/      Tipos, enums y puertos. No depende de nada
  core/infra/       Implementa los puertos: IndexedDB, Supabase
  core/services/    Sincronización, GPS, fotos, sesión
  core/guards/      Guardas de ruta
  features/         Formulario, listado, acceso
  shared/           Componentes reutilizables
```

Las capas se comunican por interfaces que se enlazan en `app.config.ts`. Ese es el
único archivo que sabe qué implementación concreta se usa.

---

## Convenciones

- Nunca el tipo `any`. Interfaces explícitas
- Montos en enteros de centavos, jamás en punto flotante
- Métodos pequeños, una responsabilidad cada uno
- Nunca datos reales de familias en desarrollo. Datos inventados siempre
- Las decisiones técnicas se documentan en el repositorio, no solo en el chat

---

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| `ng: command not found` | Use `npx ng` o los scripts de npm |
| Error de versión de Node al instalar | Node por debajo del mínimo |
| Apago la red y la app se cae | Está en `npm start`. Use `npm run servir` |
| Un cambio no aparece | Service worker con versión vieja: F12 → Application → Service Workers → Unregister |
| No pide permiso de ubicación | No está en `localhost` ni en HTTPS |

Si se queda atascado, escriba en el grupo con el mensaje de error completo. Es más
rápido que dar vueltas solo.
