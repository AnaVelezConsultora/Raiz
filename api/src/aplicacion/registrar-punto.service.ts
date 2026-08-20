import { Inject, Injectable, Logger } from '@nestjs/common';
import { EstadoServicio, PuntoEnTablero, PuntoServicio, TipoPunto, Zona } from '@raiz/dominio';
import {
  ErrorRechazo,
  Identidad,
  PUNTO_REPOSITORIO,
  PuntoRegistrado,
  PuntoRepositorioPort
} from '../dominio/puertos';

/**
 * Alta y consulta de puntos de servicio.
 *
 * Es deliberadamente delgado comparado con {@link RegistrarCasoService}, y la razon es
 * que un punto NO ES DATO PERSONAL: no hay consentimiento que verificar, ni campos
 * sensibles que retirar, ni una segunda comprobacion de que no quedaron colados. Toda
 * esa maquinaria existe alla porque alla se registra a personas.
 *
 * Lo que si vive aqui es la normalizacion de las veredas servidas, porque de ella
 * depende que el cruce con el censo encuentre algo.
 *
 * @version 0.1.0
 */
@Injectable()
export class RegistrarPuntoService {
  private readonly log = new Logger(RegistrarPuntoService.name);

  constructor(
    @Inject(PUNTO_REPOSITORIO) private readonly repositorio: PuntoRepositorioPort
  ) {}

  listar(identidad: Identidad): Promise<PuntoEnTablero[]> {
    return this.repositorio.listar(identidad);
  }

  async ejecutar(punto: PuntoServicio, identidad: Identidad): Promise<PuntoRegistrado> {
    this.validar(punto);

    const limpio: PuntoServicio = {
      ...punto,
      nombre: punto.nombre.trim(),
      veredasServidas: this.depurarVeredas(punto)
    };

    const resultado = await this.repositorio.registrar(limpio, identidad);

    this.log.log(
      `Punto ${resultado.codigo} (${limpio.tipo}) ` +
        `${resultado.yaExistia ? 'actualizado' : 'registrado'} por ${identidad.sub}`
    );
    return resultado;
  }

  /**
   * Deja la lista de veredas servidas sin vacios, sin repetidas y sin espacios sobrantes.
   *
   * SE AGREGA LA VEREDA DONDE ESTA EL PUNTO si no venia ya en la lista. Un acueducto
   * sirve, antes que a nadie, a la vereda en la que esta; olvidar marcarla es el error
   * facil de cometer al llenar la pantalla, y el efecto seria un punto que reporta cero
   * hogares registrados teniendo cuarenta enfrente.
   *
   * La comparacion fina —sin tildes, sin mayusculas, sin el prefijo «vereda»— la hace
   * la base con `normalizar_lugar`, que es donde tiene que estar para que el indice la
   * pueda usar. Aqui solo se quita lo evidente.
   */
  private depurarVeredas(punto: PuntoServicio): string[] {
    const candidatas = [...(punto.veredasServidas ?? []), punto.ubicacion.vereda ?? ''];

    const vistas = new Map<string, string>();
    for (const cruda of candidatas) {
      const limpia = cruda.trim();
      if (!limpia) continue;

      const llave = limpia.toLocaleLowerCase('es-CO');
      // Se conserva la PRIMERA forma escrita, no la ultima: es la que escribio quien
      // registro el punto, y es la que la mesa reconoce al leerla.
      if (!vistas.has(llave)) vistas.set(llave, limpia);
    }

    return [...vistas.values()];
  }

  /**
   * Validacion minima de forma, con el mismo criterio que los casos: se exige poco.
   *
   * Un punto que llega sin cuantos hogares dependen de el sigue siendo util —dice que
   * hay un acueducto roto, y eso ya es mas de lo que habia—; uno rechazado se pierde.
   * Lo unico innegociable es que se sepa QUE es, DONDE esta y COMO esta, porque sin
   * alguna de esas tres el registro no le sirve a nadie.
   */
  private validar(punto: PuntoServicio): void {
    const faltantes: string[] = [];

    if (!punto?.id) faltantes.push('id es obligatorio');
    if (!punto?.nombre?.trim()) faltantes.push('nombre es obligatorio');
    if (!Object.values(TipoPunto).includes(punto?.tipo)) faltantes.push('tipo no es valido');
    if (!Object.values(EstadoServicio).includes(punto?.estadoServicio)) {
      faltantes.push('estadoServicio no es valido');
    }
    if (!punto?.ubicacion?.municipio) faltantes.push('ubicacion.municipio es obligatorio');
    if (!Object.values(Zona).includes(punto?.ubicacion?.zona)) {
      faltantes.push('ubicacion.zona no es valida');
    }
    if (!punto?.registradorNombre?.trim()) faltantes.push('registradorNombre es obligatorio');

    if (punto?.hogaresEstimados != null && punto.hogaresEstimados < 0) {
      faltantes.push('hogaresEstimados no puede ser negativo');
    }

    if (faltantes.length > 0) {
      throw new ErrorRechazo('El punto de servicio no trae los datos minimos.', faltantes);
    }
  }
}
