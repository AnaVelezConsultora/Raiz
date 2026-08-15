import { Inject, Injectable, Logger } from '@nestjs/common';
import { Rol } from '@raiz/dominio';
import {
  ErrorRechazo,
  ErrorSesion,
  Identidad,
  PERFIL_REPOSITORIO,
  Perfil,
  PerfilRepositorioPort
} from '../dominio/puertos';

/**
 * Ver y cambiar accesos.
 *
 * -----------------------------------------------------------------------------------
 * AQUI NO SE COMPRUEBA QUIEN PUEDE QUE, Y ES A PROPOSITO
 * -----------------------------------------------------------------------------------
 *
 * Las dos operaciones corren a nombre de quien pide y son las politicas de acceso por
 * fila las que deciden. Repetir la regla aqui daria dos copias que se separan el dia
 * que alguien toca una — y la que manda es la de la base, asi que la copia de arriba
 * seria la que miente.
 *
 * Lo que si vive aqui es traducir «la base no dejo» a una frase util. Sin eso, un
 * coordinador que intenta ascender a alguien recibe un 404 y se queda pensando que el
 * sistema esta roto, cuando lo que pasa es que no le corresponde.
 *
 * @version 0.1.0
 */
@Injectable()
export class AdministrarPerfilesService {
  private readonly log = new Logger(AdministrarPerfilesService.name);

  constructor(
    @Inject(PERFIL_REPOSITORIO) private readonly perfiles: PerfilRepositorioPort
  ) {}

  async listar(quien: Identidad, soloInactivos: boolean): Promise<Perfil[]> {
    await this.exigirActivo(quien);
    return this.perfiles.listar(quien, soloInactivos);
  }

  async cambiar(
    id: string,
    cambio: { rol?: Rol; activo?: boolean },
    quien: Identidad
  ): Promise<Perfil> {
    const perfil = await this.exigirActivo(quien);

    // Retirarse a uno mismo el acceso deja el sistema sin quien administre, y en una
    // emergencia eso significa que nadie puede dar de alta al voluntario que sale
    // manana a la vereda. Se rechaza antes de tocar la base.
    if (id === quien.sub && cambio.activo === false) {
      throw new ErrorRechazo('No puede retirarse el acceso a usted mismo.');
    }
    if (id === quien.sub && cambio.rol && cambio.rol !== perfil.rol) {
      throw new ErrorRechazo('No puede cambiarse el rol a usted mismo.');
    }

    const actualizado = await this.perfiles.cambiar(id, cambio, quien);

    if (!actualizado) {
      this.log.warn(
        `${quien.sub} (${perfil.rol}) intento cambiar ${id} y la base no lo permitio.`
      );
      throw new ErrorSesion(
        `Un ${perfil.rol} no puede administrar a esa persona. ` +
          'El custodio administra a todos; el coordinador, solo a quien registra.'
      );
    }

    this.log.log(`${quien.sub} cambio a ${id}: ${JSON.stringify(cambio)}`);
    return actualizado;
  }

  /**
   * El acceso se mira en la base en cada peticion, nunca en el token.
   *
   * Es lo que permite que retirarle el acceso a alguien surta efecto en la peticion
   * siguiente, sin esperar a que caduque nada.
   */
  private async exigirActivo(quien: Identidad): Promise<Perfil> {
    const perfil = await this.perfiles.porSub(quien.sub);
    if (!perfil || !perfil.activo) {
      throw new ErrorSesion('Su acceso no esta activo.');
    }
    return perfil;
  }
}
