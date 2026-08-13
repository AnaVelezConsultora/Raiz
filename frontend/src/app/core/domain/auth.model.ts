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

/** Puerto de autenticacion. Lo implementa el adaptador de Supabase. */
export interface AuthPort {
  iniciarSesion(credenciales: CredencialesAcceso): Promise<ResultadoAcceso>;
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
