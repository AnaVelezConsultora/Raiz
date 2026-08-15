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
 * De ahi salieron dos correcciones, y la de fondo no fue esta: fue completar la
 * tabla con los cuatro departamentos enteros. Un municipio que falta hace ganar al
 * vecino, y ningun radio arregla eso.
 *
 * Diez kilometros, con la tabla completa, cubre buena parte de las veredas sin
 * llegar al municipio de al lado. La consecuencia conocida es que en una vereda muy
 * lejana del casco se responde "Colombia" aunque la persona SI este en ese
 * municipio. Es el error que se prefiere.
 */
export const RADIO_MAXIMO_KM = 10;

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
 * Los cuatro departamentos del Eje Cafetero, completos.
 *
 * Risaralda (14), Caldas (27), Quindio (12) y Valle del Cauca (42): 95 municipios,
 * todos los que tienen esos departamentos.
 *
 * POR QUE COMPLETOS Y NO SOLO LOS DE LA ZONA AFECTADA
 *
 * Porque un municipio que FALTA no produce un error: produce una respuesta
 * equivocada. El de al lado gana por cercania y se muestra con la misma confianza
 * que uno correcto. Fue lo que paso con Pereira, que no estaba, y devolvio "Ulloa"
 * a alguien parado en el centro de la ciudad.
 *
 * Con el departamento completo eso deja de ser posible dentro de el: siempre existe
 * el municipio verdadero y siempre esta mas cerca que sus vecinos. La cobertura
 * parcial es el problema; el algoritmo solo lo hacia visible.
 *
 * Quindio entra aunque no lo pidiera nadie: Sevilla limita con el, y dejarlo fuera
 * reintroduciria exactamente el fallo que esta lista corrige — alguien en Genova o
 * Pijao veria un municipio del Valle.
 *
 * QUE SIGUE SIENDO DEBIL
 *
 * Son coordenadas de la cabecera municipal escritas a mano, no poligonos. Un error
 * de tecleo aqui se ve como un municipio equivocado en la cabecera de alguien, y no
 * hay nada en el codigo que lo detecte. El reemplazo correcto sigue siendo el
 * listado oficial del DANE, y este archivo esta hecho para reemplazarse entero.
 *
 * Fuera de estos cuatro departamentos se responde "Colombia", que es la respuesta
 * honesta: no hay datos para decir otra cosa.
 */
export const MUNICIPIOS: readonly Municipio[] = [
  // --- Risaralda (14) ---
  { nombre: 'Pereira', departamento: 'Risaralda', lat: 4.8133, lon: -75.6961 },
  { nombre: 'Dosquebradas', departamento: 'Risaralda', lat: 4.834, lon: -75.676 },
  { nombre: 'Santa Rosa de Cabal', departamento: 'Risaralda', lat: 4.869, lon: -75.621 },
  { nombre: 'Marsella', departamento: 'Risaralda', lat: 4.937, lon: -75.74 },
  { nombre: 'La Virginia', departamento: 'Risaralda', lat: 4.899, lon: -75.883 },
  { nombre: 'Balboa', departamento: 'Risaralda', lat: 4.95, lon: -75.958 },
  { nombre: 'Apía', departamento: 'Risaralda', lat: 5.106, lon: -75.941 },
  { nombre: 'Santuario', departamento: 'Risaralda', lat: 5.074, lon: -75.964 },
  { nombre: 'La Celia', departamento: 'Risaralda', lat: 5.003, lon: -76.002 },
  { nombre: 'Belén de Umbría', departamento: 'Risaralda', lat: 5.2, lon: -75.867 },
  { nombre: 'Mistrató', departamento: 'Risaralda', lat: 5.296, lon: -75.883 },
  { nombre: 'Guática', departamento: 'Risaralda', lat: 5.316, lon: -75.799 },
  { nombre: 'Quinchía', departamento: 'Risaralda', lat: 5.34, lon: -75.73 },
  { nombre: 'Pueblo Rico', departamento: 'Risaralda', lat: 5.221, lon: -76.031 },

  // --- Caldas (27) ---
  { nombre: 'Manizales', departamento: 'Caldas', lat: 5.07, lon: -75.517 },
  { nombre: 'Villamaría', departamento: 'Caldas', lat: 5.045, lon: -75.512 },
  { nombre: 'Chinchiná', departamento: 'Caldas', lat: 4.982, lon: -75.607 },
  { nombre: 'Palestina', departamento: 'Caldas', lat: 5.018, lon: -75.622 },
  { nombre: 'Neira', departamento: 'Caldas', lat: 5.166, lon: -75.52 },
  { nombre: 'Aranzazu', departamento: 'Caldas', lat: 5.271, lon: -75.491 },
  { nombre: 'Salamina', departamento: 'Caldas', lat: 5.403, lon: -75.487 },
  { nombre: 'Pácora', departamento: 'Caldas', lat: 5.529, lon: -75.461 },
  { nombre: 'Aguadas', departamento: 'Caldas', lat: 5.61, lon: -75.456 },
  { nombre: 'La Merced', departamento: 'Caldas', lat: 5.395, lon: -75.546 },
  { nombre: 'Filadelfia', departamento: 'Caldas', lat: 5.296, lon: -75.562 },
  { nombre: 'Marmato', departamento: 'Caldas', lat: 5.474, lon: -75.598 },
  { nombre: 'Supía', departamento: 'Caldas', lat: 5.453, lon: -75.65 },
  { nombre: 'Riosucio', departamento: 'Caldas', lat: 5.421, lon: -75.703 },
  { nombre: 'Anserma', departamento: 'Caldas', lat: 5.237, lon: -75.783 },
  { nombre: 'Risaralda', departamento: 'Caldas', lat: 5.162, lon: -75.766 },
  { nombre: 'San José', departamento: 'Caldas', lat: 5.083, lon: -75.79 },
  { nombre: 'Belalcázar', departamento: 'Caldas', lat: 4.993, lon: -75.811 },
  { nombre: 'Viterbo', departamento: 'Caldas', lat: 5.062, lon: -75.871 },
  { nombre: 'Marquetalia', departamento: 'Caldas', lat: 5.298, lon: -75.053 },
  { nombre: 'Manzanares', departamento: 'Caldas', lat: 5.257, lon: -75.153 },
  { nombre: 'Pensilvania', departamento: 'Caldas', lat: 5.383, lon: -75.161 },
  { nombre: 'Marulanda', departamento: 'Caldas', lat: 5.284, lon: -75.262 },
  { nombre: 'Samaná', departamento: 'Caldas', lat: 5.413, lon: -74.993 },
  { nombre: 'Norcasia', departamento: 'Caldas', lat: 5.575, lon: -74.889 },
  { nombre: 'Victoria', departamento: 'Caldas', lat: 5.317, lon: -74.911 },
  { nombre: 'La Dorada', departamento: 'Caldas', lat: 5.45, lon: -74.663 },

  // --- Quindío (12) ---
  { nombre: 'Armenia', departamento: 'Quindío', lat: 4.534, lon: -75.681 },
  { nombre: 'Calarcá', departamento: 'Quindío', lat: 4.523, lon: -75.644 },
  { nombre: 'Circasia', departamento: 'Quindío', lat: 4.615, lon: -75.636 },
  { nombre: 'Filandia', departamento: 'Quindío', lat: 4.674, lon: -75.658 },
  { nombre: 'Salento', departamento: 'Quindío', lat: 4.637, lon: -75.57 },
  { nombre: 'Montenegro', departamento: 'Quindío', lat: 4.566, lon: -75.75 },
  { nombre: 'Quimbaya', departamento: 'Quindío', lat: 4.622, lon: -75.764 },
  { nombre: 'La Tebaida', departamento: 'Quindío', lat: 4.452, lon: -75.786 },
  { nombre: 'Córdoba', departamento: 'Quindío', lat: 4.392, lon: -75.687 },
  { nombre: 'Buenavista', departamento: 'Quindío', lat: 4.36, lon: -75.74 },
  { nombre: 'Pijao', departamento: 'Quindío', lat: 4.334, lon: -75.703 },
  { nombre: 'Génova', departamento: 'Quindío', lat: 4.207, lon: -75.79 },

  // --- Valle del Cauca (42) ---
  { nombre: 'Cali', departamento: 'Valle del Cauca', lat: 3.4516, lon: -76.532 },
  { nombre: 'Yumbo', departamento: 'Valle del Cauca', lat: 3.585, lon: -76.496 },
  { nombre: 'Palmira', departamento: 'Valle del Cauca', lat: 3.5394, lon: -76.3036 },
  { nombre: 'Jamundí', departamento: 'Valle del Cauca', lat: 3.261, lon: -76.539 },
  { nombre: 'Candelaria', departamento: 'Valle del Cauca', lat: 3.409, lon: -76.348 },
  { nombre: 'Florida', departamento: 'Valle del Cauca', lat: 3.323, lon: -76.234 },
  { nombre: 'Pradera', departamento: 'Valle del Cauca', lat: 3.42, lon: -76.241 },
  { nombre: 'El Cerrito', departamento: 'Valle del Cauca', lat: 3.686, lon: -76.312 },
  { nombre: 'Ginebra', departamento: 'Valle del Cauca', lat: 3.724, lon: -76.266 },
  { nombre: 'Guacarí', departamento: 'Valle del Cauca', lat: 3.764, lon: -76.332 },
  { nombre: 'Vijes', departamento: 'Valle del Cauca', lat: 3.698, lon: -76.441 },
  { nombre: 'Yotoco', departamento: 'Valle del Cauca', lat: 3.861, lon: -76.383 },
  { nombre: 'Restrepo', departamento: 'Valle del Cauca', lat: 3.829, lon: -76.523 },
  { nombre: 'La Cumbre', departamento: 'Valle del Cauca', lat: 3.648, lon: -76.567 },
  { nombre: 'Dagua', departamento: 'Valle del Cauca', lat: 3.657, lon: -76.689 },
  { nombre: 'Buenaventura', departamento: 'Valle del Cauca', lat: 3.8801, lon: -77.0313 },
  { nombre: 'Calima (El Darién)', departamento: 'Valle del Cauca', lat: 3.926, lon: -76.488 },
  { nombre: 'Guadalajara de Buga', departamento: 'Valle del Cauca', lat: 3.901, lon: -76.298 },
  { nombre: 'San Pedro', departamento: 'Valle del Cauca', lat: 3.995, lon: -76.229 },
  { nombre: 'Tuluá', departamento: 'Valle del Cauca', lat: 4.085, lon: -76.196 },
  { nombre: 'Andalucía', departamento: 'Valle del Cauca', lat: 4.172, lon: -76.165 },
  { nombre: 'Bugalagrande', departamento: 'Valle del Cauca', lat: 4.211, lon: -76.159 },
  { nombre: 'Riofrío', departamento: 'Valle del Cauca', lat: 4.156, lon: -76.288 },
  { nombre: 'Trujillo', departamento: 'Valle del Cauca', lat: 4.217, lon: -76.321 },
  { nombre: 'Sevilla', departamento: 'Valle del Cauca', lat: 4.271, lon: -75.934 },
  { nombre: 'Caicedonia', departamento: 'Valle del Cauca', lat: 4.334, lon: -75.83 },
  { nombre: 'Bolívar', departamento: 'Valle del Cauca', lat: 4.338, lon: -76.183 },
  { nombre: 'Zarzal', departamento: 'Valle del Cauca', lat: 4.394, lon: -76.071 },
  { nombre: 'Roldanillo', departamento: 'Valle del Cauca', lat: 4.413, lon: -76.154 },
  { nombre: 'La Unión', departamento: 'Valle del Cauca', lat: 4.534, lon: -76.1 },
  { nombre: 'La Victoria', departamento: 'Valle del Cauca', lat: 4.523, lon: -76.037 },
  { nombre: 'Obando', departamento: 'Valle del Cauca', lat: 4.574, lon: -75.977 },
  { nombre: 'El Dovio', departamento: 'Valle del Cauca', lat: 4.51, lon: -76.236 },
  { nombre: 'Versalles', departamento: 'Valle del Cauca', lat: 4.575, lon: -76.197 },
  { nombre: 'Toro', departamento: 'Valle del Cauca', lat: 4.609, lon: -76.079 },
  { nombre: 'Alcalá', departamento: 'Valle del Cauca', lat: 4.672, lon: -75.781 },
  { nombre: 'Ulloa', departamento: 'Valle del Cauca', lat: 4.703, lon: -75.737 },
  { nombre: 'Argelia', departamento: 'Valle del Cauca', lat: 4.727, lon: -76.12 },
  { nombre: 'Cartago', departamento: 'Valle del Cauca', lat: 4.746, lon: -75.911 },
  { nombre: 'El Cairo', departamento: 'Valle del Cauca', lat: 4.762, lon: -76.223 },
  { nombre: 'Ansermanuevo', departamento: 'Valle del Cauca', lat: 4.794, lon: -75.995 },
  { nombre: 'El Águila', departamento: 'Valle del Cauca', lat: 4.907, lon: -76.029 }
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
