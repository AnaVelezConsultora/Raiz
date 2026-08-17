import { Routes } from '@angular/router';
import { invitadoGuard, permisoGuard, rolGuard, sesionGuard } from './core/guards/sesion.guard';
import { Rol } from './core/domain/enums';

/**
 * Rutas de Raíz.
 *
 * Todas con carga diferida: el primer arranque en campo descarga solo lo necesario
 * para ver la lista, y el formulario se descarga al abrirlo. Con el service worker
 * activo, a partir de la segunda apertura todo queda en cache y la aplicacion abre
 * sin conexion.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'casos' },
  {
    path: 'acceso',
    title: 'Entrar · Raíz',
    canActivate: [invitadoGuard],
    loadComponent: () =>
      import('./features/auth/acceso.component').then((m) => m.AccesoComponent)
  },
  {
    path: 'casos',
    title: 'Casos · Raíz',
    canActivate: [sesionGuard],
    loadComponent: () =>
      import('./features/casos/lista-casos.component').then((m) => m.ListaCasosComponent)
  },
  {
    path: 'nuevo',
    title: 'Nuevo caso · Raíz',
    canActivate: [sesionGuard],
    loadComponent: () =>
      import('./features/formulario/formulario-caso.component').then(
        (m) => m.FormularioCasoComponent
      )
  },
  {
    path: 'caso/:id',
    title: 'Caso · Raíz',
    canActivate: [sesionGuard],
    loadComponent: () =>
      import('./features/formulario/formulario-caso.component').then(
        (m) => m.FormularioCasoComponent
      )
  },
  {
    path: 'voluntarios',
    title: 'Voluntarios · Raíz',
    // La guarda es comodidad de navegacion. Lo que impide que otro cambie un rol es la
    // politica de acceso por fila del servidor, no esta linea.
    canActivate: [sesionGuard, rolGuard(Rol.Custodio, Rol.Coordinador)],
    loadComponent: () =>
      import('./features/admin/voluntarios.component').then((m) => m.VoluntariosComponent)
  },
  {
    path: 'tablero',
    title: 'Tablero · Raíz',
    // La puerta es un PERMISO y no una lista de roles: `verTodosLosCasos` es la misma
    // frontera que `es_mesa()` usa en las politicas de la base. Quien se salte esta
    // guarda encuentra una pantalla vacia, porque el servidor le responde con lo que su
    // rol alcanza.
    canActivate: [sesionGuard, permisoGuard('verTodosLosCasos')],
    loadComponent: () =>
      import('./features/tablero/tablero.component').then((m) => m.TableroComponent)
  },
  { path: '**', redirectTo: 'casos' }
];
