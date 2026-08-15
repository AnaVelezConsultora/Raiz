import { Rol } from '@raiz/dominio';
import { Injectable } from '@nestjs/common';
import { Perfil, PerfilRepositorioPort, UsuarioNuevo } from '../../dominio/puertos';
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

  /**
   * Escribe el usuario en `auth.users`, el espejo local de Cognito.
   *
   * De ese insert cuelga el disparador `tr_crear_perfil`, que crea la fila de
   * `perfiles` con rol `lider` —el menos privilegiado— y `activo = true`. Ascender a
   * alguien es despues una accion deliberada del custodio, no un efecto del alta.
   *
   * `on conflict do nothing` porque esto se puede reintentar: si el alta en Cognito
   * salio bien y esta escritura fallo por un corte, el custodio repite la operacion y
   * no debe encontrarse con un error de clave duplicada.
   */
  async reflejarDelProveedor(usuario: UsuarioNuevo): Promise<void> {
    await this.pool.sinIdentidad(async (cliente) => {
      await cliente.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, $2, $3::jsonb)
         on conflict (id) do nothing`,
        [
          usuario.sub,
          usuario.correo,
          JSON.stringify({ nombre: usuario.nombre, telefono: usuario.telefono })
        ]
      );
    });
  }

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
