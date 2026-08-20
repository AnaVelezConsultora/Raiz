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
/**
 * Quien responde por los datos personales que Raiz recoge.
 *
 * -----------------------------------------------------------------------------------
 * ESTO ES UNA DECISION JURIDICA, NO UNA CONFIGURACION
 * -----------------------------------------------------------------------------------
 *
 * La Ley 1581 exige que al pedir la autorizacion se le diga a la persona QUIEN esta
 * recogiendo sus datos y a donde escribir para ejercer sus derechos. No es un adorno de
 * la pantalla: sin eso, la autorizacion es discutible.
 *
 * Y no se puede inventar. Si todavia no existe una persona juridica llamada Raiz,
 * escribir una aqui seria atribuirle responsabilidad a algo que no existe, y dejaria a
 * las familias sin nadie a quien reclamarle. En esta primera etapa el responsable puede
 * ser una persona natural o una organizacion que ya exista y acepte serlo — pero eso lo
 * decide quien va a responder, no el codigo.
 *
 * MIENTRAS ESTE VACIO, la pantalla de autorizacion lo dice en vez de disimularlo. Es
 * incomodo a proposito: un aviso incomodo se resuelve en un dia, y un nombre inventado
 * se descubre el dia que alguien reclama.
 */
export interface ResponsableTratamiento {
  /** Nombre de la persona u organizacion que responde. Vacio = sin definir. */
  nombre: string;
  /** Como ubicarla: correo o telefono. */
  contacto: string;
  /** A donde escribe quien quiera conocer, rectificar, revocar o suprimir. */
  canalDerechos: string;
}

export interface Environment {
  produccion: boolean;

  /** Raiz de la API, SIN barra final. Vacio = modo local: se captura y se guarda, no se envia. */
  apiUrl: string;

  municipioPorDefecto: string;
  /** Ver {@link ResponsableTratamiento}: decision juridica, no configuracion. */
  responsableTratamiento: ResponsableTratamiento;
  departamentoPorDefecto: string;
}
