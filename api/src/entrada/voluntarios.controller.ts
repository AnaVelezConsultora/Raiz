import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  AltaVoluntario,
  RegistrarVoluntarioService,
  VoluntarioCreado
} from '../aplicacion/registrar-voluntario.service';
import { Rol } from '@raiz/dominio';
import { ErrorRechazo, Identidad } from '../dominio/puertos';
import { Quien } from './ruta-abierta.decorador';

/** Cuerpo del alta. Todo llega como desconocido y se comprueba. */
interface CuerpoAlta {
  correo?: unknown;
  nombre?: unknown;
  documento?: unknown;
  telefono?: unknown;
  clave?: unknown;
  rol?: unknown;
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
   * El telefono y el documento ya NO son opcionales. Quien registra a una familia
   * damnificada firma ese registro: el dia que una entidad devuelva un caso
   * preguntando quien lo levanto, la respuesta no puede ser un correo electronico.
   *
   * Sin `rol` se entiende `lider`, que es el rol de quien registra y el unico que
   * todos los que pueden dar de alta tienen permiso de crear.
   */
  private leer(cuerpo: CuerpoAlta): AltaVoluntario {
    if (!cuerpo || typeof cuerpo !== 'object') {
      throw new ErrorRechazo('El cuerpo de la peticion no es valido.');
    }

    const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
    const rol = texto(cuerpo.rol).trim() || Rol.Lider;

    if (!Object.values(Rol).includes(rol as Rol)) {
      throw new ErrorRechazo(`El rol "${rol}" no existe.`);
    }

    return {
      correo: texto(cuerpo.correo),
      nombre: texto(cuerpo.nombre),
      documento: texto(cuerpo.documento).trim(),
      telefono: texto(cuerpo.telefono).trim(),
      clave: texto(cuerpo.clave),
      rol: rol as Rol
    };
  }
}
