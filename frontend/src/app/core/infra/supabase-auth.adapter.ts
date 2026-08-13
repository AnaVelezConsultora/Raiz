import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import {
  AuthPort,
  CredencialesAcceso,
  PerfilUsuario,
  ResultadoAcceso,
  Sesion
} from '../domain/auth.model';
import { Rol } from '../domain/enums';

/** Fila de la tabla `perfiles`. */
interface FilaPerfil {
  id: string;
  nombre: string;
  rol: Rol;
  organizacion_id: number | null;
  telefono: string | null;
  activo: boolean;
}

/**
 * Autenticacion contra Supabase.
 *
 * Igual que el adaptador de sincronizacion, carga supabase-js bajo demanda para no
 * engordar la primera carga en campo.
 *
 * Un usuario con `activo = false` no puede entrar aunque sus credenciales sean
 * correctas: es la forma de retirar a un voluntario sin borrar los casos que
 * levanto ni romper la trazabilidad de quien reporto que.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class SupabaseAuthAdapter implements AuthPort {
  private cliente: SupabaseClient | null = null;

  async iniciarSesion(credenciales: CredencialesAcceso): Promise<ResultadoAcceso> {
    const cliente = await this.obtenerCliente();
    if (!cliente) {
      return { exito: false, error: 'El servidor no esta configurado.', sinConexion: false };
    }

    try {
      const { data, error } = await cliente.auth.signInWithPassword({
        email: credenciales.correo.trim().toLowerCase(),
        password: credenciales.clave
      });

      if (error) {
        return { exito: false, error: this.traducir(error.message), sinConexion: false };
      }

      const perfil = await this.cargarPerfil(cliente, data.user.id);
      if (!perfil) {
        await cliente.auth.signOut();
        return {
          exito: false,
          error: 'Su cuenta existe pero no tiene perfil asignado. Pida al coordinador que le asigne un rol.',
          sinConexion: false
        };
      }
      if (!perfil.activo) {
        await cliente.auth.signOut();
        return { exito: false, error: 'Su acceso esta desactivado.', sinConexion: false };
      }

      return {
        exito: true,
        sinConexion: false,
        sesion: {
          perfil,
          correo: data.user.email ?? credenciales.correo,
          expiraEn: data.session?.expires_at
            ? new Date(data.session.expires_at * 1000).toISOString()
            : null,
          validadaEn: new Date().toISOString()
        }
      };
    } catch {
      return {
        exito: false,
        error: 'No hay conexion. Conectese una vez para iniciar sesion; despues puede trabajar sin senal.',
        sinConexion: true
      };
    }
  }

  async cerrarSesion(): Promise<void> {
    const cliente = await this.obtenerCliente();
    // Sin conexion no se puede cerrar en el servidor, pero la sesion local si se
    // limpia: quien cierra sesion espera que sus datos dejen de estar a la vista.
    await cliente?.auth.signOut().catch(() => undefined);
  }

  async sesionActual(): Promise<Sesion | null> {
    const cliente = await this.obtenerCliente();
    if (!cliente) return null;

    try {
      const { data } = await cliente.auth.getSession();
      if (!data.session) return null;

      const perfil = await this.cargarPerfil(cliente, data.session.user.id);
      if (!perfil?.activo) return null;

      return {
        perfil,
        correo: data.session.user.email ?? '',
        expiraEn: data.session.expires_at
          ? new Date(data.session.expires_at * 1000).toISOString()
          : null,
        validadaEn: new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  async tokenVigente(): Promise<boolean> {
    const cliente = await this.obtenerCliente();
    if (!cliente) return false;

    try {
      const { data, error } = await cliente.auth.getUser();
      return !error && data.user !== null;
    } catch {
      return false;
    }
  }

  /**
   * Cualquier respuesta del servidor cuenta como disponible, incluso un rechazo por
   * politica de acceso: lo que se esta midiendo es si hubo red, no si hay permiso.
   */
  async servidorDisponible(): Promise<boolean> {
    const cliente = await this.obtenerCliente();
    if (!cliente) return false;

    try {
      await cliente.from('perfiles').select('id').limit(1);
      return true;
    } catch {
      return false;
    }
  }

  private async cargarPerfil(
    cliente: SupabaseClient,
    usuarioId: string
  ): Promise<PerfilUsuario | null> {
    const { data, error } = await cliente
      .from('perfiles')
      .select('id, nombre, rol, organizacion_id, telefono, activo')
      .eq('id', usuarioId)
      .maybeSingle<FilaPerfil>();

    if (error || !data) return null;

    return {
      id: data.id,
      nombre: data.nombre,
      rol: data.rol,
      organizacionId: data.organizacion_id,
      telefono: data.telefono,
      activo: data.activo
    };
  }

  private async obtenerCliente(): Promise<SupabaseClient | null> {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;
    if (this.cliente) return this.cliente;

    const { createClient } = await import('@supabase/supabase-js');
    this.cliente = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        // La sesion sobrevive al cierre del navegador: el voluntario no puede estar
        // volviendo a escribir su clave cada vez que apaga el celular.
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'raiz.sesion'
      }
    });
    return this.cliente;
  }

  /** Los mensajes de Supabase llegan en ingles y no le sirven a un voluntario. */
  private traducir(mensaje: string): string {
    if (mensaje.includes('Invalid login credentials')) {
      return 'Correo o clave incorrectos.';
    }
    if (mensaje.includes('Email not confirmed')) {
      return 'Su correo aun no esta confirmado. Revise su bandeja de entrada.';
    }
    if (mensaje.toLowerCase().includes('rate limit')) {
      return 'Demasiados intentos. Espere un minuto y vuelva a intentar.';
    }
    return 'No se pudo iniciar sesion. Intente de nuevo.';
  }
}
