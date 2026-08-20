import { EstadoServicio, NivelVerificacion, OrigenDato, TipoPunto, Zona } from './enums';

/**
 * Un punto de servicio: la infraestructura de la que dependen varios hogares.
 *
 * Es la otra unidad de Raiz. El caso responde «que le paso a esta familia»; el punto
 * responde «que se dano que le sirve a muchas». Una entidad prioriza obras con la
 * segunda, no con la primera.
 *
 * @version 0.1.0
 */
export interface PuntoServicio {
  /** UUID generado en el dispositivo. Clave de idempotencia del envio. */
  id: string;
  /** Consecutivo institucional PS-AAAA-NNNN. Lo asigna el servidor, no el celular. */
  codigo: string | null;

  tipo: TipoPunto;
  /** Como lo llama la gente: «Acueducto La Cumbre». No un codigo tecnico. */
  nombre: string;

  ubicacion: UbicacionPunto;

  estadoServicio: EstadoServicio;
  descripcionAfectacion: string | null;
  /** Que hace falta para que vuelva a funcionar. Texto libre: es lo que la entidad lee. */
  requiere: string | null;

  /**
   * Cuantos hogares dice el lider que dependen de esto.
   *
   * Es autodeclarado y asi se presenta. NUNCA se promedia ni se reemplaza con
   * `hogaresRegistrados`: son dos hechos distintos y fundirlos destruye los dos.
   */
  hogaresEstimados: number | null;
  /** Veredas a las que sirve. De aqui sale el cruce con el censo. */
  veredasServidas: string[];

  origenDato: OrigenDato | null;
  registradorNombre: string;
  fechaRegistro: string;
}

export interface UbicacionPunto {
  departamento: string;
  municipio: string;
  zona: Zona;
  vereda: string | null;
  direccionRef: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Un punto como lo devuelve el servidor para el tablero.
 *
 * Aqui aparecen las dos cifras juntas, que es todo el punto de la pantalla:
 * `hogaresEstimados` es lo que alguien dijo, `hogaresRegistrados` es lo que Raiz puede
 * sostener con registros. La pantalla las muestra separadas y rotuladas.
 */
export interface PuntoEnTablero {
  id: number;
  codigo: string;
  tipo: TipoPunto;
  nombre: string;
  municipio: string;
  zona: Zona;
  vereda: string | null;
  direccionRef: string | null;
  lat: number | null;
  lon: number | null;
  estadoServicio: EstadoServicio;
  descripcionAfectacion: string | null;
  requiere: string | null;
  hogaresEstimados: number | null;
  /** Calculado contra el censo, no declarado. Empieza bajo y crece. */
  hogaresRegistrados: number;
  veredasServidas: string[];
  origenDato: OrigenDato | null;
  nivelVerificacion: NivelVerificacion;
  registradorNombre: string;
  fechaRegistro: string;
}

/**
 * Lo que responde el servidor al recibir un punto.
 *
 * Vive en el contrato y no en la API porque cruza la red. `yaExistia` es lo que le
 * permite a la aplicacion saber si su reintento creo el punto o solo lo actualizo, que
 * es la misma senal que ya usa el envio de casos.
 */
export interface PuntoRegistrado {
  /** El identificador que genero el dispositivo. */
  id: string;
  /** Consecutivo institucional PS-AAAA-NNNN que asigno el servidor. */
  codigo: string;
  yaExistia: boolean;
}
