import { Injectable } from '@nestjs/common';
import { SaludPort } from '../../dominio/puertos';
import { PostgresPool } from './pool';

/**
 * Comprobacion de disponibilidad.
 *
 * La usa el dispositivo antes de vaciar la cola: si la base no responde, no tiene
 * sentido gastarle datos moviles al voluntario intentando enviar veinte casos.
 */
@Injectable()
export class SaludPostgres implements SaludPort {
  constructor(private readonly pool: PostgresPool) {}

  baseAlcanzable(): Promise<boolean> {
    return this.pool.responde();
  }
}
