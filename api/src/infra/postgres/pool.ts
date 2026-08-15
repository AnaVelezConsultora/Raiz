import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { ErrorTransporte } from '../../dominio/puertos';

/** Lo que necesita una consulta para correr a nombre de alguien. */
export interface ContextoUsuario {
  sub: string;
}

/**
 * Acceso a PostgreSQL.
 *
 * TODA consulta que toque datos de familias pasa por {@link comoUsuario}. Nunca se
 * consulta con el cliente crudo, y esa es la regla que sostiene el control de acceso
 * entero.
 *
 * POR QUE `set_config(..., true)` Y `SET LOCAL ROLE`
 *
 * El tercer parametro `true` hace la variable local a la transaccion. Sin el, una
 * conexion devuelta al pool conserva la identidad del usuario anterior y la siguiente
 * peticion corre como esa persona: el voluntario A leyendo los casos del voluntario B.
 * Es el fallo clasico de poner RLS detras de una API propia y no da error, solo
 * devuelve datos de mas.
 *
 * `SET LOCAL ROLE authenticated` baja los privilegios dentro de la transaccion. La
 * conexion se abre con un rol que puede cambiar de rol, no con uno que pueda leerlo
 * todo.
 *
 * @version 0.1.0
 */
@Injectable()
export class PostgresPool implements OnModuleDestroy {
  private readonly log = new Logger(PostgresPool.name);
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: Number(process.env['DB_MAX_CONEXIONES'] ?? 10),
      // Una conexion colgada bloquea una peticion entera. Mejor fallar y reintentar.
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000
    });

    this.pool.on('error', (e) => this.log.error(`Error en el pool: ${e.message}`));
  }

  /**
   * Ejecuta el trabajo dentro de una transaccion, a nombre del usuario indicado.
   *
   * Confirma si el trabajo termina bien y revierte ante cualquier excepcion. El
   * cliente vuelve al pool sin identidad porque la configuracion era local.
   */
  async comoUsuario<T>(
    contexto: ContextoUsuario,
    trabajo: (cliente: PoolClient) => Promise<T>
  ): Promise<T> {
    const cliente = await this.conectar();

    try {
      await cliente.query('begin');
      await cliente.query('select set_config($1, $2, true)', ['app.user_id', contexto.sub]);
      await cliente.query('set local role authenticated');

      const resultado = await trabajo(cliente);

      await cliente.query('commit');
      return resultado;
    } catch (error) {
      await cliente.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      cliente.release();
    }
  }

  /**
   * Consulta sin poner identidad en la transaccion.
   *
   * USO RESTRINGIDO, Y LA RESTRICCION IMPORTA. Sin `app.user_id` las politicas de
   * acceso por fila no tienen a quien preguntarle y la consulta corre con el rol de la
   * conexion. Es la puerta por la que se sale toda la proteccion del esquema.
   *
   * Se justifica en un solo caso: leer el perfil durante el inicio de sesion, que
   * ocurre ANTES de que exista una sesion que poner. Cualquier otro uso hay que
   * discutirlo antes de escribirlo.
   */
  async sinIdentidad<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.conectar();
    try {
      return await trabajo(cliente);
    } finally {
      cliente.release();
    }
  }

  /** Consulta sin identidad. Solo para comprobar que la base responde. */
  async responde(): Promise<boolean> {
    try {
      const cliente = await this.conectar();
      try {
        await cliente.query('select 1');
        return true;
      } finally {
        cliente.release();
      }
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private async conectar(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (e) {
      const detalle = e instanceof Error ? e.message : 'desconocido';
      this.log.error(`No se pudo conectar a la base: ${detalle}`);
      // Se traduce a error de transporte para que el cliente reintente en vez de
      // marcar el caso como rechazado y sacarlo de la cola.
      throw new ErrorTransporte();
    }
  }
}
