import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permisos } from '../domain/auth.model';
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
 * pantalla de sincronizacion. Lo que se exige es haber entrado alguna vez en este
 * dispositivo.
 *
 * AQUI NO HAY EXCEPCION POR CONFIGURACION, y antes si la habia: cuando `apiUrl` venia
 * vacia, las tres guardas devolvian `true` y cualquiera llegaba a cualquier pantalla.
 * La intencion era poder trabajar en la interfaz sin levantar el servidor, y el precio
 * resulto ser el contrario del que se creia: la aplicacion que abre sin identificarse
 * no es la misma que se prueba, asi que una pantalla que depende de la sesion se veia
 * «funcionando» sin haberse probado nunca. Y lo que hay detras es un padron de personas
 * afectadas.
 *
 * Para trabajar sin la nube esta el entorno local —`cd entorno && make arriba`—, que da
 * un servidor de verdad con usuarios de prueba. La comodidad se resuelve levantando el
 * entorno, no abriendo la puerta.
 */
export const sesionGuard: CanActivateFn = (_ruta, estado) => {
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
    const sesion = inject(SesionService);
    const router = inject(Router);
    const rol = sesion.rol();

    if (rol !== null && permitidos.includes(rol)) return true;

    return router.createUrlTree(['/casos']);
  };
}

/**
 * Exige un PERMISO, no una lista de roles.
 *
 * `rolGuard(Custodio, Coordinador)` obliga a repetir la lista en cada ruta, y esa
 * lista se separa de la de la base el dia que alguien agrega un rol. Pidiendo el
 * permiso, la puerta es la misma que ya declara `permisosDe` en el dominio compartido
 * — y `verTodosLosCasos` es, ademas, la misma frontera que `es_mesa()` usa en las
 * politicas de PostgreSQL.
 *
 * Sigue siendo comodidad de navegacion: quien se la salte encuentra una pantalla
 * vacia, porque el servidor le responde con lo que su rol alcanza y nada mas.
 */
export function permisoGuard(permiso: keyof Permisos): CanActivateFn {
  return () => {
    const sesion = inject(SesionService);
    const router = inject(Router);
    const permisos = sesion.permisos();

    if (permisos?.[permiso]) return true;

    return router.createUrlTree(['/casos']);
  };
}

/** Evita que quien ya entro vuelva a ver la pantalla de acceso. */
export const invitadoGuard: CanActivateFn = () => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  return sesion.autenticado() ? router.createUrlTree(['/casos']) : true;
};
