import { Inject, Injectable } from '@nestjs/common';
import { ResumenTablero } from '@raiz/dominio';
import {
  CASO_REPOSITORIO,
  CasoRepositorioPort,
  ErrorSesion,
  Identidad,
  PERFIL_REPOSITORIO,
  PerfilRepositorioPort
} from '../dominio/puertos';

/**
 * Consulta de casos.
 *
 * Lo unico que hace de mas sobre el repositorio es comprobar que el acceso siga
 * activo, y eso no es ceremonia: el rol se lee de la base en cada peticion, de modo
 * que retirarle el acceso a alguien surte efecto en la consulta siguiente y no cuando
 * caduque su token.
 *
 * QUE NO HACE: filtrar por rol. Quien ve que lo decide la politica por fila, y
 * repetirlo aqui daria dos copias de la misma regla que se separan el dia que alguien
 * toca una.
 *
 * @version 0.1.0
 */
@Injectable()
export class ConsultarCasosService {
  constructor(
    @Inject(CASO_REPOSITORIO) private readonly casos: CasoRepositorioPort,
    @Inject(PERFIL_REPOSITORIO) private readonly perfiles: PerfilRepositorioPort
  ) {}

  async ejecutar(quien: Identidad): Promise<ResumenTablero[]> {
    const perfil = await this.perfiles.porSub(quien.sub);
    if (!perfil || !perfil.activo) {
      throw new ErrorSesion('Su acceso no esta activo.');
    }

    return this.casos.listar(quien);
  }
}
