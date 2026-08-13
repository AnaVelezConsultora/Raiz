import { Routes } from '@angular/router';

/**
 * Rutas de SIRCA.
 *
 * Todas con carga diferida: el primer arranque en campo descarga solo lo necesario
 * para ver la lista, y el formulario se descarga al abrirlo. Con el service worker
 * activo, a partir de la segunda apertura todo queda en cache y la aplicacion abre
 * sin conexion.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'casos' },
  {
    path: 'casos',
    title: 'Casos · SIRCA',
    loadComponent: () =>
      import('./features/casos/lista-casos.component').then((m) => m.ListaCasosComponent)
  },
  {
    path: 'nuevo',
    title: 'Nuevo caso · SIRCA',
    loadComponent: () =>
      import('./features/formulario/formulario-caso.component').then(
        (m) => m.FormularioCasoComponent
      )
  },
  {
    path: 'caso/:id',
    title: 'Caso · SIRCA',
    loadComponent: () =>
      import('./features/formulario/formulario-caso.component').then(
        (m) => m.FormularioCasoComponent
      )
  },
  { path: '**', redirectTo: 'casos' }
];
