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
 * OCHO KILOMETROS, Y ANTES ERAN QUINCE. El 15 de agosto de 2026 alguien parado en
 * el centro de Pereira leyo "Ulloa" en la cabecera. Ulloa esta a 13,5 km, dentro de
 * los quince, y Pereira NO estaba en la tabla: el algoritmo hizo exactamente lo que
 * se le pidio y respondio una ciudad equivocada con toda confianza.
 *
 * De ahi salen las dos correcciones. Esta es la del radio: ocho kilometros es del
 * orden del area urbana de una cabecera, no del municipio entero. La consecuencia
 * conocida es que en una vereda lejana del casco se responde "Colombia" aunque la
 * persona SI este en ese municipio. Es el error que se prefiere.
 */
export const RADIO_MAXIMO_KM = 8;

/**
 * Si el segundo municipio mas cercano esta a menos de esta diferencia del primero,
 * no se afirma ninguno.
 *
 * Es la segunda leccion del mismo error. Cerca de un limite municipal, "el mas
 * cercano" es una moneda al aire, y una moneda al aire mostrada como un hecho es
 * peor que un "no se". Sin este margen, alguien caminando por el borde entre dos
 * municipios veria la cabecera cambiar de nombre sola.
 */
export const MARGEN_AMBIGUEDAD_KM = 1.5;

/** Lo que se muestra cuando no se puede ubicar al voluntario. */
export const SIN_UBICAR = 'Colombia';

/**
 * Eje Cafetero y norte del Valle: la zona afectada y desde donde se trabaja.
 *
 * COORDENADAS ESCRITAS A MANO, DE LA CABECERA MUNICIPAL Y NO DEL LIMITE. Esa es la
 * debilidad de fondo de este archivo y conviene no perderla de vista: la primera
 * version omitia Pereira —una ciudad de medio millon de habitantes— y nadie lo noto
 * hasta que la aplicacion nombro el municipio equivocado a alguien que estaba ahi.
 *
 * Un municipio que falta no da error: hace que el de al lado gane. Por eso importa
 * mas completar esta lista que afinar el algoritmo, y por eso el reemplazo correcto
 * sigue siendo el listado oficial del DANE con poligonos.
 */
export const MUNICIPIOS: readonly Municipio[] = [
  // Risaralda
  { nombre: 'Pereira', departamento: 'Risaralda', lat: 4.8133, lon: -75.6961 },
  { nombre: 'Dosquebradas', departamento: 'Risaralda', lat: 4.834, lon: -75.676 },
  { nombre: 'Santa Rosa de Cabal', departamento: 'Risaralda', lat: 4.869, lon: -75.621 },
  { nombre: 'La Virginia', departamento: 'Risaralda', lat: 4.899, lon: -75.883 },
  { nombre: 'Marsella', departamento: 'Risaralda', lat: 4.937, lon: -75.74 },

  // Caldas
  { nombre: 'Manizales', departamento: 'Caldas', lat: 5.07, lon: -75.517 },
  { nombre: 'Chinchiná', departamento: 'Caldas', lat: 4.982, lon: -75.607 },

  // Quindío
  { nombre: 'Armenia', departamento: 'Quindío', lat: 4.534, lon: -75.681 },
  { nombre: 'Calarcá', departamento: 'Quindío', lat: 4.523, lon: -75.644 },
  { nombre: 'Circasia', departamento: 'Quindío', lat: 4.615, lon: -75.636 },
  { nombre: 'Filandia', departamento: 'Quindío', lat: 4.674, lon: -75.658 },
  { nombre: 'Salento', departamento: 'Quindío', lat: 4.637, lon: -75.57 },
  { nombre: 'Montenegro', departamento: 'Quindío', lat: 4.566, lon: -75.75 },
  { nombre: 'Quimbaya', departamento: 'Quindío', lat: 4.622, lon: -75.764 },
  { nombre: 'La Tebaida', departamento: 'Quindío', lat: 4.452, lon: -75.786 },
  { nombre: 'Córdoba', departamento: 'Quindío', lat: 4.392, lon: -75.687 },
  { nombre: 'Pijao', departamento: 'Quindío', lat: 4.334, lon: -75.703 },
  { nombre: 'Génova', departamento: 'Quindío', lat: 4.207, lon: -75.79 },

  // Valle del Cauca
  { nombre: 'Cartago', departamento: 'Valle del Cauca', lat: 4.746, lon: -75.911 },
  { nombre: 'Ulloa', departamento: 'Valle del Cauca', lat: 4.703, lon: -75.737 },
  { nombre: 'Alcalá', departamento: 'Valle del Cauca', lat: 4.672, lon: -75.781 },
  { nombre: 'Obando', departamento: 'Valle del Cauca', lat: 4.574, lon: -75.977 },
  { nombre: 'La Victoria', departamento: 'Valle del Cauca', lat: 4.523, lon: -76.037 },
  { nombre: 'Zarzal', departamento: 'Valle del Cauca', lat: 4.394, lon: -76.071 },
  { nombre: 'Caicedonia', departamento: 'Valle del Cauca', lat: 4.334, lon: -75.83 },
  { nombre: 'Sevilla', departamento: 'Valle del Cauca', lat: 4.271, lon: -75.934 },
  { nombre: 'Bugalagrande', departamento: 'Valle del Cauca', lat: 4.211, lon: -76.159 },
  { nombre: 'Tuluá', departamento: 'Valle del Cauca', lat: 4.085, lon: -76.196 }
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
  const porDistancia = MUNICIPIOS.map((municipio) => ({
    municipio,
    km: distanciaKm(lat, lon, municipio.lat, municipio.lon)
  })).sort((a, b) => a.km - b.km);

  const primero = porDistancia[0];
  if (!primero || primero.km > RADIO_MAXIMO_KM) return null;

  // Empate tecnico con el siguiente: se esta cerca de un limite y elegir seria
  // adivinar. Ver MARGEN_AMBIGUEDAD_KM.
  const segundo = porDistancia[1];
  if (segundo && segundo.km - primero.km < MARGEN_AMBIGUEDAD_KM) return null;

  return primero.municipio;
}
