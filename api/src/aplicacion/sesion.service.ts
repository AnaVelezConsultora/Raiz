import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Credenciales,
  ErrorSesion,
  PERFIL_REPOSITORIO,
  Perfil,
  PerfilRepositorioPort,
  PROVEEDOR_IDENTIDAD,
  ProveedorIdentidadPort
} from '../dominio/puertos';

/** Lo que el dispositivo recibe al entrar. Es el contrato del ADR 003 seccion 8. */
export interface SesionAbierta {
  token: string;
  expiraEn: string | null;
  correo: string;
  perfil: Perfil;
}

/**
 * Abrir sesion: autenticar y resolver el perfil, en una sola operacion.
 *
 * POR QUE EL PERFIL VIAJA EN LA MISMA RESPUESTA
 *
 * Porque pedirlo aparte convierte el inicio de sesion en dos viajes de red, y en una
 * conexion rural el segundo se puede caer. El voluntario quedaria autenticado y sin
 * perfil, mirando una pantalla que no sabe si mostrarle el boton de exportar. Un paso
 * que puede fallar entre dos estados validos es un paso que hay que eliminar, no
 * documentar.
 *
 * DOS COSAS QUE ESTE SERVICIO NO HACE
 *
 * No decide permisos: eso lo hace el rol, y el rol lo aplican las politicas de acceso
 * por fila del lado de la base. Lo que aqui se resuelve es de que rol se trata.
 *
 * No guarda nada. La sesion vive en el dispositivo y en el proveedor; la API no lleva
 * un registro de quien esta conectado. Eso hace que el servidor sea reemplazable sin
 * expulsar a nadie, que es justo lo que se quiere de un contenedor que se recicla.
 *
 * @version 0.1.0
 */
@Injectable()
export class SesionService {
  private readonly log = new Logger(SesionService.name);

  constructor(
    @Inject(PROVEEDOR_IDENTIDAD) private readonly proveedor: ProveedorIdentidadPort,
    @Inject(PERFIL_REPOSITORIO) private readonly perfiles: PerfilRepositorioPort
  ) {}

  async abrir(credenciales: Credenciales): Promise<SesionAbierta> {
    const emitido = await this.proveedor.autenticar(credenciales);
    const perfil = await this.perfiles.porSub(emitido.sub);

    if (!perfil) {
      // La cuenta existe en el proveedor pero nadie le asigno perfil. Pasa cuando se
      // crea un usuario a mano y no corre el disparador que crea la fila. Es un
      // problema de administracion, no del voluntario, y el mensaje lo dice.
      this.log.warn(`Sin perfil para ${emitido.sub}: la cuenta existe pero no tiene fila en perfiles`);
      throw new ErrorSesion(
        'Su cuenta existe pero todavia no tiene perfil asignado. Pida al coordinador que le asigne un rol.'
      );
    }

    if (!perfil.activo) {
      // Retirar a alguien no borra sus casos ni rompe la trazabilidad de quien reporto
      // que: se desactiva el perfil y deja de entrar, y lo que levanto sigue ahi.
      throw new ErrorSesion('Su acceso esta desactivado. Hable con el custodio de datos.');
    }

    return {
      token: emitido.token,
      expiraEn: emitido.expiraEn,
      correo: credenciales.correo.trim().toLowerCase(),
      perfil
    };
  }
}
