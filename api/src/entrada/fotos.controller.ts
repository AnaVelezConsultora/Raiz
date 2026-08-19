import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  AutorizacionSubida,
  ConfirmacionFoto,
  EstadoFoto,
  FotoConfirmada,
  SolicitudSubidaFoto
} from '@raiz/dominio';
import { SubidaFotoService } from '../aplicacion/subida-foto.service';
import { Identidad } from '../dominio/puertos';
import { Quien } from './ruta-abierta.decorador';

/**
 * Fotografias del dano de la vivienda.
 *
 * NINGUNA IMAGEN ATRAVIESA ESTAS RUTAS. Lo que se mueve aqui son permisos y
 * comprobaciones: el binario viaja entre el celular y el almacenamiento. Con 15.000
 * fotografias previstas, hacerlas pasar por el servidor seria pagar computo y
 * transferencia por mover bytes que nadie procesa.
 *
 * Las cuatro rutas, y por que son cuatro:
 *
 *   POST   /fotos/url-prefirmada     pide permiso; la API decide si directa o por bloques
 *   GET    /fotos/{id}/estado        como va, para la barra de avance. No cambia nada
 *   POST   /fotos/{id}/confirmar     cierra la subida y VERIFICA contra el almacenamiento
 *   DELETE /fotos/{id}               cancela lo que iba a medias y libera el espacio
 *
 * El nombre `url-prefirmada` se conserva porque es el que la PWA publicada ya llama, y
 * en las veredas hay telefonos con la version anterior instalada. Cambiarlo por uno mas
 * exacto costaria que esos telefonos dejaran de subir fotografias el dia del despliegue.
 *
 * @version 0.1.0
 */
@Controller('fotos')
export class FotosController {
  constructor(private readonly subida: SubidaFotoService) {}

  /** Paso 1. Sin autorizacion de la familia no se firma nada; lo comprueba la base. */
  @Post('url-prefirmada')
  @HttpCode(200)
  autorizar(
    @Body() solicitud: SolicitudSubidaFoto,
    @Quien() identidad: Identidad
  ): Promise<AutorizacionSubida> {
    return this.subida.autorizar(solicitud, identidad);
  }

  @Get(':id/estado')
  estado(@Param('id') id: string, @Quien() identidad: Identidad): Promise<EstadoFoto> {
    return this.subida.estado(id, identidad);
  }

  /**
   * Paso 3. Devuelve 200 y no 201: confirmar es idempotente y `yaEstaba` dice si esta
   * llamada cerro la subida o solo comprobo lo que ya estaba cerrado.
   */
  @Post(':id/confirmar')
  @HttpCode(200)
  confirmar(
    @Param('id') id: string,
    @Body() confirmacion: ConfirmacionFoto,
    @Quien() identidad: Identidad
  ): Promise<FotoConfirmada> {
    return this.subida.confirmar(id, confirmacion, identidad);
  }

  /** Cancela una subida a medias. No borra fotografias ya guardadas. */
  @Delete(':id')
  @HttpCode(204)
  cancelar(@Param('id') id: string, @Quien() identidad: Identidad): Promise<void> {
    return this.subida.abortar(id, identidad);
  }
}
