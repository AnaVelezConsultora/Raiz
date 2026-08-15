import { InjectionToken } from '@angular/core';
import { Caso, FiltroCasos, FotoLocal, ResumenCaso } from './caso.model';

/**
 * Puertos del dominio (Dependency Inversion).
 *
 * Los servicios de aplicacion dependen de estas abstracciones, no de Dexie ni de
 * Supabase. Cuando la fase 3 reemplace Supabase por un backend propio, cambia una
 * sola clase adaptadora y ningun componente se entera.
 *
 * @version 0.1.0
 */

/** Parametros para actualizar el estado de sincronizacion de un caso. */
export interface MarcarSyncParams {
  casoId: string;
  sincronizado: boolean;
  codigoAsignado?: string;
  error?: string;
}

/** Almacenamiento local de casos. Debe funcionar sin conexion. */
export interface CasoStoragePort {
  guardar(caso: Caso): Promise<string>;
  obtener(casoId: string): Promise<Caso | undefined>;
  listar(filtro?: FiltroCasos): Promise<ResumenCaso[]>;
  pendientesDeSync(limite?: number): Promise<Caso[]>;
  marcarSync(params: MarcarSyncParams): Promise<void>;
  contarPendientes(): Promise<number>;
  /**
   * Borra un caso y sus fotografias del dispositivo.
   *
   * Solo tiene sentido sobre un caso que NO se ha enviado. Un caso ya sincronizado
   * existe en el servidor y borrarlo aqui no lo borra alla: eso es supresion de datos
   * y se pide por el canal del custodio, no desde un boton en el celular.
   */
  eliminar(casoId: string): Promise<void>;
  eliminarSincronizadosAntesDe(fechaIso: string): Promise<number>;
}

/** Almacenamiento local de fotografias. */
export interface FotoStoragePort {
  guardar(foto: FotoLocal): Promise<string>;
  porCaso(casoId: string): Promise<FotoLocal[]>;
  pendientesDeSync(limite?: number): Promise<FotoLocal[]>;
  marcarSync(params: { fotoId: string; urlRemota?: string; error?: string }): Promise<void>;
  contarPendientes(): Promise<number>;
  /** Peso total de lo pendiente, para avisar cuanto se va a gastar antes de gastarlo. */
  bytesPendientes(): Promise<number>;
  eliminar(fotoId: string): Promise<void>;
}

/** Resultado del envio de un caso al servidor. */
export interface ResultadoEnvioCaso {
  exito: boolean;
  /** Consecutivo institucional RZ-AAAA-NNNNNN asignado por el servidor. */
  codigoAsignado?: string;
  error?: string;
  /** True cuando el error es transitorio (red, 5xx) y conviene reintentar. */
  reintentable: boolean;
}

/** Resultado de la subida de una fotografia. */
export interface ResultadoEnvioFoto {
  exito: boolean;
  urlRemota?: string;
  error?: string;
  reintentable: boolean;
}

/** Transporte hacia el servidor. Lo implementa el adaptador de Supabase. */
export interface SincronizacionPort {
  disponible(): Promise<boolean>;
  enviarCaso(caso: Caso): Promise<ResultadoEnvioCaso>;
  enviarFoto(foto: FotoLocal): Promise<ResultadoEnvioFoto>;
}

export const CASO_STORAGE = new InjectionToken<CasoStoragePort>('CASO_STORAGE');
export const FOTO_STORAGE = new InjectionToken<FotoStoragePort>('FOTO_STORAGE');
export const SINCRONIZACION = new InjectionToken<SincronizacionPort>('SINCRONIZACION');
