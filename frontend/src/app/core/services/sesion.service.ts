import { Injectable, computed, inject, signal } from '@angular/core';
import { AUTH, CredencialesAcceso, Permisos, Sesion, permisosDe } from '../domain/auth.model';
import { Rol } from '../domain/enums';

/**
 * Estado de sesion de la aplicacion.
 *
 * LA REGLA QUE GOBIERNA ESTE SERVICIO: capturar no exige sesion viva, sincronizar si.
 *
 * La sesion se guarda en el dispositivo al iniciar sesion y sobrevive sin conexion.
 * Un voluntario que entro en el casco urbano y subio a una vereda sigue viendo su
 * nombre, su rol y sus casos aunque el token haya expirado hace horas. Lo unico que
 * el servidor rechazara es el envio, y para eso la aplicacion pide reconectar.
 *
 * Sin esta regla, el primer voluntario a quien se le venza el token en el monte
 * pierde la jornada completa de trabajo.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private static readonly CLAVE = 'raiz.sesion.local';

  private readonly auth = inject(AUTH);

  private readonly _sesion = signal<Sesion | null>(this.leerDelDispositivo());
  private readonly _cargando = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly sesion = this._sesion.asReadonly();
  readonly cargando = this._cargando.asReadonly();
  readonly error = this._error.asReadonly();

  /** Hay identidad utilizable, aunque el token este vencido. */
  readonly autenticado = computed(() => this._sesion() !== null);

  readonly nombre = computed(() => this._sesion()?.perfil.nombre ?? '');
  readonly rol = computed<Rol | null>(() => this._sesion()?.perfil.rol ?? null);

  readonly permisos = computed<Permisos | null>(() => {
    const rol = this.rol();
    return rol ? permisosDe(rol) : null;
  });

  /**
   * True cuando la sesion guardada ya expiro. No impide capturar; sirve para
   * avisar antes de sincronizar y para pedir reconexion a tiempo.
   */
  readonly tokenExpirado = computed(() => {
    const expira = this._sesion()?.expiraEn;
    return expira !== null && expira !== undefined && expira < new Date().toISOString();
  });

  async iniciarSesion(credenciales: CredencialesAcceso): Promise<boolean> {
    this._cargando.set(true);
    this._error.set(null);

    const resultado = await this.auth.iniciarSesion(credenciales);
    this._cargando.set(false);

    if (!resultado.exito || !resultado.sesion) {
      this._error.set(resultado.error ?? 'No se pudo iniciar sesion.');
      return false;
    }

    this.guardar(resultado.sesion);
    return true;
  }

  async cerrarSesion(): Promise<void> {
    await this.auth.cerrarSesion();
    this._sesion.set(null);
    localStorage.removeItem(SesionService.CLAVE);
  }

  /**
   * Revalida contra el servidor si hay conexion.
   *
   * Si no hay conexion NO se cierra la sesion: en campo eso equivaldria a expulsar
   * al voluntario justo cuando mas la necesita.
   */
  async revalidar(): Promise<void> {
    if (!navigator.onLine) return;

    const remota = await this.auth.sesionActual();
    if (remota) {
      this.guardar(remota);
      return;
    }

    // Solo se cierra si el servidor efectivamente respondio. Si no se le alcanzo,
    // la sesion local se conserva y el voluntario sigue capturando.
    if (await this.auth.servidorDisponible()) {
      await this.cerrarSesion();
    }
  }

  /** Comprueba si el envio puede proceder. Lo usa la cola de sincronizacion. */
  async puedeSincronizar(): Promise<boolean> {
    if (!this.autenticado()) return false;
    if (!navigator.onLine) return false;
    return this.auth.tokenVigente();
  }

  private guardar(sesion: Sesion): void {
    this._sesion.set(sesion);
    localStorage.setItem(SesionService.CLAVE, JSON.stringify(sesion));
  }

  private leerDelDispositivo(): Sesion | null {
    const crudo = localStorage.getItem(SesionService.CLAVE);
    if (!crudo) return null;
    try {
      return JSON.parse(crudo) as Sesion;
    } catch {
      localStorage.removeItem(SesionService.CLAVE);
      return null;
    }
  }

}
