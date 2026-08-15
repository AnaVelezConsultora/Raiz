/**
 * Configuracion de ambiente.
 *
 * La aplicacion habla con la API propia de Raiz, no con un proveedor de base de datos.
 * Ver docs/adr/002-infraestructura-en-aws.md y docs/adr/003-contrato-de-sincronizacion.md.
 *
 * POR QUE YA NO HAY UNA CLAVE AQUI
 *
 * Antes vivia aqui la clave anonima de Supabase, porque el navegador hablaba
 * directamente con la base y necesitaba presentarse. Con una API propia el navegador
 * no conoce la base: manda el token de la sesion en la cabecera y el servidor decide.
 * Un secreto en el paquete que se descarga al celular no es un secreto.
 *
 * `apiUrl` vacio es un estado legitimo y no un descuido: la aplicacion opera
 * completamente en modo local, guardando en el dispositivo. Es lo que permite
 * capturar en la vereda y tambien lo que permite trabajar en la interfaz sin
 * levantar el servidor.
 */
import { Environment } from './environment.model';

// El tipo vive en environment.model.ts y no aqui. En la compilacion de produccion
// este archivo entero se reemplaza por environment.prod.ts, asi que un tipo
// declarado aqui desapareceria justo cuando el otro archivo lo necesita.
export type { Environment };

export const environment: Environment = {
  produccion: false,
  // En desarrollo la API se levanta con `cd entorno && make arriba`.
  apiUrl: '',
  municipioPorDefecto: 'Sevilla',
  departamentoPorDefecto: 'Valle del Cauca'
};
