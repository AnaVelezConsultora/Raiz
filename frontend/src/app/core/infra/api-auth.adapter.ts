import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  AuthPort,
  CambioPerfil,
  CredencialesAcceso,
  DatosRegistro,
  PerfilAdministrable,
  PerfilUsuario,
  ResultadoAcceso,
  ResultadoRegistro,
  Sesion
} from '../domain/auth.model';

/** Lo que devuelve la API al abrir sesion. */
interface RespuestaSesion {
  token: string;
  /** Momento de expiracion en ISO. */
  expiraEn: string | null;
  correo: string;
  perfil: PerfilUsuario;
}

/**
 * Identidad contra la API de Raiz.
 *
 * Implementa {@link AuthPort}. La API valida las credenciales contra el proveedor de
 * identidad y devuelve un token mas el perfil ya resuelto; el navegador nunca habla con
 * el proveedor directamente.
 *
 * POR QUE EL TOKEN VIVE EN localStorage Y NO EN MEMORIA
 *
 * Porque la aplicacion tiene que sobrevivir a que el sistema operativo mate la pestana.
 * Un voluntario que inicia sesion en el casco urbano, sube a la vereda, captura seis
 * casos durante horas y baja a sincronizar no puede encontrarse con que hay que volver
 * a entrar. Guardar el token en memoria seria mas seguro en un escritorio y aqui seria
 * inservible.
 *
 * Que esto implica: quien tenga el celular desbloqueado tiene la sesion. Es un riesgo
 * aceptado y consciente, y es la razon por la que el token dura poco y por la que la
 * proteccion real son las politicas de acceso por fila del servidor, no el cliente.
 *
 * LO QUE NO SE PIERDE AL CADUCAR EL TOKEN
 *
 * La sesion guardada sirve para SEGUIR CAPTURANDO aunque el token este vencido. Solo
 * sincronizar exige token vigente. Si se exigiera sesion viva para capturar, el primer
 * voluntario cuyo token caduque en el monte pierde la jornada completa.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class ApiAuthAdapter implements AuthPort {
  private static readonly CLAVE_TOKEN = 'raiz.token';
  private static readonly CLAVE_SESION = 'raiz.sesion';
  private static readonly ESPERA_MS = 15_000;

  async iniciarSesion(credenciales: CredencialesAcceso): Promise<ResultadoAcceso> {
    if (!environment.apiUrl) {
      return { exito: false, error: 'El servidor no esta configurado.', sinConexion: false };
    }

    try {
      const r = await this.pedir('POST', '/sesion', {
        correo: credenciales.correo.trim().toLowerCase(),
        clave: credenciales.clave
      });

      if (!r.ok) {
        return { exito: false, error: await this.detalle(r), sinConexion: false };
      }

      const cuerpo = (await r.json()) as RespuestaSesion;

      if (!cuerpo.perfil.activo) {
        return { exito: false, error: 'Su acceso esta desactivado.', sinConexion: false };
      }

      const sesion: Sesion = {
        perfil: cuerpo.perfil,
        correo: cuerpo.correo,
        expiraEn: cuerpo.expiraEn,
        validadaEn: new Date().toISOString()
      };

      this.guardar(cuerpo.token, sesion);
      return { exito: true, sesion, sinConexion: false };
    } catch {
      return {
        exito: false,
        error:
          'No hay conexion. Conectese una vez para iniciar sesion; despues puede trabajar sin senal.',
        sinConexion: true
      };
    }
  }

  async registrar(datos: DatosRegistro): Promise<ResultadoRegistro> {
    if (!environment.apiUrl) {
      return {
        exito: false,
        pendienteDeActivacion: false,
        error: 'El servidor no esta configurado.',
        sinConexion: false
      };
    }

    try {
      const r = await this.pedir('POST', '/registro', {
        nombre: datos.nombre.trim(),
        correo: datos.correo.trim().toLowerCase(),
        clave: datos.clave,
        telefono: datos.telefono?.trim() || null,
        organizacion: datos.organizacion?.trim() || null
      });

      if (r.status === 409) {
        return {
          exito: false,
          pendienteDeActivacion: false,
          error: 'Ya existe una cuenta con ese correo. Intente entrar, o pida que la activen.',
          sinConexion: false
        };
      }

      if (!r.ok) {
        return {
          exito: false,
          pendienteDeActivacion: false,
          error: await this.detalle(r),
          sinConexion: false
        };
      }

      const cuerpo = (await r.json()) as { pendienteDeActivacion?: boolean };
      return {
        exito: true,
        // Si el servidor no lo dice, se asume lo mas restrictivo: que falta activar.
        pendienteDeActivacion: cuerpo.pendienteDeActivacion !== false,
        sinConexion: false
      };
    } catch {
      return {
        exito: false,
        pendienteDeActivacion: false,
        error: 'No hay conexion. Necesita senal una sola vez para crear la cuenta.',
        sinConexion: true
      };
    }
  }

  async listarVoluntarios(soloPendientes = false): Promise<PerfilAdministrable[]> {
    if (!environment.apiUrl) return [];

    const ruta = soloPendientes ? '/perfiles?estado=pendientes' : '/perfiles';
    const r = await this.pedir('GET', ruta);

    if (!r.ok) throw new Error(await this.detalle(r));
    return (await r.json()) as PerfilAdministrable[];
  }

  async cambiarVoluntario(id: string, cambio: CambioPerfil): Promise<PerfilAdministrable> {
    if (!environment.apiUrl) {
      throw new Error('El servidor no esta configurado.');
    }

    const r = await this.pedir('PATCH', `/perfiles/${id}`, cambio);
    if (!r.ok) throw new Error(await this.detalle(r));
    return (await r.json()) as PerfilAdministrable;
  }

  async cerrarSesion(): Promise<void> {
    // Se avisa al servidor si se puede, pero el borrado local ocurre igual: si el
    // voluntario presta el celular, cerrar sesion no puede depender de que haya senal.
    try {
      if (environment.apiUrl && this.token()) {
        await this.pedir('DELETE', '/sesion');
      }
    } catch {
      /* sin senal: el borrado local basta */
    } finally {
      this.olvidar();
    }
  }

  /**
   * Sesion conservada en el dispositivo.
   *
   * NO consulta al servidor a proposito: esta es la llamada que decide si el
   * voluntario puede seguir trabajando, y en la vereda la respuesta correcta es que
   * si. Para saber si el token sirve para enviar, esta {@link tokenVigente}.
   */
  async sesionActual(): Promise<Sesion | null> {
    try {
      const crudo = localStorage.getItem(ApiAuthAdapter.CLAVE_SESION);
      return crudo ? (JSON.parse(crudo) as Sesion) : null;
    } catch {
      return null;
    }
  }

  async tokenVigente(): Promise<boolean> {
    if (!environment.apiUrl || !this.token()) return false;

    try {
      const r = await this.pedir('GET', '/sesion');
      // 401 es respuesta legitima: el servidor dijo que la sesion ya no sirve.
      return r.ok;
    } catch {
      // No se alcanzo el servidor. No se sabe, y ante la duda no se expulsa a nadie.
      return false;
    }
  }

  async servidorDisponible(): Promise<boolean> {
    if (!environment.apiUrl) return false;

    try {
      const r = await this.pedir('GET', '/salud');
      // Cualquier respuesta sirve: la pregunta es si hubo servidor, no si dijo que si.
      return r.status > 0;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------

  private token(): string | null {
    try {
      return localStorage.getItem(ApiAuthAdapter.CLAVE_TOKEN);
    } catch {
      return null;
    }
  }

  private guardar(token: string, sesion: Sesion): void {
    try {
      localStorage.setItem(ApiAuthAdapter.CLAVE_TOKEN, token);
      localStorage.setItem(ApiAuthAdapter.CLAVE_SESION, JSON.stringify(sesion));
    } catch {
      /* almacenamiento lleno o bloqueado: la sesion vive solo en esta pestana */
    }
  }

  private olvidar(): void {
    try {
      localStorage.removeItem(ApiAuthAdapter.CLAVE_TOKEN);
      localStorage.removeItem(ApiAuthAdapter.CLAVE_SESION);
    } catch {
      /* nada que hacer */
    }
  }

  private pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<Response> {
    const cabeceras: Record<string, string> = { Accept: 'application/json' };
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

    const token = this.token();
    if (token) cabeceras['Authorization'] = `Bearer ${token}`;

    return fetch(`${environment.apiUrl}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ApiAuthAdapter.ESPERA_MS)
    });
  }

  private async detalle(r: Response): Promise<string> {
    if (r.status === 401) return 'Correo o clave incorrectos.';
    try {
      const cuerpo = (await r.json()) as { mensaje?: string };
      return cuerpo.mensaje ?? `El servidor respondio ${r.status}.`;
    } catch {
      return `El servidor respondio ${r.status}.`;
    }
  }
}
