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
 * POR QUE ESTA CONSULTA SI PONE IDENTIDAD, AUNQUE OCURRA AL ENTRAR
 *
 * La primera version la hacia sin identidad, razonando que el inicio de sesion ocurre
 * antes de que exista una sesion que poner. No era cierto y ademas no funcionaba: el
 * proveedor acaba de devolver el `sub`, asi que la identidad SI existe en ese instante,
 * y sin ponerla la politica `perfil_lee` —`id = auth.uid() or es_mesa()`— no encuentra a
 * nadie. La API se conecta como `raiz_api`, que no es duena de las tablas, de modo que
 * la consulta devolvia cero filas y todo ingreso terminaba en "su cuenta existe pero
 * todavia no tiene perfil asignado", con las credenciales correctas.
 *
 * Poniendo el `sub` en la transaccion, la politica hace justo lo que promete: cada quien
 * ve su propia fila. Es el mismo mecanismo del resto de la API y no una excepcion, que
 * es la propiedad que hace verificable el control de acceso.
 *
 * @version 0.1.0
 */
@Injectable()
export class PerfilRepositorioPostgres implements PerfilRepositorioPort {
  constructor(private readonly pool: PostgresPool) {}

  async porSub(sub: string): Promise<Perfil | null> {
    return this.pool.comoUsuario({ sub }, async (cliente) => {
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
