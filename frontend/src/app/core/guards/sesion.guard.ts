import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Rol } from '../domain/enums';
import { SesionService } from '../services/sesion.service';

/**
 * Guardas de ruta.
 *
 * ADVERTENCIA: una guarda es comodidad de navegacion, no seguridad. Quien quiera
 * saltarsela lo hace en dos minutos desde la consola del navegador. La seguridad
 * real son las politicas de acceso por fila de PostgreSQL, que corren del lado del
 * servidor y no se pueden burlar desde el cliente.
 *
 * @version 0.1.0
 */

/**
 * Exige identidad, no token vigente.
 *
 * Un voluntario con la sesion expirada en una vereda sin senal DEBE poder entrar y
 * seguir capturando. Lo que el servidor rechazara es el envio, y de eso avisa la
 * pantalla de sincronizacion.
 *
 * Mientras la API no este configurada, la aplicacion opera en modo local y la
 * guarda deja pasar: exigir sesion contra un servidor inexistente dejaria la
 * herramienta inutilizable.
 */
export const sesionGuard: CanActivateFn = (_ruta, estado) => {
  if (!environment.apiUrl) return true;

  const sesion = inject(SesionService);
  const router = inject(Router);

  if (sesion.autenticado()) return true;

  return router.createUrlTree(['/acceso'], {
    queryParams: { volverA: estado.url }
  });
};

/** Exige uno de los roles indicados. Se compone con sesionGuard. */
export function rolGuard(...permitidos: Rol[]): CanActivateFn {
  return () => {
    if (!environment.apiUrl) return true;

    const sesion = inject(SesionService);
    const router = inject(Router);
    const rol = sesion.rol();

    if (rol !== null && permitidos.includes(rol)) return true;

    return router.createUrlTree(['/casos']);
  };
}

/** Evita que quien ya entro vuelva a ver la pantalla de acceso. */
export const invitadoGuard: CanActivateFn = () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  return sesion.autenticado() ? router.createUrlTree(['/casos']) : true;
};
