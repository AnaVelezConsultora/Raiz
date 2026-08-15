/**
 * Enumeraciones del dominio.
 *
 * NO se declaran aqui. Viven en `@raiz/dominio`, el paquete que comparten la PWA y la
 * API, y este archivo solo las reexporta para no reescribir los imports existentes.
 *
 * La razon es la misma que la de la regla de consentimiento: mientras un enum este
 * escrito en dos lados, que el frontend y el servidor coincidan es una intencion.
 * Escrito una sola vez, es una propiedad.
 */
export * from '@raiz/dominio';
