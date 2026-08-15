/**
 * Municipios conocidos, para orientar al voluntario en la barra superior.
 *
 * -----------------------------------------------------------------------------
 * ESTO NO ES UN DATO DEL CENSO Y NO PUEDE SERLO
 * -----------------------------------------------------------------------------
 *
 * Lo unico que hace esta tabla es decidir que nombre se muestra en la cabecera. El
 * municipio que queda GUARDADO en cada caso sale del formulario, lo escribe el
 * voluntario y no se toca desde aqui.
 *
 * La distincion importa: un municipio adivinado por cercania es una aproximacion
 * util para orientarse y un dato falso para un padron que va a sustentar una
 * peticion ante una entidad. Si alguna vez alguien conecta esta tabla al
 * formulario, esta metiendo aproximaciones en el censo.
 *
 * -----------------------------------------------------------------------------
 * SON CENTROIDES APROXIMADOS, NO FRONTERAS
 * -----------------------------------------------------------------------------
 *
 * Un municipio es un poligono; aqui hay un punto y un radio. Cerca de un limite
 * municipal esto se equivoca, y por eso la resolucion exige estar a menos de
 * RADIO_MAXIMO_KM de un centroide: fuera de ese radio se responde "Colombia" en
 * vez de arriesgar un nombre incorrecto.
 *
 * Es deliberado que se equivoque hacia "no se". Un voluntario que lee "Colombia"
 * entiende que la aplicacion no pudo ubicarlo. Uno que lee el nombre del municipio
 * vecino cree que si pudo, y no tiene forma de notar el error.
 *
 * -----------------------------------------------------------------------------
 * QUE FALTA, Y DE DONDE TIENE QUE VENIR
 * -----------------------------------------------------------------------------
 *
 * Esta tabla cubre el area afectada por el terremoto del 10 de agosto de 2026 y
 * nada mas. Colombia tiene mas de mil municipios.
 *
 * El reemplazo correcto es el listado oficial de la division politico-administrativa
 * del DANE, con sus poligonos, no una lista escrita a mano. Ya esta anotado como
 * pendiente de gestion en ESTADO.md —junto al listado oficial de veredas— porque es
 * la misma clase de dato: no lo produce quien programa, lo entrega la autoridad.
 *
 * Cuando llegue, este archivo se reemplaza entero y la interfaz no cambia: quien lo
 * consume solo llama a `municipioEn(lat, lon)`.
 */

/** Un municipio y donde queda, aproximadamente. */
export interface Municipio {
  nombre: string;
  departamento: string;
  lat: number;
  lon: number;
}

/**
 * A mas de esta distancia del centroide mas cercano, no se afirma nada.
 *
 * Quince kilometros es del orden del radio de un municipio de esta zona. Subirlo
 * haria que la aplicacion nombre municipios estando lejos; bajarlo haria que
 * responda "Colombia" en veredas que si pertenecen al municipio.
 */
export const RADIO_MAXIMO_KM = 15;

/** Lo que se muestra cuando no se puede ubicar al voluntario. */
export const SIN_UBICAR = 'Colombia';

/**
 * Zona afectada por el terremoto del 10 de agosto de 2026 y municipios vecinos.
 *
 * Coordenadas APROXIMADAS de la cabecera municipal, no del limite. La de Sevilla
 * concuerda con las capturas de prueba del repositorio, que es la unica que este
 * proyecto ha verificado con un dispositivo.
 */
export const MUNICIPIOS: readonly Municipio[] = [
  // Valle del Cauca
  { nombre: 'Sevilla', departamento: 'Valle del Cauca', lat: 4.27, lon: -75.93 },
  { nombre: 'Caicedonia', departamento: 'Valle del Cauca', lat: 4.33, lon: -75.83 },
  { nombre: 'Bugalagrande', departamento: 'Valle del Cauca', lat: 4.21, lon: -76.16 },
  { nombre: 'Tuluá', departamento: 'Valle del Cauca', lat: 4.08, lon: -76.2 },
  { nombre: 'Zarzal', departamento: 'Valle del Cauca', lat: 4.39, lon: -76.07 },
  { nombre: 'La Victoria', departamento: 'Valle del Cauca', lat: 4.52, lon: -76.04 },
  { nombre: 'Obando', departamento: 'Valle del Cauca', lat: 4.57, lon: -75.98 },
  { nombre: 'Alcalá', departamento: 'Valle del Cauca', lat: 4.67, lon: -75.78 },
  { nombre: 'Ulloa', departamento: 'Valle del Cauca', lat: 4.7, lon: -75.74 },

  // Quindío, al otro lado de la cordillera
  { nombre: 'Génova', departamento: 'Quindío', lat: 4.21, lon: -75.79 },
  { nombre: 'Pijao', departamento: 'Quindío', lat: 4.33, lon: -75.7 },
  { nombre: 'Córdoba', departamento: 'Quindío', lat: 4.39, lon: -75.69 },
  { nombre: 'Calarcá', departamento: 'Quindío', lat: 4.52, lon: -75.64 },
  { nombre: 'Armenia', departamento: 'Quindío', lat: 4.53, lon: -75.68 }
];

/**
 * Distancia en kilometros entre dos coordenadas, por la formula del haversine.
 *
 * Se usa haversine y no la distancia plana entre grados porque un grado de longitud
 * mide distinto segun la latitud. A cuatro grados del ecuador la diferencia con la
 * aproximacion plana es pequena, pero escribir la version correcta cuesta seis
 * lineas y no obliga a nadie a recordar que solo vale cerca del ecuador.
 */
function distanciaKm(latA: number, lonA: number, latB: number, lonB: number): number {
  const RADIO_TIERRA_KM = 6371;
  const aRadianes = (grados: number): number => (grados * Math.PI) / 180;

  const dLat = aRadianes(latB - latA);
  const dLon = aRadianes(lonB - lonA);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(latA)) * Math.cos(aRadianes(latB)) * Math.sin(dLon / 2) ** 2;

  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
}

/**
 * El municipio conocido mas cercano a una coordenada, si esta lo bastante cerca.
 *
 * @returns El municipio, o `null` si no hay ninguno dentro de {@link RADIO_MAXIMO_KM}.
 *          `null` significa "no se", y quien llama debe mostrar {@link SIN_UBICAR}.
 */
export function municipioEn(lat: number, lon: number): Municipio | null {
  let cercano: Municipio | null = null;
  let menorDistancia = Number.POSITIVE_INFINITY;

  for (const municipio of MUNICIPIOS) {
    const distancia = distanciaKm(lat, lon, municipio.lat, municipio.lon);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      cercano = municipio;
    }
  }

  return menorDistancia <= RADIO_MAXIMO_KM ? cercano : null;
}
