import { EstadoCaso, EstadoSync, Prioridad, TipoFoto, Zona } from './enums';
import type {
  AnexoConvenio,
  AnexoRural,
  AnexoUrbano,
  Control,
  Hogar,
  Triaje,
  Ubicacion,
  Vivienda
} from '@raiz/dominio';

/**
 * Los bloques que CRUZAN LA RED no se declaran aqui: vienen de `@raiz/dominio`, el
 * paquete que comparten la PWA y la API, y se reexportan para no reescribir los
 * imports existentes.
 *
 * Control, Ubicacion, ComposicionHogar, Vulnerabilidad, Hogar, Vivienda, AnexoRural,
 * AnexoUrbano, AnexoConvenio y Triaje son contrato. Escritos dos veces, que el cliente
 * y el servidor coincidan es una intencion; escritos una sola vez, es una propiedad.
 *
 * Lo que sigue declarado abajo es lo que SOLO existe en el dispositivo y nunca viaja:
 * el estado de la cola, el Blob de la fotografia, el codigo local provisional y las
 * formas de consulta del listado.
 */
export * from '@raiz/dominio';

/** Metadatos de sincronizacion. Viven solo en el dispositivo, no viajan al servidor. */
export interface MetaSync {
  estadoSync: EstadoSync;
  intentos: number;
  ultimoError: string | null;
  ultimoIntentoEn: string | null;
  sincronizadoEn: string | null;
}

/**
 * Fotografia asociada al caso.
 *
 * El binario se guarda como Blob en IndexedDB y se sube por separado del caso: una
 * conexion rural puede alcanzar para el registro de texto y no para tres imagenes.
 * Registro y fotos sincronizan de forma independiente.
 */
export interface FotoLocal {
  id: string;
  casoId: string;
  tipo: TipoFoto;
  blob: Blob;
  bytes: number;
  ancho: number;
  alto: number;
  capturadaEn: string;
  urlRemota: string | null;
  meta: MetaSync;
}

/**
 * Caso completo tal como vive en el dispositivo.
 *
 * `id` es un UUID generado localmente y es la clave con la que trabajan la PWA y la
 * cola de sincronizacion. `codigo` es el consecutivo institucional RZ-AAAA-NNNNNN y lo
 * asigna el SERVIDOR: dos voluntarios sin senal generarian el mismo numero, de modo
 * que en el dispositivo se muestra `codigoLocal` hasta que el servidor confirme.
 */
export interface Caso {
  id: string;
  codigo: string | null;
  codigoLocal: string;
  estado: EstadoCaso;
  control: Control;
  ubicacion: Ubicacion;
  hogar: Hogar;
  vivienda: Vivienda | null;
  anexoRural: AnexoRural | null;
  anexoUrbano: AnexoUrbano | null;
  anexoConvenio: AnexoConvenio | null;
  triaje: Triaje | null;
  /** Ultimo paso del formulario completado. Permite retomar un registro a medias. */
  pasoCompletado: number;
  creadoEn: string;
  actualizadoEn: string;
  dispositivoId: string;
  meta: MetaSync;
}

/** Criterios de consulta sobre el almacenamiento local. */
export interface FiltroCasos {
  zona?: Zona;
  prioridad?: Prioridad;
  estado?: EstadoCaso;
  estadoSync?: EstadoSync;
  texto?: string;
  limite?: number;
}

/** Resumen para las listas y el tablero, sin cargar el caso completo. */
export interface ResumenCaso {
  id: string;
  codigo: string;
  responsable: string;
  lugar: string;
  zona: Zona;
  personasTotal: number;
  prioridad: Prioridad | null;
  estado: EstadoCaso;
  estadoSync: EstadoSync;
  tieneCoordenada: boolean;
  nFotos: number;
  actualizadoEn: string;
}
