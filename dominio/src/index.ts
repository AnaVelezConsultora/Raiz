/**
 * @raiz/dominio — contrato compartido entre la PWA y la API.
 *
 * Regla de lo que entra aqui: si cruza la red, es contrato y vive en este paquete.
 * Si solo existe en el dispositivo —la cola de sincronizacion, el Blob de la foto,
 * el codigo local provisional— se queda en el frontend.
 */
export * from './enums';
export * from './caso.model';
export * from './foto.model';
export * from './acceso';
export * from './consentimiento';
