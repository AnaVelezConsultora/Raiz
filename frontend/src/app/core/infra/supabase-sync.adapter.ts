import { Injectable } from '@angular/core';
// `import type` se borra en compilacion: el cliente real se carga bajo demanda mas
// abajo, de modo que supabase-js no entra en el bundle inicial. En una conexion
// rural, cada kilobyte de la primera carga lo paga el voluntario en datos y espera.
import type { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Caso, FotoLocal } from '../domain/caso.model';
import {
  ResultadoEnvioCaso,
  ResultadoEnvioFoto,
  SincronizacionPort
} from '../domain/ports';

/** Fila enviada a la tabla `familias`. Los nombres replican las columnas de PostgreSQL. */
interface FilaFamilia {
  origen_id: string;
  fecha_registro: string;
  registrador_nombre: string;
  registrador_org: string | null;
  registrador_tel: string | null;
  fuente_dato: string;
  consentimiento: boolean;
  departamento: string;
  municipio: string;
  zona: string;
  vereda: string | null;
  corregimiento: string | null;
  barrio: string | null;
  comuna: string | null;
  direccion_ref: string | null;
  lat: number | null;
  lon: number | null;
  gps_fuente: string;
  jefe_nombres: string | null;
  jefe_apellidos: string | null;
  tipo_doc: string | null;
  num_doc: string | null;
  tel_1: string;
  tel_2: string | null;
  personas_total: number;
  h_0_5: number; m_0_5: number;
  h_6_11: number; m_6_11: number;
  h_12_17: number; m_12_17: number;
  h_18_59: number; m_18_59: number;
  h_60: number; m_60: number;
  gestantes: number;
  lactantes: number;
  discapacidad_n: number;
  afiliacion: string[];
  aplica_convenio: boolean;
  prioridad: string;
  necesidades_inmediatas: string[];
  observaciones: string | null;
  estado_verificacion: string;
}

/** Respuesta del insert: el servidor devuelve el consecutivo institucional. */
interface RespuestaFamilia {
  id: number;
  codigo: string;
}

/**
 * Adaptador de transporte hacia Supabase.
 *
 * Implementa {@link SincronizacionPort}. Es la unica clase del proyecto que conoce
 * Supabase: reemplazarla por un cliente contra un backend propio no toca ni el
 * dominio ni los componentes.
 *
 * Idempotencia: se envia `origen_id` (el UUID local del dispositivo) con
 * `onConflict: 'origen_id'`. Si el envio llega al servidor pero la respuesta se
 * pierde por corte de senal, el reintento actualiza la misma fila en lugar de crear
 * un duplicado. En un censo, un duplicado silencioso es peor que un fallo visible.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class SupabaseSyncAdapter implements SincronizacionPort {
  private cliente: SupabaseClient | null = null;

  /**
   * True solo si hay configuracion y el servidor responde.
   * Mientras no se configure Supabase, la aplicacion funciona completa en modo local.
   */
  async disponible(): Promise<boolean> {
    const cliente = await this.obtenerCliente();
    if (!cliente) return false;

    try {
      const { error } = await cliente.from('familias').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  async enviarCaso(caso: Caso): Promise<ResultadoEnvioCaso> {
    const cliente = await this.obtenerCliente();
    if (!cliente) {
      return { exito: false, error: 'Supabase no esta configurado.', reintentable: false };
    }

    try {
      const { data, error } = await cliente
        .from('familias')
        .upsert(this.aFila(caso), { onConflict: 'origen_id' })
        .select('id, codigo')
        .single<RespuestaFamilia>();

      if (error) {
        return {
          exito: false,
          error: error.message,
          reintentable: this.esReintentable(error.code)
        };
      }

      return { exito: true, codigoAsignado: data.codigo, reintentable: false };
    } catch (e) {
      // Excepcion sin respuesta del servidor: casi siempre es la red. Se reintenta.
      return { exito: false, error: this.mensaje(e), reintentable: true };
    }
  }

  async enviarFoto(foto: FotoLocal): Promise<ResultadoEnvioFoto> {
    const cliente = await this.obtenerCliente();
    if (!cliente) {
      return { exito: false, error: 'Supabase no esta configurado.', reintentable: false };
    }

    const ruta = `${foto.casoId}/${foto.tipo}-${foto.id}.jpg`;

    try {
      const { error } = await cliente.storage
        .from(environment.bucketFotos)
        .upload(ruta, foto.blob, { contentType: 'image/jpeg', upsert: true });

      if (error) {
        return { exito: false, error: error.message, reintentable: true };
      }

      return { exito: true, urlRemota: ruta, reintentable: false };
    } catch (e) {
      return { exito: false, error: this.mensaje(e), reintentable: true };
    }
  }

  /**
   * Carga supabase-js la primera vez que se necesita y memoriza el cliente.
   * Si no hay configuracion, retorna null y la aplicacion opera 100% local.
   */
  private async obtenerCliente(): Promise<SupabaseClient | null> {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;
    if (this.cliente) return this.cliente;

    const { createClient } = await import('@supabase/supabase-js');
    this.cliente = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    return this.cliente;
  }

  private aFila(caso: Caso): FilaFamilia {
    const c = caso.hogar.composicion;
    const v = caso.hogar.vulnerabilidad;

    // Sin consentimiento no viaja identidad. La regla se aplica aqui, en el borde
    // de salida, para que ningun camino de la interfaz pueda saltarsela.
    const conIdentidad = caso.control.consentimiento;

    return {
      origen_id: caso.id,
      fecha_registro: caso.control.fechaRegistro,
      registrador_nombre: caso.control.registradorNombre,
      registrador_org: caso.control.registradorOrg,
      registrador_tel: caso.control.registradorTel,
      fuente_dato: caso.control.fuenteDato,
      consentimiento: caso.control.consentimiento,
      departamento: caso.ubicacion.departamento,
      municipio: caso.ubicacion.municipio,
      zona: caso.ubicacion.zona,
      vereda: caso.ubicacion.vereda,
      corregimiento: caso.ubicacion.corregimiento,
      barrio: caso.ubicacion.barrio,
      comuna: caso.ubicacion.comuna,
      direccion_ref: caso.ubicacion.direccionRef,
      lat: caso.ubicacion.lat,
      lon: caso.ubicacion.lon,
      gps_fuente: caso.ubicacion.gpsFuente,
      jefe_nombres: conIdentidad ? caso.hogar.jefeNombres : null,
      jefe_apellidos: conIdentidad ? caso.hogar.jefeApellidos : null,
      tipo_doc: conIdentidad ? caso.hogar.tipoDoc : null,
      num_doc: conIdentidad ? caso.hogar.numDoc : null,
      tel_1: caso.hogar.tel1,
      tel_2: caso.hogar.tel2,
      personas_total: caso.hogar.personasTotal,
      h_0_5: c.h0a5, m_0_5: c.m0a5,
      h_6_11: c.h6a11, m_6_11: c.m6a11,
      h_12_17: c.h12a17, m_12_17: c.m12a17,
      h_18_59: c.h18a59, m_18_59: c.m18a59,
      h_60: c.h60mas, m_60: c.m60mas,
      gestantes: v.gestantes,
      lactantes: v.lactantes,
      discapacidad_n: v.discapacidadN,
      afiliacion: caso.hogar.afiliacion,
      aplica_convenio: caso.anexoConvenio?.aplicaConvenio ?? false,
      prioridad: caso.triaje?.prioridad ?? 'p3',
      necesidades_inmediatas: caso.triaje?.necesidadesInmediatas ?? [],
      observaciones: caso.triaje?.observaciones ?? null,
      estado_verificacion: 'reportado'
    };
  }

  /**
   * Un error con codigo de PostgreSQL es un rechazo de datos y reintentarlo no
   * cambia nada: se marca como no reintentable para que la mesa lo revise.
   * La ausencia de codigo indica fallo de transporte y si se reintenta.
   */
  private esReintentable(codigo: string | undefined): boolean {
    return codigo === undefined || codigo === '';
  }

  private mensaje(error: unknown): string {
    return error instanceof Error ? error.message : 'Fallo de red durante el envio.';
  }
}
