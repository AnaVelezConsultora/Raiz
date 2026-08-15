import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  AltaVoluntario,
  RegistrarVoluntarioService,
  VoluntarioCreado
} from '../aplicacion/registrar-voluntario.service';
import { ErrorRechazo, Identidad } from '../dominio/puertos';
import { Quien } from './ruta-abierta.decorador';

/** Cuerpo del alta. Todo llega como desconocido y se comprueba. */
interface CuerpoAlta {
  correo?: unknown;
  nombre?: unknown;
  telefono?: unknown;
  clave?: unknown;
}

/**
 * Alta de voluntarios.
 *
 * NO lleva @RutaAbierta(), y esa ausencia es el punto: pide token como todo lo demas, y
 * ademas el servicio comprueba que quien pide sea custodio. Un registro abierto sobre
 * el padron de familias damnificadas seria la puerta por la que se contamina el censo.
 *
 * @version 0.1.0
 */
@Controller('voluntarios')
export class VoluntariosController {
  constructor(private readonly registrar: RegistrarVoluntarioService) {}

  @Post()
  @HttpCode(201)
  async darDeAlta(
    @Body() cuerpo: CuerpoAlta,
    @Quien() quien: Identidad
  ): Promise<VoluntarioCreado> {
    return this.registrar.ejecutar(this.leer(cuerpo), quien);
  }

  /**
   * Convierte el cuerpo en algo tipado, sin confiar en lo que llegue.
   *
   * El telefono se acepta vacio y se guarda como null, no como cadena vacia: en la base
   * "no tiene telefono" y "tiene el telefono en blanco" no pueden ser lo mismo.
   */
  private leer(cuerpo: CuerpoAlta): AltaVoluntario {
    if (!cuerpo || typeof cuerpo !== 'object') {
      throw new ErrorRechazo('El cuerpo de la peticion no es valido.');
    }

    const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
    const telefono = texto(cuerpo.telefono).trim();

    return {
      correo: texto(cuerpo.correo),
      nombre: texto(cuerpo.nombre),
      telefono: telefono || null,
      clave: texto(cuerpo.clave)
    };
  }
}
