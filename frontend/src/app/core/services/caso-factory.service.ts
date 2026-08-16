import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Caso, ComposicionHogar, Vulnerabilidad } from '../domain/caso.model';
import {
  EstadoCaso,
  EstadoSync,
  FuenteCoordenada,
  FuenteDato,
  LugarPernocta,
  Tenencia,
  Zona
} from '../domain/enums';

/** Datos del voluntario que se recuerdan entre registros. */
export interface PerfilRegistrador {
  nombre: string;
  organizacion: string | null;
  telefono: string | null;
}

/**
 * Construccion de casos nuevos e identidad del dispositivo.
 *
 * SOBRE EL CODIGO DEL CASO: el consecutivo institucional RZ-AAAA-NNNNNN lo asigna el
 * SERVIDOR. Generarlo en el celular produciria colisiones, porque dos voluntarios
 * sin senal en dos veredas distintas generarian el mismo numero y al sincronizar
 * habria dos casos RZ-2026-000042.
 *
 * Mientras tanto el dispositivo muestra un codigo local con el prefijo del
 * dispositivo, por ejemplo `L-7F3A-004`, que sirve para que el voluntario nombre el
 * caso por radio o por telefono antes de sincronizar. Al confirmar el envio, el
 * servidor devuelve el codigo definitivo y la aplicacion lo reemplaza.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class CasoFactoryService {
  private static readonly CLAVE_DISPOSITIVO = 'raiz.dispositivo';
  private static readonly CLAVE_CONSECUTIVO = 'raiz.consecutivo';
  private static readonly CLAVE_PERFIL = 'raiz.registrador';

  /** Identificador estable del dispositivo. Se genera una vez y persiste. */
  obtenerDispositivoId(): string {
    const guardado = localStorage.getItem(CasoFactoryService.CLAVE_DISPOSITIVO);
    if (guardado) return guardado;

    const nuevo = crypto.randomUUID();
    localStorage.setItem(CasoFactoryService.CLAVE_DISPOSITIVO, nuevo);
    return nuevo;
  }

  /** Prefijo corto y legible del dispositivo, para decirlo en voz alta por telefono. */
  obtenerPrefijoDispositivo(): string {
    return this.obtenerDispositivoId().slice(0, 4).toUpperCase();
  }

  guardarPerfil(perfil: PerfilRegistrador): void {
    localStorage.setItem(CasoFactoryService.CLAVE_PERFIL, JSON.stringify(perfil));
  }

  obtenerPerfil(): PerfilRegistrador | null {
    const crudo = localStorage.getItem(CasoFactoryService.CLAVE_PERFIL);
    if (!crudo) return null;
    try {
      return JSON.parse(crudo) as PerfilRegistrador;
    } catch {
      return null;
    }
  }

  /**
   * Crea un caso vacio listo para el formulario por pasos.
   *
   * @param zona Zona seleccionada en el primer paso. Define que anexo se activa.
   */
  crear(zona: Zona): Caso {
    const ahora = new Date().toISOString();
    const perfil = this.obtenerPerfil();

    return {
      id: crypto.randomUUID(),
      codigo: null,
      codigoLocal: this.siguienteCodigoLocal(),
      estado: EstadoCaso.Reportado,
      control: {
        registradorNombre: perfil?.nombre ?? '',
        registradorOrg: perfil?.organizacion ?? null,
        registradorTel: perfil?.telefono ?? null,
        fuenteDato: FuenteDato.Presencial,
        consentimiento: null,
        fechaRegistro: ahora.slice(0, 10)
      },
      ubicacion: {
        departamento: environment.departamentoPorDefecto,
        municipio: environment.municipioPorDefecto,
        zona,
        vereda: null,
        corregimiento: null,
        barrio: null,
        comuna: null,
        direccionRef: null,
        lat: null,
        lon: null,
        precisionM: null,
        gpsFuente: FuenteCoordenada.NoDisponible
      },
      hogar: {
        jefeNombres: null,
        jefeApellidos: null,
        tipoDoc: null,
        numDoc: null,
        tel1: '',
        tel1Whatsapp: null,
        tel2: null,
        personasTotal: 0,
        composicion: this.composicionVacia(),
        vulnerabilidad: this.vulnerabilidadVacia(),
        afiliacion: [],
        afiliacionCual: null
      },
      vivienda: null,
      anexoRural: null,
      anexoUrbano: null,
      anexoConvenio: null,
      triaje: null,
      pasoCompletado: 0,
      creadoEn: ahora,
      actualizadoEn: ahora,
      dispositivoId: this.obtenerDispositivoId(),
      meta: {
        estadoSync: EstadoSync.Pendiente,
        intentos: 0,
        ultimoError: null,
        ultimoIntentoEn: null,
        sincronizadoEn: null
      }
    };
  }

  /**
   * Crea el caso de OTRA familia que vivia en la misma casa o estructura.
   *
   * La unidad de registro es el hogar y no la vivienda, porque un inmueble puede
   * alojar tres familias damnificadas y contar viviendas subestima la emergencia. Pero
   * hasta ahora esa decision se la cobrabamos al voluntario: para la segunda familia
   * tenia que volver a la lista y reescribir vereda, punto de referencia y coordenada,
   * de pie y con la gente esperando. Cuatro familias eran cuatro veces lo mismo.
   *
   * QUE SE COPIA Y QUE NO, Y POR QUE
   *
   * Se copia el LUGAR, que es lo unico que de verdad comparten: departamento,
   * municipio, zona, vereda, barrio, punto de referencia y la coordenada ya tomada.
   * Tambien quien registra, que es la misma persona en la misma visita.
   *
   * NO se copia nada del hogar: ni nombre, ni documento, ni telefono, ni cuantos son,
   * ni condiciones especiales. Son otra familia.
   *
   * NO se copia la autorizacion de tratamiento de datos, aunque la anterior la haya
   * dado. El consentimiento es de cada familia y hay que volver a pedirlo; heredarlo
   * seria registrar identidad de alguien que nunca autorizo nada.
   *
   * SI se copia el estado del INMUEBLE: nivel de afectacion, riesgo de colapso, de que
   * esta hecha la casa, que servicios se interrumpieron y cuantas familias vivian ahi.
   * La grieta es la misma grieta para las tres familias. Volver a preguntarlo no solo
   * repite trabajo: invita a que la misma casa quede con "severo" en un registro y
   * "moderado" en el siguiente, y entonces la entidad recibe dos verdades del mismo
   * predio y ninguna sirve.
   *
   * NO se copia lo que es de cada familia aunque este en el mismo bloque:
   *
   *  - TENENCIA. En una misma casa puede haber un propietario y un arrendatario, y de
   *    ese campo depende si la familia aplica a subsidio de arriendo.
   *  - DONDE DUERME HOY. Una familia se fue donde un pariente y otra quedo en carpa.
   *  - QUE REQUIERE LA VIVIENDA. Es la necesidad de cada hogar, no del edificio.
   *
   * Todo lo copiado queda editable y el paso 3 avisa que viene del registro anterior,
   * para que nadie lo herede sin mirar.
   */
  crearEnMismaEstructura(base: Caso): Caso {
    const nuevo = this.crear(base.ubicacion.zona);

    nuevo.ubicacion = { ...base.ubicacion };
    nuevo.control = {
      ...nuevo.control,
      fuenteDato: base.control.fuenteDato,
      consentimiento: null
    };

    if (base.vivienda) {
      nuevo.vivienda = {
        ...base.vivienda,
        // De la familia, no del inmueble: quedan sin responder a proposito.
        // El "sin responder" se representa como null, igual que en el formulario; los
        // tipos del modelo todavia los declaran obligatorios y eso hay que alinearlo
        // cuando aterrice la rama que toca caso.model.ts.
        tenencia: null as unknown as Tenencia,
        dondeDuerme: null as unknown as LugarPernocta,
        requiereVivienda: []
      };
    }

    return nuevo;
  }

  private siguienteCodigoLocal(): string {
    const actual = Number(localStorage.getItem(CasoFactoryService.CLAVE_CONSECUTIVO) ?? '0');
    const siguiente = actual + 1;
    localStorage.setItem(CasoFactoryService.CLAVE_CONSECUTIVO, String(siguiente));
    return `L-${this.obtenerPrefijoDispositivo()}-${String(siguiente).padStart(3, '0')}`;
  }

  private composicionVacia(): ComposicionHogar {
    return {
      h0a5: 0, m0a5: 0,
      h6a11: 0, m6a11: 0,
      h12a17: 0, m12a17: 0,
      h18a59: 0, m18a59: 0,
      h60mas: 0, m60mas: 0
    };
  }

  private vulnerabilidadVacia(): Vulnerabilidad {
    return {
      gestantes: 0,
      lactantes: 0,
      discapacidadN: 0,
      discapacidadTipo: [],
      enfCronicaN: 0,
      requiereMedicamento: null,
      medicamentoCual: null,
      etnia: null,
      victimaConflicto: null
    };
  }
}
