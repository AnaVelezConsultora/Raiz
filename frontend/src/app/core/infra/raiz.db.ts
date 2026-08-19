import Dexie, { Table } from 'dexie';
import { Caso, FotoLocal, ImagenLocal } from '../domain/caso.model';

/** Lo que de verdad se guarda de una fotografia: todo menos la imagen. */
export type FotoGuardada = Omit<FotoLocal, 'blob'>;

/**
 * Base de datos local (IndexedDB) del dispositivo.
 *
 * Es el sistema de registro mientras no hay conexion. Todo lo que el voluntario
 * escribe en la vereda vive aqui hasta que la cola de sincronizacion lo confirme
 * contra el servidor.
 *
 * -----------------------------------------------------------------------------------
 * LA IMAGEN VIVE APARTE DEL REGISTRO QUE CAMBIA, Y NO ES ORGANIZACION
 * -----------------------------------------------------------------------------------
 *
 * La version 1 guardaba el `Blob` dentro de la fila de la fotografia. En Android
 * funciona; en un iPhone rompe la aplicacion, y de la peor manera:
 *
 *   Error modifying one or more objects. Errors: UnknownError:
 *   Error preparing Blob/File data to be stored in object store
 *
 * WebKit acepta guardar un Blob la primera vez, pero falla al VOLVER a guardarlo
 * despues de haberlo leido de la base. Y Dexie, para actualizar un campo, reescribe
 * el registro entero: anotar «esta foto ya se envio» reescribia la imagen con ella.
 *
 * O sea que capturar funcionaba y registrar el envio no. En terreno eso significa que
 * la fotografia se sube, el servidor la guarda, y el celular no puede anotarlo — asi
 * que la vuelve a subir, con los datos del voluntario, para siempre.
 *
 * Desde la version 2 la fila de `fotos` es solo metadato y los bytes viven en
 * `imagenes`, en su propia tabla y como ArrayBuffer. Un ArrayBuffer no tiene el
 * problema del Blob —no arrastra un archivo de respaldo— y sobre todo NUNCA se
 * reescribe: se guarda una vez, al capturar, y despues solo se lee.
 *
 * Se conserva la decision original de no usar base64: inflaba un 33 % y obligaba a
 * tener la imagen completa en memoria como cadena.
 *
 * @version 0.2.0
 */
export class RaizDb extends Dexie {
  /** Casos capturados en el dispositivo. Clave primaria: UUID local. */
  casos!: Table<Caso, string>;

  /** Fotografias, SIN los bytes. Sincronizan por separado del caso. */
  fotos!: Table<FotoGuardada, string>;

  /** Los bytes de cada fotografia, por el identificador de la fotografia. */
  imagenes!: Table<ImagenLocal, string>;

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

    // `imagenes` solo se busca por su clave primaria: siempre se pide la de UNA
    // fotografia concreta. Un indice de mas sobre una tabla de binarios cuesta
    // espacio en un telefono donde el espacio es justo lo que falta.
    //
    // Los registros que ya existan NO se convierten aqui. Pasar un Blob a
    // ArrayBuffer exige una espera que no es de IndexedDB, y una transaccion de
    // IndexedDB se cierra sola en cuanto se espera algo ajeno: la conversion se
    // haria a medias y en silencio. Se hace despues, foto por foto, en
    // DexieFotoStorageService.
    this.version(2).stores({
      imagenes: 'id'
    });
  }
}

/**
 * Instancia unica. Dexie mantiene una sola conexion por nombre de base, de modo que
 * exportar la instancia evita abrir conexiones duplicadas cuando Angular recrea
 * servicios durante el desarrollo con recarga en caliente.
 */
export const db = new RaizDb();
