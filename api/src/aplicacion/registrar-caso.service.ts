import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CasoParaSincronizar,
  CasoSincronizado,
  aplicarAutorizacionSensibles,
  aplicarConsentimiento,
  identidadResidual,
  sensiblesResiduales
} from '@raiz/dominio';
import {
  CASO_REPOSITORIO,
  CasoRepositorioPort,
  ErrorRechazo,
  Identidad
} from '../dominio/puertos';

/**
 * Registro de un caso capturado en terreno.
 *
 * Unica responsabilidad: aplicar las reglas que deben cumplirse SIEMPRE, sin importar
 * por donde entre el caso, y delegar la escritura.
 *
 * POR QUE LA REGLA DE CONSENTIMIENTO SE APLICA AQUI Y NO SOLO EN EL CLIENTE
 *
 * La documentacion del proyecto afirma que «sin autorizacion de la familia la
 * identidad no viaja, y ninguna ruta de la aplicacion puede saltarse esa validacion».
 * Con la regla solo en el cliente, esa frase describe una intencion: basta un cliente
 * modificado, una version vieja instalada en un celular o una carga desde otro canal
 * para saltarsela.
 *
 * Aplicada tambien aqui, en el borde de escritura del servidor, y usando la MISMA
 * funcion del paquete compartido, la frase pasa a ser una propiedad del sistema.
 *
 * @version 0.1.0
 */
@Injectable()
export class RegistrarCasoService {
  private readonly log = new Logger(RegistrarCasoService.name);

  constructor(@Inject(CASO_REPOSITORIO) private readonly repositorio: CasoRepositorioPort) {}

  async ejecutar(caso: CasoParaSincronizar, identidad: Identidad): Promise<CasoSincronizado> {
    const sinIdentidad = this.retirarIdentidadSinAutorizacion(caso);
    const limpio = this.retirarSensiblesSinAutorizacion(sinIdentidad);

    this.verificarQueNoQuedeIdentidad(limpio);
    this.verificarQueNoQuedenSensibles(limpio);

    return this.repositorio.registrar(limpio, identidad);
  }

  /**
   * En el caso normal no retira nada: el cliente ya no deberia haber enviado
   * identidad sin autorizacion. Si retira algo, el caso se guarda igual y el defecto
   * queda registrado.
   *
   * No se rechaza el caso a proposito. En una emergencia, perder el trabajo de un
   * voluntario por un defecto del cliente es peor que guardar el hogar sin nombre: la
   * familia queda contada y no desaparece del total que sustenta la peticion.
   */
  private retirarIdentidadSinAutorizacion(caso: CasoParaSincronizar): CasoParaSincronizar {
    const { hogar, camposRetirados } = aplicarConsentimiento(caso.hogar, caso.control);

    if (camposRetirados.length > 0) {
      this.log.warn(
        `Caso ${caso.origenId}: llego identidad sin autorizacion y se retiro ` +
          `(${camposRetirados.join(', ')}). Revisar la version del cliente que lo envio.`
      );
    }

    return { ...caso, hogar };
  }

  /**
   * Lo mismo que la anterior, para los datos sensibles: salud, discapacidad,
   * gestacion y origen etnico.
   *
   * Se agrego el 19 de agosto de 2026 porque no existia. La regla del proyecto
   * protegia cuatro campos de identidad y todo lo demas viajaba siempre, incluidos
   * gestantes, discapacidad, enfermedad cronica y —desde el 16 de agosto— fallecidos
   * y heridos.
   *
   * La familia sigue contada, con su ubicacion, su numero de personas y su dano. Lo
   * que se retira es el detalle que la ley protege.
   */
  private retirarSensiblesSinAutorizacion(caso: CasoParaSincronizar): CasoParaSincronizar {
    const { vulnerabilidad, camposRetirados } = aplicarAutorizacionSensibles(
      caso.hogar.vulnerabilidad,
      caso.control
    );

    if (camposRetirados.length > 0) {
      this.log.warn(
        `Caso ${caso.origenId}: llegaron datos sensibles sin autorizacion y se ` +
          `retiraron (${camposRetirados.join(', ')}). Revisar la version del cliente.`
      );
    }

    return { ...caso, hogar: { ...caso.hogar, vulnerabilidad } };
  }

  /**
   * Ultima verificacion antes de escribir.
   *
   * Si esto encuentra algo, hay una ruta que se salto la regla. Aqui si se rechaza:
   * llegado este punto, escribir seria incumplir la Ley 1581 y la promesa que el
   * proyecto le hizo a la familia.
   */
  private verificarQueNoQuedeIdentidad(caso: CasoParaSincronizar): void {
    const residual = identidadResidual(caso.hogar, caso.control);
    if (residual.length === 0) return;

    this.log.error(
      `Caso ${caso.origenId}: identidad residual tras aplicar la regla (${residual.join(', ')}).`
    );
    throw new ErrorRechazo(
      'El caso conserva datos de identidad sin autorizacion de la familia.',
      residual.map((campo) => `${campo} debe ir vacio sin consentimiento`)
    );
  }

  /** Igual que la anterior, para los sensibles. Tampoco se escribe si queda algo. */
  private verificarQueNoQuedenSensibles(caso: CasoParaSincronizar): void {
    const residual = sensiblesResiduales(caso.hogar.vulnerabilidad, caso.control);
    if (residual.length === 0) return;

    this.log.error(
      `Caso ${caso.origenId}: datos sensibles residuales tras aplicar la regla ` +
        `(${residual.join(', ')}).`
    );
    throw new ErrorRechazo(
      'El caso conserva datos sensibles sin autorizacion especifica de la familia.',
      residual.map((campo) => `${campo} debe ir vacio sin autorizacion de datos sensibles`)
    );
  }
}
