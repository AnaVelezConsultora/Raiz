import { Controller, Get, Inject } from '@nestjs/common';
import { SALUD, SaludPort } from '../dominio/puertos';
import { VERSION } from '../version';
import { RutaAbierta } from './ruta-abierta.decorador';

/** Respuesta de disponibilidad. La consulta el dispositivo antes de vaciar la cola. */
interface EstadoServicio {
  disponible: boolean;
  base: 'responde' | 'no responde';
  /**
   * Version del servicio que esta respondiendo.
   *
   * El pie de la aplicacion ya dice que version tiene el celular. Esta es la otra
   * mitad: contra que version del servidor esta hablando. Con las dos, cuando un
   * lider llame a decir que algo no le sirve, el problema se ubica en un minuto.
   *
   * Va en la ruta abierta a proposito: si hiciera falta sesion para consultarla, no
   * serviria justo cuando algo no deja entrar a nadie.
   */
  version: string;
}

@Controller('salud')
export class SaludController {
  constructor(@Inject(SALUD) private readonly salud: SaludPort) {}

  /**
   * Devuelve 200 aunque la base no responda, con `disponible: false`.
   *
   * Es deliberado: el dispositivo necesita distinguir «el servidor esta caido» de «el
   * servidor esta vivo pero su base no». En el primer caso reintenta mas tarde; en el
   * segundo, tampoco envia, pero sabe que el problema no es su conexion.
   */
  @RutaAbierta()
  @Get()
  async consultar(): Promise<EstadoServicio> {
    const alcanzable = await this.salud.baseAlcanzable();
    return {
      disponible: alcanzable,
      base: alcanzable ? 'responde' : 'no responde',
      version: VERSION
    };
  }
}
