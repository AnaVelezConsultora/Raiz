import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Rol } from '@raiz/dominio';
import { AdministrarPerfilesService } from '../aplicacion/administrar-perfiles.service';
import { ErrorRechazo, Identidad, Perfil } from '../dominio/puertos';
import { Quien } from './ruta-abierta.decorador';

/** Lo que se puede cambiar de un perfil. Todo llega como desconocido. */
interface CuerpoCambio {
  rol?: unknown;
  activo?: unknown;
}

/**
 * Administracion de accesos.
 *
 * QUIEN VE Y QUIEN CAMBIA LO DECIDE LA BASE, no este controlador. Las dos rutas
 * corren a nombre de quien pide, de modo que las politicas de acceso por fila hacen
 * el trabajo:
 *
 *   ver      la fila propia la ve cualquiera; todas, la mesa
 *   cambiar  el custodio administra a todos; el coordinador, solo a quien registra
 *
 * Escribirlo aqui ademas seria repetirlo, y dos copias de una regla de permisos se
 * separan el dia que alguien toca una. Lo que si vive aqui es el mensaje: cuando la
 * base no deja, se responde con una frase que dice por que.
 *
 * @version 0.1.0
 */
@Controller('perfiles')
export class PerfilesController {
  constructor(private readonly administrar: AdministrarPerfilesService) {}

  @Get()
  listar(@Query('estado') estado: string, @Quien() quien: Identidad): Promise<Perfil[]> {
    return this.administrar.listar(quien, estado === 'inactivos');
  }

  @Patch(':id')
  cambiar(
    @Param('id') id: string,
    @Body() cuerpo: CuerpoCambio,
    @Quien() quien: Identidad
  ): Promise<Perfil> {
    return this.administrar.cambiar(id, this.leer(cuerpo), quien);
  }

  private leer(cuerpo: CuerpoCambio): { rol?: Rol; activo?: boolean } {
    if (!cuerpo || typeof cuerpo !== 'object') {
      throw new ErrorRechazo('El cuerpo de la peticion no es valido.');
    }

    const cambio: { rol?: Rol; activo?: boolean } = {};

    if (cuerpo.rol !== undefined) {
      if (!Object.values(Rol).includes(cuerpo.rol as Rol)) {
        throw new ErrorRechazo(`El rol "${String(cuerpo.rol)}" no existe.`);
      }
      cambio.rol = cuerpo.rol as Rol;
    }

    if (cuerpo.activo !== undefined) {
      if (typeof cuerpo.activo !== 'boolean') {
        throw new ErrorRechazo('activo tiene que ser verdadero o falso.');
      }
      cambio.activo = cuerpo.activo;
    }

    if (cambio.rol === undefined && cambio.activo === undefined) {
      throw new ErrorRechazo('No se pidio ningun cambio.');
    }

    return cambio;
  }
}
