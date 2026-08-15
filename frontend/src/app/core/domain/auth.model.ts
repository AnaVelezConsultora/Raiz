import { InjectionToken } from '@angular/core';
import { Rol } from './enums';

/**
 * Identidad y control de acceso.
 *
 * DECISION DE DISENO CRITICA PARA CAMPO: iniciar sesion requiere conexion, pero
 * CAPTURAR NO. Un voluntario que inicio sesion en el casco urbano y sube a una
 * vereda debe poder registrar familias aunque su token haya expirado; lo unico que
 * exige sesion valida es SINCRONIZAR. Si se exigiera sesion viva para capturar, el
 * primer voluntario cuyo token caduque en el monte pierde la jornada completa.
 *
 * @version 0.1.0
 */

/** Perfil de aplicacion del usuario. Vive en la tabla `perfiles`. */
export interface PerfilUsuario {
  id: string;
  nombre: string;
  rol: Rol;
  organizacionId: number | null;
  telefono: string | null;
  activo: boolean;
}

/** Sesion tal como se conserva en el dispositivo. */
export interface Sesion {
  perfil: PerfilUsuario;
  correo: string;
  /** Momento en que expira el token, en ISO. Puede estar vencido y la sesion sigue sirviendo para capturar. */
  expiraEn: string | null;
  /** Ultima vez que el servidor confirmo esta sesion. */
  validadaEn: string;
}

/** Credenciales de inicio de sesion. */
export interface CredencialesAcceso {
  correo: string;
  clave: string;
}

/** Resultado de un intento de autenticacion. */
export interface ResultadoAcceso {
  exito: boolean;
  sesion?: Sesion;
  error?: string;
  /** True cuando el fallo fue de red y no de credenciales. */
  sinConexion: boolean;
}

/**
 * Un voluntario visto por la custodia de datos.
 *
 * Trae lo que el perfil no le muestra al propio usuario y la custodia si necesita para
 * decidir: el correo y desde cuando tiene cuenta.
 */
export interface PerfilAdministrable extends PerfilUsuario {
  correo: string;
  creadoEn: string;
}

/** Cambio que la custodia aplica sobre un voluntario. */
export interface CambioPerfil {
  activo?: boolean;
  rol?: Rol;
}

/** Puerto de autenticacion. Lo implementa el adaptador contra la API propia. */
export interface AuthPort {
  iniciarSesion(credenciales: CredencialesAcceso): Promise<ResultadoAcceso>;

  /**
   * Voluntarios que la custodia puede administrar.
   *
   * CONTRATO CON LA API: `GET /perfiles`, restringida a la custodia POR EL SERVIDOR.
   * Que la pantalla solo se le muestre a ella es comodidad; lo que protege el dato es
   * la politica de acceso por fila, no la ruta del navegador.
   *
   * @param soloInactivos true para traer unicamente las cuentas sin acceso.
   */
  listarVoluntarios(soloInactivos?: boolean): Promise<PerfilAdministrable[]>;

  /**
   * Activa, desactiva o cambia el rol de un voluntario.
   *
   * CONTRATO CON LA API: `PATCH /perfiles/:id` con { activo?, rol? }.
   *
   * Desactivar NO borra los casos que la persona levanto: la familia sigue contada y
   * el registro conserva quien lo reporto. Retirar a alguien del equipo no puede
   * borrar el trabajo hecho ni romper la trazabilidad.
   */
  cambiarVoluntario(id: string, cambio: CambioPerfil): Promise<PerfilAdministrable>;
  cerrarSesion(): Promise<void>;
  /** Sesion vigente segun el servidor. Null si no hay o si no se pudo consultar. */
  sesionActual(): Promise<Sesion | null>;
  /** True si el token esta vigente. Requiere conexion. */
  tokenVigente(): Promise<boolean>;
  /**
   * True si el servidor respondio algo, sin importar que.
   *
   * Separa "el servidor dice que usted ya no tiene sesion" de "no alcance el
   * servidor". Sin esta distincion, un corte de red expulsaria al voluntario en
   * plena vereda, que es exactamente lo que no puede pasar.
   */
  servidorDisponible(): Promise<boolean>;
}

export const AUTH = new InjectionToken<AuthPort>('AUTH');

/**
 * Permisos derivados del rol. Se declaran una sola vez para que ninguna pantalla
 * invente su propia regla.
 *
 * ADVERTENCIA: esto es para la interfaz, no es seguridad. La seguridad real son las
 * politicas de acceso por fila en PostgreSQL. Ocultar un boton no protege un dato.
 */
export interface Permisos {
  verTodosLosCasos: boolean;
  verSoloLoPropio: boolean;
  editarCasos: boolean;
  verificarCasos: boolean;
  exportarDatos: boolean;
  gestionarRemisiones: boolean;
  administrarUsuarios: boolean;
}

const MESA: readonly Rol[] = [Rol.Coordinador, Rol.Custodio, Rol.Validador];

/** Calcula los permisos de un rol. Funcion pura, trivial de probar. */
export function permisosDe(rol: Rol): Permisos {
  return {
    verTodosLosCasos: MESA.includes(rol),
    verSoloLoPropio: rol === Rol.Lider || rol === Rol.Digitador,
    // Todo rol puede editar lo que captura: hasta el lider corrige su propio registro.
    editarCasos: true,
    verificarCasos: rol === Rol.Coordinador || rol === Rol.Validador,
    exportarDatos: rol === Rol.Coordinador || rol === Rol.Custodio,
    gestionarRemisiones: rol === Rol.Coordinador,
    administrarUsuarios: rol === Rol.Custodio
  };
}
