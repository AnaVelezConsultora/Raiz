import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Headers,
  Inject,
  Post
} from '@nestjs/common';
import { SesionAbierta, SesionService } from '../aplicacion/sesion.service';
import {
  ErrorRechazo,
  ErrorSesion,
  VERIFICADOR_TOKEN,
  VerificadorTokenPort
} from '../dominio/puertos';

/** Cuerpo del inicio de sesion. */
interface CuerpoAcceso {
  correo?: unknown;
  clave?: unknown;
}

/**
 * Las tres rutas de sesion del ADR 003 seccion 8.
 *
 * El navegador nunca habla con el proveedor de identidad: le habla aqui. Eso permite
 * que la pantalla de acceso sea nuestra, que los mensajes esten en el idioma del
 * proyecto, y que cambiar de proveedor no obligue a tocar la PWA.
 *
 * @version 0.1.0
 */
@Controller('sesion')
export class SesionController {
  constructor(
    private readonly sesiones: SesionService,
    @Inject(VERIFICADOR_TOKEN) private readonly verificador: VerificadorTokenPort
  ) {}

  /** Entrar. Devuelve token, vencimiento y el perfil ya resuelto. */
  @Post()
  @HttpCode(200)
  async entrar(@Body() cuerpo: CuerpoAcceso): Promise<SesionAbierta> {
    const correo = typeof cuerpo?.correo === 'string' ? cuerpo.correo.trim() : '';
    const clave = typeof cuerpo?.clave === 'string' ? cuerpo.clave : '';

    // Se valida aqui y no en el proveedor para no gastar un viaje de red ni un intento
    // del limitador de Cognito en algo que se ve a simple vista.
    if (!correo || !clave) {
      throw new ErrorRechazo('Escriba su correo y su clave.');
    }

    return this.sesiones.abrir({ correo, clave });
  }

  /**
   * Saber si el token todavia sirve para enviar.
   *
   * La respuesta 401 es legitima y no un fallo: significa "el servidor dice que su
   * sesion ya no sirve", que es distinto de "no alcance el servidor". El dispositivo
   * necesita esa diferencia, porque con la segunda sigue capturando y con la primera
   * pide reconectar. Ver la taxonomia de error del ADR 003 seccion 4.
   */
  @Get()
  @HttpCode(204)
  async vigente(@Headers('authorization') autorizacion?: string): Promise<void> {
    const token = autorizacion?.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new ErrorSesion('Falta el token de sesion.');

    await this.verificador.verificar(token);
  }

  /**
   * Salir.
   *
   * Responde 204 siempre que la peticion sea legible, incluso si el token ya no vale:
   * quien esta cerrando sesion quiere que la sesion se acabe, y devolverle un error
   * porque ya estaba acabada no le sirve de nada.
   *
   * El borrado que de verdad importa ocurre en el dispositivo y no depende de esta
   * llamada: si el voluntario presta el celular, cerrar sesion tiene que funcionar sin
   * senal.
   */
  @Delete()
  @HttpCode(204)
  async salir(): Promise<void> {
    return;
  }
}
