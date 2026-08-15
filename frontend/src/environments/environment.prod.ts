import { Environment } from './environment.model';

/**
 * Configuracion de la aplicacion publicada.
 *
 * Reemplaza a `environment.ts` en la compilacion de produccion — el cambio lo hace
 * `fileReplacements` en angular.json, no un `if` en el codigo.
 *
 * POR QUE ESTE ARCHIVO NO EXISTIA HASTA HOY
 *
 * Porque no habia servidor al que apuntar. `apiUrl: ''` es un estado legitimo, no un
 * descuido: con la cadena vacia la aplicacion opera completamente en el dispositivo —
 * captura, guarda y no envia— y eso es lo que permitia trabajar en la interfaz sin
 * levantar nada. Sigue siendo el valor de desarrollo.
 *
 * Desde el 15 de agosto de 2026 la API existe, asi que la version publicada si tiene
 * a donde hablar.
 *
 * NO HAY NINGUN SECRETO AQUI, Y NO PUEDE HABERLO
 *
 * Este archivo se compila dentro del paquete que se descarga al celular del
 * voluntario. Cualquiera puede leerlo. Lo unico que lleva es una direccion publica;
 * quien decide que puede hacer cada persona es el servidor, mirando el token de la
 * sesion. Si alguien alguna vez agrega una llave aqui, esa llave deja de serlo.
 */
export const environment: Environment = {
  produccion: true,

  // Sin barra final. Los adaptadores componen `${apiUrl}${ruta}` y las rutas ya
  // empiezan con barra; con una barra aqui saldrian peticiones a `//sesion`, que
  // el navegador interpreta como otro host y no como una ruta.
  apiUrl: 'https://api.apoyo-colombia.com',

  // Municipio y departamento son CAMPOS, no constantes (frente F8). Esto es el valor
  // por defecto del formulario, lo unico atado hoy a Sevilla, y se cambia sin tocar
  // codigo el dia que entre otro municipio.
  municipioPorDefecto: 'Sevilla',
  departamentoPorDefecto: 'Valle del Cauca'
};
