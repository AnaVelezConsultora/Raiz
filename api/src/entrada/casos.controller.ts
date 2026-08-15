import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post
} from '@nestjs/common';
import { CasoParaSincronizar, CasoSincronizado } from '@raiz/dominio';
import { RegistrarCasoService } from '../aplicacion/registrar-caso.service';
import {
  ErrorRechazo,
  ErrorSesion,
  Identidad,
  VERIFICADOR_TOKEN,
  VerificadorTokenPort
} from '../dominio/puertos';

/**
 * Recepcion de casos capturados en terreno.
 *
 * Un caso por peticion, a proposito. La cola del dispositivo envia secuencialmente
 * para no tumbar una conexion movil debil, y con envio individual un caso que el
 * servidor rechaza no arrastra a los demas de la tanda.
 *
 * DEVUELVE 200 Y NO 201 CUANDO YA EXISTIA. El campo `yaExistia` le dice al dispositivo
 * si su reintento creo el caso o solo lo actualizo, que es lo que necesita para no
 * contar dos veces lo enviado.
 *
 * @version 0.1.0
 */
@Controller('casos')
export class CasosController {
  private readonly log = new Logger(CasosController.name);

  constructor(
    private readonly registrar: RegistrarCasoService,
    @Inject(VERIFICADOR_TOKEN) private readonly verificador: VerificadorTokenPort
  ) {}

  @Post()
  @HttpCode(200)
  async recibir(
    @Body() caso: CasoParaSincronizar,
    @Headers('authorization') autorizacion?: string
  ): Promise<CasoSincronizado> {
    const identidad = await this.identificar(autorizacion);
    this.validar(caso);

    const resultado = await this.registrar.ejecutar(caso, identidad);

    this.log.log(
      `Caso ${resultado.codigo} ${resultado.yaExistia ? 'actualizado' : 'registrado'} ` +
        `por ${identidad.sub}`
    );
    return resultado;
  }

  /**
   * La identidad sale SIEMPRE del token, nunca del cuerpo del mensaje.
   *
   * Es la diferencia entre que un voluntario firme su propio trabajo y que un cliente
   * modificado pueda registrar casos a nombre de otro.
   */
  private async identificar(autorizacion?: string): Promise<Identidad> {
    const token = autorizacion?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new ErrorSesion('Falta el token de sesion.');
    }
    return this.verificador.verificar(token);
  }

  /**
   * Validacion minima de forma. Lo demas lo valida la base, que es donde de verdad
   * mandan las reglas.
   *
   * Se exige poco a proposito: un caso que llega incompleto desde una vereda vale mas
   * que un caso rechazado. Lo que falte se completa por telefono; lo que se rechaza
   * se pierde.
   */
  private validar(caso: CasoParaSincronizar): void {
    const faltantes: string[] = [];

    if (!caso?.origenId) faltantes.push('origenId es obligatorio');
    if (!caso?.control?.registradorNombre) faltantes.push('control.registradorNombre es obligatorio');
    if (!caso?.ubicacion?.municipio) faltantes.push('ubicacion.municipio es obligatorio');
    if (!caso?.ubicacion?.zona) faltantes.push('ubicacion.zona es obligatorio');
    if (!caso?.hogar?.tel1) faltantes.push('hogar.tel1 es obligatorio');
    if (!(caso?.hogar?.personasTotal > 0)) faltantes.push('hogar.personasTotal debe ser mayor que cero');

    if (faltantes.length > 0) {
      throw new ErrorRechazo('El caso no trae los datos minimos.', faltantes);
    }
  }
}
