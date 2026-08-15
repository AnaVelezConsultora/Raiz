import { Rol } from '@raiz/dominio';
import { Injectable } from '@nestjs/common';
import { Perfil, PerfilRepositorioPort } from '../../dominio/puertos';
import { PostgresPool } from './pool';

/** Fila de `perfiles` tal como sale de la consulta. */
interface Fila {
  id: string;
  nombre: string;
  rol: Rol;
  organizacion_id: string | number | null;
  telefono: string | null;
  activo: boolean;
}

/**
 * Lee el perfil del voluntario desde PostgreSQL.
 *
 * POR QUE ESTA CONSULTA NO PASA POR LA IDENTIDAD DE LA TRANSACCION
 *
 * Todas las demas lecturas corren como el usuario que pregunta, para que las politicas
 * de acceso por fila decidan que puede ver. Esta no puede: ocurre en el instante del
 * inicio de sesion, ANTES de que exista una sesion que poner. Es el huevo y la gallina.
 *
 * Se acota por eso: consulta una sola fila, por clave primaria, y devuelve unicamente
 * el perfil de quien acaba de autenticarse contra el proveedor. No hay forma de pedir
 * el de otro, porque el `sub` no viene del cuerpo del mensaje sino de un token que el
 * proveedor acaba de emitir.
 *
 * @version 0.1.0
 */
@Injectable()
export class PerfilRepositorioPostgres implements PerfilRepositorioPort {
  constructor(private readonly pool: PostgresPool) {}

  async porSub(sub: string): Promise<Perfil | null> {
    return this.pool.sinIdentidad(async (cliente) => {
      const { rows } = await cliente.query<Fila>(
        `select id, nombre, rol, organizacion_id, telefono, activo
           from perfiles
          where id = $1`,
        [sub]
      );

      const fila = rows[0];
      if (!fila) return null;

      return {
        id: fila.id,
        nombre: fila.nombre,
        rol: fila.rol,
        // PostgreSQL devuelve bigint como texto para no perder precision en JavaScript.
        organizacionId: fila.organizacion_id === null ? null : Number(fila.organizacion_id),
        telefono: fila.telefono,
        activo: fila.activo
      };
    });
  }
}
