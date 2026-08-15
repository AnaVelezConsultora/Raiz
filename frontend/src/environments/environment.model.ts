/**
 * La FORMA de la configuracion de ambiente. Solo el tipo; ningun valor.
 *
 * POR QUE ESTA EN UN ARCHIVO PROPIO Y NO JUNTO A LOS VALORES
 *
 * Porque `fileReplacements` sustituye `environment.ts` entero por
 * `environment.prod.ts` al compilar para produccion. Si el tipo viviera en el
 * primero, el segundo tendria que importarlo de un archivo que en esa compilacion
 * ya no existe — se importaria a si mismo. El compilador lo detecta y falla, que
 * es mejor que no detectarlo, pero el arreglo es este: el contrato aparte de las
 * dos implementaciones.
 *
 * Que los dos ambientes declaren este mismo tipo es lo que hace que agregar una
 * variable rompa la compilacion en vez de dejar `undefined` en produccion.
 */
export interface Environment {
  produccion: boolean;

  /** Raiz de la API, SIN barra final. Vacio = modo local: se captura y se guarda, no se envia. */
  apiUrl: string;

  municipioPorDefecto: string;
  departamentoPorDefecto: string;
}
