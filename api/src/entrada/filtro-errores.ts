import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ErrorRechazo, ErrorSesion, ErrorTransporte } from '../dominio/puertos';

/** Cuerpo de error. Es contrato: la cola del dispositivo decide con esto. */
interface RespuestaError {
  clase: 'sesion' | 'rechazo' | 'transporte' | 'desconocido';
  mensaje: string;
  detalles?: string[];
}

/**
 * Traduce la taxonomia de error del dominio a codigos HTTP.
 *
 * La distincion no es decorativa: el dispositivo hace tres cosas distintas.
 *
 *   401 sesion     -> detiene la cola y pide reconectar. NO consume intentos.
 *   422 rechazo    -> el dato no sirve; se marca para revision humana y sigue el resto.
 *   503 transporte -> algo temporal; se detiene la pasada y se reintenta despues.
 *
 * Devolver 500 para todo, que es lo comodo, hace que el cliente queme el contador de
 * intentos con la sesion vencida y deje casos fuera del envio sin avisarle a nadie.
 * Es el defecto H10 de la revision.
 *
 * @version 0.1.0
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly log = new Logger(FiltroErrores.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    const { estado, cuerpo } = this.clasificar(error);

    if (estado >= 500) {
      this.log.error(cuerpo.mensaje, error instanceof Error ? error.stack : undefined);
    }

    respuesta.status(estado).json(cuerpo);
  }

  private clasificar(error: unknown): { estado: number; cuerpo: RespuestaError } {
    if (error instanceof ErrorSesion) {
      return { estado: 401, cuerpo: { clase: 'sesion', mensaje: error.message } };
    }

    if (error instanceof ErrorRechazo) {
      return {
        estado: 422,
        cuerpo: { clase: 'rechazo', mensaje: error.message, detalles: error.detalles }
      };
    }

    if (error instanceof ErrorTransporte) {
      return { estado: 503, cuerpo: { clase: 'transporte', mensaje: error.message } };
    }

    if (error instanceof HttpException) {
      const estado = error.getStatus();
      return {
        estado,
        cuerpo: {
          // Un 4xx de Nest es un problema del dato; un 5xx es temporal.
          clase: estado < 500 ? 'rechazo' : 'transporte',
          mensaje: error.message
        }
      };
    }

    // Lo no clasificado se trata como transporte: es preferible que el dispositivo
    // reintente a que descarte el trabajo de un voluntario por un fallo nuestro.
    return {
      estado: 503,
      cuerpo: {
        clase: 'transporte',
        mensaje: 'El servidor no pudo atender la peticion. Reintente.'
      }
    };
  }
}
