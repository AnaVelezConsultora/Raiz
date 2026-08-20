import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { PuntoEnTablero, PuntoServicio } from '@raiz/dominio';
import { RegistrarPuntoService } from '../aplicacion/registrar-punto.service';
import { Identidad, PuntoRegistrado } from '../dominio/puertos';
import { Quien } from './ruta-abierta.decorador';

/**
 * Infraestructura afectada: acueductos, vias, puentes, escuelas.
 *
 * DEVUELVE 200 Y NO 201, igual que los casos: el envio es idempotente por el
 * identificador que genero el dispositivo, y `yaExistia` le dice a la aplicacion si su
 * reintento creo el punto o solo lo actualizo.
 *
 * @version 0.1.0
 */
@Controller('puntos')
export class PuntosController {
  constructor(private readonly puntos: RegistrarPuntoService) {}

  /**
   * Todos los puntos, ordenados por cuantos hogares registrados dependen de cada uno.
   *
   * A DIFERENCIA DE LOS CASOS, aqui todo el mundo ve todo, incluido el lider. La
   * politica de la base lo dice y esta ruta no la contradice: un acueducto roto no es
   * dato personal, y esconderselo al lider de la vereda de al lado solo consigue que lo
   * registre por segunda vez.
   */
  @Get()
  listar(@Quien() identidad: Identidad): Promise<PuntoEnTablero[]> {
    return this.puntos.listar(identidad);
  }

  @Post()
  @HttpCode(200)
  recibir(
    @Body() punto: PuntoServicio,
    @Quien() identidad: Identidad
  ): Promise<PuntoRegistrado> {
    return this.puntos.ejecutar(punto, identidad);
  }
}
