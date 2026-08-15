import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ErrorSesion,
  VERIFICADOR_TOKEN,
  VerificadorTokenPort
} from '../dominio/puertos';
import { METADATO_RUTA_ABIERTA } from './ruta-abierta.decorador';

/**
 * Convierte el token en identidad, una sola vez y para todas las rutas.
 *
 * POR QUE ESTO ES UNA GUARDA Y NO UN METODO EN CADA CONTROLADOR
 *
 * Porque antes cada controlador leia la cabecera por su cuenta. Eso funciona hasta que
 * alguien agrega una ruta y no copia esas cuatro lineas, y entonces hay un endpoint que
 * escribe en la base sin preguntarle a nadie quien es. Nadie lo nota, porque una ruta
 * abierta no falla: responde.
 *
 * Aqui esta protegido por defecto y se abre marcandolo. El olvido produce una ruta que
 * pide token, que estorba y se arregla en un minuto.
 *
 * LO QUE ESTA GUARDA NO HACE
 *
 * No decide permisos. Establece QUIEN es, no QUE puede. Lo segundo lo deciden las
 * politicas de acceso por fila de PostgreSQL, que corren del lado de la base y no se
 * pueden burlar desde el cliente. Una guarda que ademas decidiera permisos invitaria a
 * confiar en ella para eso, y ese es justo el error que el esquema evita.
 *
 * @version 0.1.0
 */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(VERIFICADOR_TOKEN) private readonly verificador: VerificadorTokenPort
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const abierta = this.reflector.getAllAndOverride<boolean>(METADATO_RUTA_ABIERTA, [
      contexto.getHandler(),
      contexto.getClass()
    ]);
    if (abierta) return true;

    const peticion = contexto.switchToHttp().getRequest();
    const token = String(peticion.headers?.authorization ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!token) {
      // Clase sesion y no rechazo: el dispositivo debe detener la cola y pedir
      // reconectar, no marcar los casos como datos malos ni quemar reintentos.
      throw new ErrorSesion('Falta el token de sesion.');
    }

    // La identidad sale SIEMPRE del token, nunca del cuerpo del mensaje. Es la
    // diferencia entre que un voluntario firme su propio trabajo y que un cliente
    // modificado registre casos a nombre de otro.
    peticion.identidad = await this.verificador.verificar(token);
    return true;
  }
}
