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
 * POR QUE YA NO ESTA VACIA
 *
 * Aqui `apiUrl` iba en blanco, y con eso la aplicacion abria sin identificarse: las
 * guardas de ruta tenian una excepcion para ese caso. Se quito, porque detras hay un
 * padron de personas afectadas y porque una pantalla que solo se prueba sin sesion no
 * se ha probado. Sin servidor no hay a quien preguntarle quien es uno, asi que en
 * desarrollo se apunta al entorno local.
 *
 * Antes de `npm start`, levantarlo: `cd entorno && make arriba`. Deja la base, S3 y
 * Cognito en pie, con usuarios de prueba y la clave que imprime al terminar.
 *
 * Que capturar funcione sin senal no depende de esto: depende de haber entrado UNA vez
 * en el dispositivo. El token puede estar vencido y la vereda no tener red; lo que el
 * servidor rechazara entonces es el envio, no la captura.
 */
import { Environment } from './environment.model';

// El tipo vive en environment.model.ts y no aqui. En la compilacion de produccion
// este archivo entero se reemplaza por environment.prod.ts, asi que un tipo
// declarado aqui desapareceria justo cuando el otro archivo lo necesita.
export type { Environment };

export const environment: Environment = {
  produccion: false,
  // El puerto es el del entorno local, y la API ya trae localhost:4200 entre sus
  // origenes permitidos.
  apiUrl: 'http://localhost:3021',
  responsableTratamiento: {
    // PENDIENTE DE DEFINIR. Ver ResponsableTratamiento en environment.model.ts: no se
    // llena con un nombre inventado, se llena cuando alguien acepte responder.
    nombre: '',
    contacto: '',
    canalDerechos: ''
  },
  municipioPorDefecto: 'Sevilla',
  departamentoPorDefecto: 'Valle del Cauca'
};
