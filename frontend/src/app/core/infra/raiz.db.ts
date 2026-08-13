import Dexie, { Table } from 'dexie';
import { Caso, FotoLocal } from '../domain/caso.model';

/**
 * Base de datos local (IndexedDB) del dispositivo.
 *
 * Es el sistema de registro mientras no hay conexion. Todo lo que el voluntario
 * escribe en la vereda vive aqui hasta que la cola de sincronizacion lo confirme
 * contra el servidor.
 *
 * Decision: las fotos se guardan como Blob en IndexedDB, no como base64. Base64
 * infla el tamano un 33% y obliga a mantener la imagen completa en memoria como
 * string, lo que en un celular de gama baja con tres fotos abiertas provoca cierre
 * de la pestana por presion de memoria.
 *
 * @version 0.1.0
 */
export class RaizDb extends Dexie {
  /** Casos capturados en el dispositivo. Clave primaria: UUID local. */
  casos!: Table<Caso, string>;

  /** Fotografias. Sincronizan por separado del caso. */
  fotos!: Table<FotoLocal, string>;

  constructor() {
    super('raiz');

    // Indices elegidos por las consultas reales de la aplicacion:
    //   - meta.estadoSync  -> cola de sincronizacion y contador de pendientes
    //   - actualizadoEn    -> listado ordenado por lo mas reciente
    //   - [zona+prioridad] -> filtros combinados del listado sin recorrido completo
    this.version(1).stores({
      casos: 'id, codigo, estado, actualizadoEn, meta.estadoSync, [ubicacion.zona+triaje.prioridad]',
      fotos: 'id, casoId, meta.estadoSync, capturadaEn'
    });
  }
}

/**
 * Instancia unica. Dexie mantiene una sola conexion por nombre de base, de modo que
 * exportar la instancia evita abrir conexiones duplicadas cuando Angular recrea
 * servicios durante el desarrollo con recarga en caliente.
 */
export const db = new RaizDb();
