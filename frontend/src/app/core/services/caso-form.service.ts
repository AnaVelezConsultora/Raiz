import { Injectable, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Caso } from '../domain/caso.model';
import {
  FuenteCoordenada,
  FuenteDato,
  Habitabilidad,
  NOMBRE_FUENTE_DATO,
  NOMBRE_HABITABILIDAD,
  NOMBRE_LUGAR_PERNOCTA,
  NOMBRE_RIESGO_VISIBLE,
  RiesgoVisible,
  Necesidad,
  OrigenDato,
  LugarPernocta,
  NivelAfectacion,
  Prioridad,
  Tenencia,
  Zona
} from '../domain/enums';

/**
 * Construccion del formulario y traduccion entre FormGroup y el modelo de dominio.
 *
 * Unica responsabilidad: el mapeo. Los componentes no arman FormGroups ni conocen la
 * forma del objeto Caso; piden el grupo, lo pintan y devuelven el caso actualizado.
 *
 * Validaciones minimas a proposito. En campo, un formulario que bloquea por un dato
 * que la familia no sabe hace que el voluntario abandone el registro completo. Se
 * exige solo lo que hace el registro utilizable: quien reporta, donde, un telefono,
 * cuantas personas y la prioridad.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class CasoFormService {
  private readonly fb = inject(FormBuilder);

  /** Construye el formulario completo con los valores del caso. */
  construir(caso: Caso): FormGroup {
    return this.fb.group({
      control: this.fb.group({
        registradorNombre: [caso.control.registradorNombre, Validators.required],
        registradorOrg: [caso.control.registradorOrg],
        registradorTel: [caso.control.registradorTel],
        fuenteDato: [caso.control.fuenteDato, Validators.required],
        origenDato: [caso.control.origenDato ?? null],
        consentimiento: [caso.control.consentimiento],
        autorizaDatosSensibles: [caso.control.autorizaDatosSensibles ?? null],
        autorizaRemisionEntidades: [caso.control.autorizaRemisionEntidades ?? null],
        versionAutorizacion: [caso.control.versionAutorizacion ?? null],
        autorizadoEn: [caso.control.autorizadoEn ?? null]
      }),
      ubicacion: this.fb.group({
        departamento: [caso.ubicacion.departamento, Validators.required],
        municipio: [caso.ubicacion.municipio, Validators.required],
        zona: [caso.ubicacion.zona, Validators.required],
        vereda: [caso.ubicacion.vereda],
        corregimiento: [caso.ubicacion.corregimiento],
        barrio: [caso.ubicacion.barrio],
        comuna: [caso.ubicacion.comuna],
        direccionRef: [caso.ubicacion.direccionRef]
      }),
      hogar: this.fb.group({
        jefeNombres: [caso.hogar.jefeNombres],
        jefeApellidos: [caso.hogar.jefeApellidos],
        tipoDoc: [caso.hogar.tipoDoc],
        numDoc: [caso.hogar.numDoc],
        tel1: [caso.hogar.tel1, Validators.required],
        tel2: [caso.hogar.tel2],
        fueraDelHogar: [caso.hogar.fueraDelHogar ?? 0],
        personasTotal: [caso.hogar.personasTotal, [Validators.required, Validators.min(1)]],
        afiliacionCual: [caso.hogar.afiliacionCual]
      }),
      composicion: this.fb.group({
        h0a5: [caso.hogar.composicion.h0a5], m0a5: [caso.hogar.composicion.m0a5],
        h6a11: [caso.hogar.composicion.h6a11], m6a11: [caso.hogar.composicion.m6a11],
        h12a17: [caso.hogar.composicion.h12a17], m12a17: [caso.hogar.composicion.m12a17],
        h18a59: [caso.hogar.composicion.h18a59], m18a59: [caso.hogar.composicion.m18a59],
        h60mas: [caso.hogar.composicion.h60mas], m60mas: [caso.hogar.composicion.m60mas]
      }),
      vulnerabilidad: this.fb.group({
        gestantes: [caso.hogar.vulnerabilidad.gestantes],
        discapacidadN: [caso.hogar.vulnerabilidad.discapacidadN],
        requiereApoyoEvacuar: [caso.hogar.vulnerabilidad.requiereApoyoEvacuar ?? 0],
        enfCronicaN: [caso.hogar.vulnerabilidad.enfCronicaN],
        fallecidos: [caso.hogar.vulnerabilidad.fallecidos ?? 0],
        heridosLeves: [caso.hogar.vulnerabilidad.heridosLeves ?? 0],
        heridosGraves: [caso.hogar.vulnerabilidad.heridosGraves ?? 0]
      }),
      vivienda: this.fb.group({
        tenencia: [caso.vivienda?.tenencia ?? Tenencia.Propietario, Validators.required],
        hogaresEnEstructura: [caso.vivienda?.hogaresEnEstructura ?? 1, Validators.min(1)],
        // Estos tres NO tienen valor por defecto, y es deliberado. Antes venian en
        // "moderado", "habitable" y "duerme en la misma vivienda": un paso que nadie
        // llenaba describia una familia sin problema. En un censo de damnificados, el
        // silencio no puede leerse como que la casa esta bien.
        afectacion: [caso.vivienda?.afectacion ?? null, Validators.required],
        habitable: [caso.vivienda?.habitable ?? null],
        riesgoColapso: [caso.vivienda?.riesgoColapso ?? false],
        riesgoColapsoDesc: [caso.vivienda?.riesgoColapsoDesc],
        dondeDuerme: [caso.vivienda?.dondeDuerme ?? null],
        habitabilidad: [caso.vivienda?.habitabilidad ?? null],
        riesgoVisible: [caso.vivienda?.riesgoVisible ?? null],
        danoDescripcion: [caso.vivienda?.danoDescripcion ?? null],
        // Nulo y no false: nulo es «no se pregunto», y decir que no ha venido nadie
        // cuando nadie pregunto es afirmar algo distinto y probablemente falso.
        visitaOficial: [caso.vivienda?.visitaOficial ?? null],
        visitaOficialEntidad: [caso.vivienda?.visitaOficialEntidad ?? null],
        visitaOficialFecha: [caso.vivienda?.visitaOficialFecha ?? null],
        visitaOficialConcepto: [caso.vivienda?.visitaOficialConcepto ?? null]
      }),
      rural: this.fb.group({
        areaHa: [caso.anexoRural?.areaHa],
        viaAcceso: [caso.anexoRural?.viaAcceso],
        areaCultivoAfectadaHa: [caso.anexoRural?.areaCultivoAfectadaHa],
        perdidaPct: [caso.anexoRural?.perdidaPct, [Validators.min(0), Validators.max(100)]],
        bovinosPerdidos: [caso.anexoRural?.bovinosPerdidos ?? 0],
        cultivosOtro: [caso.anexoRural?.cultivosOtro ?? null],
        infraProductivaOtro: [caso.anexoRural?.infraProductivaOtro ?? null],
        requiereAgroOtro: [caso.anexoRural?.requiereAgroOtro ?? null],
        maquinariaAfectada: [caso.anexoRural?.maquinariaAfectada ?? null],
        maquinariaDetalle: [caso.anexoRural?.maquinariaDetalle ?? null],
        avesPerdidas: [caso.anexoRural?.avesPerdidas ?? 0]
      }),
      urbano: this.fb.group({
        estrato: [caso.anexoUrbano?.estrato],
        perdioMedioVida: [caso.anexoUrbano?.perdioMedioVida ?? false],
        medioVidaDesc: [caso.anexoUrbano?.medioVidaDesc]
      }),
      convenio: this.fb.group({
        afiliadaFederacion: [caso.anexoConvenio?.afiliadaFederacion ?? false],
        aplicaConvenio: [caso.anexoConvenio?.aplicaConvenio ?? false]
      }),
      triaje: this.fb.group({
        prioridad: [caso.triaje?.prioridad ?? Prioridad.P3, Validators.required],
        deseaRutaApoyo: [caso.triaje?.deseaRutaApoyo ?? null],
        rutaApoyoOrganizacion: [caso.triaje?.rutaApoyoOrganizacion ?? null],
        necesidadesOtra: [caso.triaje?.necesidadesOtra ?? null],
        observaciones: [caso.triaje?.observaciones]
      })
    });
  }

  /**
   * Vuelca el formulario sobre el caso.
   *
   * Las selecciones multiples (afiliacion, cultivos, necesidades) no viven en el
   * FormGroup sino en signals del componente, porque se pintan como pastillas y no
   * como controles nativos. Por eso se reciben aparte.
   */
  aplicar(caso: Caso, form: FormGroup, seleccion: SeleccionMultiple): Caso {
    const v = form.getRawValue() as ValoresFormulario;
    const esRural = v.ubicacion.zona === Zona.Rural;

    return {
      ...caso,
      control: {
        ...caso.control,
        registradorNombre: v.control.registradorNombre,
        registradorOrg: v.control.registradorOrg,
        registradorTel: v.control.registradorTel,
        fuenteDato: v.control.fuenteDato,
        origenDato: v.control.origenDato,
        consentimiento: v.control.consentimiento,
        // Las dos autorizaciones nuevas y la prueba de que se pidieron. Las escribe
        // la pantalla de consentimiento del paso 1, en el mismo grupo de control.
        autorizaDatosSensibles: v.control.autorizaDatosSensibles,
        autorizaRemisionEntidades: v.control.autorizaRemisionEntidades,
        versionAutorizacion: v.control.versionAutorizacion,
        autorizadoEn: v.control.autorizadoEn
      },
      ubicacion: {
        ...caso.ubicacion,
        departamento: v.ubicacion.departamento,
        municipio: v.ubicacion.municipio,
        zona: v.ubicacion.zona,
        vereda: esRural ? v.ubicacion.vereda : null,
        corregimiento: esRural ? v.ubicacion.corregimiento : null,
        barrio: esRural ? null : v.ubicacion.barrio,
        comuna: esRural ? null : v.ubicacion.comuna,
        direccionRef: v.ubicacion.direccionRef
      },
      hogar: {
        ...caso.hogar,
        // Sin consentimiento no se persiste identidad, ni siquiera en el dispositivo.
        jefeNombres: v.control.consentimiento ? v.hogar.jefeNombres : null,
        jefeApellidos: v.control.consentimiento ? v.hogar.jefeApellidos : null,
        tipoDoc: v.control.consentimiento ? v.hogar.tipoDoc : null,
        numDoc: v.control.consentimiento ? v.hogar.numDoc : null,
        tel1: v.hogar.tel1,
        tel2: v.hogar.tel2,
        personasTotal: Number(v.hogar.personasTotal),
        fueraDelHogar: Number(v.hogar.fueraDelHogar ?? 0),
        composicion: {
          h0a5: Number(v.composicion.h0a5), m0a5: Number(v.composicion.m0a5),
          h6a11: Number(v.composicion.h6a11), m6a11: Number(v.composicion.m6a11),
          h12a17: Number(v.composicion.h12a17), m12a17: Number(v.composicion.m12a17),
          h18a59: Number(v.composicion.h18a59), m18a59: Number(v.composicion.m18a59),
          h60mas: Number(v.composicion.h60mas), m60mas: Number(v.composicion.m60mas)
        },
        vulnerabilidad: {
          ...caso.hogar.vulnerabilidad,
          gestantes: Number(v.vulnerabilidad.gestantes),
          requiereApoyoEvacuar: Number(v.vulnerabilidad.requiereApoyoEvacuar),
          discapacidadN: Number(v.vulnerabilidad.discapacidadN),
          enfCronicaN: Number(v.vulnerabilidad.enfCronicaN),
          fallecidos: Number(v.vulnerabilidad.fallecidos),
          heridosLeves: Number(v.vulnerabilidad.heridosLeves),
          heridosGraves: Number(v.vulnerabilidad.heridosGraves)
        },
        afiliacion: seleccion.afiliacion,
        afiliacionCual: v.hogar.afiliacionCual
      },
      vivienda: {
        ...(caso.vivienda ?? {}),
        tenencia: v.vivienda.tenencia,
        arrendadorContacto: caso.vivienda?.arrendadorContacto ?? null,
        hogaresEnEstructura: Number(v.vivienda.hogaresEnEstructura),
        tipoVivienda: caso.vivienda?.tipoVivienda ?? null,
        materialParedes: caso.vivienda?.materialParedes ?? null,
        materialTecho: caso.vivienda?.materialTecho ?? null,
        afectacion: v.vivienda.afectacion,
        habitable: v.vivienda.habitable,
        riesgoColapso: v.vivienda.riesgoColapso,
        riesgoColapsoDesc: v.vivienda.riesgoColapsoDesc,
        dondeDuerme: v.vivienda.dondeDuerme,
        requiereVivienda: seleccion.requiereVivienda,
        serviciosAfectados: seleccion.serviciosAfectados,
        habitabilidad: v.vivienda.habitabilidad,
        riesgoVisible: v.vivienda.riesgoVisible,
        danosVisibles: seleccion.danosVisibles,
        danoDescripcion: v.vivienda.danoDescripcion,
        documentosTenencia: seleccion.documentosTenencia,
        visitaOficial: v.vivienda.visitaOficial,
        visitaOficialEntidad: v.vivienda.visitaOficialEntidad,
        visitaOficialFecha: v.vivienda.visitaOficialFecha,
        visitaOficialConcepto: v.vivienda.visitaOficialConcepto
      },
      anexoRural: esRural
        ? {
            predioNombre: caso.anexoRural?.predioNombre ?? null,
            areaHa: this.aNumeroOpcional(v.rural.areaHa),
            tenenciaPredio: caso.anexoRural?.tenenciaPredio ?? null,
            tieneTitulo: caso.anexoRural?.tieneTitulo ?? null,
            viaAcceso: v.rural.viaAcceso,
            cultivos: seleccion.cultivos,
            cultivosOtro: v.rural.cultivosOtro,
            areaCultivoAfectadaHa: this.aNumeroOpcional(v.rural.areaCultivoAfectadaHa),
            perdidaPct: this.aNumeroOpcional(v.rural.perdidaPct),
            perdidaEstimadaCopMinor: caso.anexoRural?.perdidaEstimadaCopMinor ?? null,
            bovinosPerdidos: Number(v.rural.bovinosPerdidos),
            porcinosPerdidos: caso.anexoRural?.porcinosPerdidos ?? 0,
            avesPerdidas: Number(v.rural.avesPerdidas),
            otrosAnimales: caso.anexoRural?.otrosAnimales ?? null,
            infraProductiva: seleccion.infraProductiva,
            infraProductivaOtro: v.rural.infraProductivaOtro,
            requiereAgro: seleccion.requiereAgro,
            requiereAgroOtro: v.rural.requiereAgroOtro,
            maquinariaAfectada: v.rural.maquinariaAfectada,
            maquinariaDetalle: v.rural.maquinariaDetalle
          }
        : null,
      anexoUrbano: esRural
        ? null
        : {
            estrato: v.urbano.estrato,
            tipoUnidad: caso.anexoUrbano?.tipoUnidad ?? null,
            perdioMedioVida: v.urbano.perdioMedioVida,
            medioVidaDesc: v.urbano.medioVidaDesc,
            requiereUrbano: seleccion.requiereUrbano
          },
      anexoConvenio: {
        afiliadaFederacion: v.convenio.afiliadaFederacion,
        aplicaConvenio: v.convenio.aplicaConvenio,
        convenioLinea: seleccion.convenioLinea,
        convenioObs: caso.anexoConvenio?.convenioObs ?? null
      },
      triaje: {
        // El riesgo de colapso es riesgo de vida y manda sobre lo que diga la lista de
        // prioridad. Antes el formulario le PEDIA al voluntario que se acordara de
        // marcar P0 un paso despues; una advertencia que hay que recordar es una
        // advertencia que se pierde, y lo que se pierde aqui es una familia durmiendo
        // bajo algo que se puede caer.
        // LA PRIORIDAD LA CALCULA EL SERVIDOR. Lo que viaja desde aqui es lo que el
        // voluntario eligio, y solo sirve para ELEVARLA: si la regla dice P2 y quien
        // esta ahi ve una emergencia, gana la persona. Bajarla no se puede.
        //
        // Antes esta linea forzaba P0 cuando habia riesgo de colapso, que era la forma
        // de que no se perdiera. Ahora esa regla vive en el calculo, junto a las demas,
        // y ademas explica por que.
        prioridad: v.triaje.prioridad,
        prioridadMotivos: caso.triaje?.prioridadMotivos ?? [],
        prioridadCalculada: caso.triaje?.prioridadCalculada ?? true,
        tiposEvidencia: seleccion.tiposEvidencia,
        deseaRutaApoyo: v.triaje.deseaRutaApoyo ?? null,
        rutaApoyoOrganizacion: v.triaje.rutaApoyoOrganizacion ?? null,
        necesidadesInmediatas: seleccion.necesidades,
        yaRecibioAyuda: caso.triaje?.yaRecibioAyuda ?? null,
        ayudaCual: caso.triaje?.ayudaCual ?? null,
        ayudaQuien: caso.triaje?.ayudaQuien ?? null,
        necesidadesOtra: v.triaje.necesidadesOtra,
        observaciones: v.triaje.observaciones
      }
    };
  }

  private aNumeroOpcional(valor: number | string | null): number | null {
    if (valor === null || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
}

/** Selecciones multiples que se pintan como pastillas fuera del FormGroup. */
export interface SeleccionMultiple {
  afiliacion: string[];
  requiereVivienda: string[];
  danosVisibles: string[];
  tiposEvidencia: string[];
  documentosTenencia: string[];
  serviciosAfectados: string[];
  cultivos: string[];
  infraProductiva: string[];
  requiereAgro: string[];
  requiereUrbano: string[];
  convenioLinea: string[];
  necesidades: string[];
}

/** Los controles numericos del navegador devuelven string cuando el campo se vacia. */
type Numerico = number | string;

/** Desagregado por sexo y edad tal como lo devuelve el FormGroup. */
interface ValoresComposicion {
  h0a5: Numerico; m0a5: Numerico;
  h6a11: Numerico; m6a11: Numerico;
  h12a17: Numerico; m12a17: Numerico;
  h18a59: Numerico; m18a59: Numerico;
  h60mas: Numerico; m60mas: Numerico;
}

/** Conteos de vulnerabilidad tal como los devuelve el FormGroup. */
interface ValoresVulnerabilidad {
  gestantes: Numerico;
  requiereApoyoEvacuar: Numerico;
  discapacidadN: Numerico;
  enfCronicaN: Numerico;
  fallecidos: Numerico;
  heridosLeves: Numerico;
  heridosGraves: Numerico;
}

/** Forma tipada del valor crudo del formulario. Evita `any` en el mapeo. */
interface ValoresFormulario {
  control: {
    registradorNombre: string;
    registradorOrg: string | null;
    registradorTel: string | null;
    fuenteDato: FuenteDato;
    origenDato: OrigenDato | null;
    consentimiento: boolean | null;
    autorizaDatosSensibles: boolean | null;
    autorizaRemisionEntidades: boolean | null;
    versionAutorizacion: string | null;
    autorizadoEn: string | null;
  };
  ubicacion: {
    departamento: string;
    municipio: string;
    zona: Zona;
    vereda: string | null;
    corregimiento: string | null;
    barrio: string | null;
    comuna: string | null;
    direccionRef: string | null;
  };
  hogar: {
    jefeNombres: string | null;
    jefeApellidos: string | null;
    tipoDoc: string | null;
    numDoc: string | null;
    tel1: string;
    tel2: string | null;
    personasTotal: number | string;
    fueraDelHogar: number | string;
    afiliacionCual: string | null;
  };
  composicion: ValoresComposicion;
  vulnerabilidad: ValoresVulnerabilidad;
  vivienda: {
    tenencia: Tenencia;
    hogaresEnEstructura: number | string;
    afectacion: NivelAfectacion;
    habitable: boolean;
    riesgoColapso: boolean;
    riesgoColapsoDesc: string | null;
    habitabilidad: Habitabilidad | null;
    riesgoVisible: RiesgoVisible | null;
    danoDescripcion: string | null;
    visitaOficial: boolean | null;
    visitaOficialEntidad: string | null;
    visitaOficialFecha: string | null;
    visitaOficialConcepto: string | null;
    dondeDuerme: LugarPernocta;
  };
  rural: {
    areaHa: number | string | null;
    viaAcceso: string | null;
    areaCultivoAfectadaHa: number | string | null;
    perdidaPct: number | string | null;
    bovinosPerdidos: number | string;
    avesPerdidas: number | string;
    cultivosOtro: string | null;
    infraProductivaOtro: string | null;
    requiereAgroOtro: string | null;
    maquinariaAfectada: boolean | null;
    maquinariaDetalle: string | null;
  };
  urbano: {
    estrato: string | null;
    perdioMedioVida: boolean;
    medioVidaDesc: string | null;
  };
  convenio: { afiliadaFederacion: boolean; aplicaConvenio: boolean };
  triaje: {
    prioridad: Prioridad;
    deseaRutaApoyo: boolean | null;
    rutaApoyoOrganizacion: string | null;
    necesidadesOtra: string | null;
    observaciones: string | null;
  };
}

/** Catalogo de opciones para las pastillas. Centralizado para no duplicar literales. */
export const OPCIONES = {
  /** Quien observo. Las etiquetas hablan como habla un lider, no como la ley. */
  origenDato: [
    { v: OrigenDato.Observado, t: 'Yo lo vi, estuve ahí' },
    { v: OrigenDato.Familia, t: 'Me lo contó la familia' },
    { v: OrigenDato.Tercero, t: 'Me lo contó un vecino o un líder' },
    { v: OrigenDato.ListadoEntidad, t: 'Viene de un listado de otra entidad' }
  ],
  // METODO DE CAPTURA. La lista la pidio el enlace institucional, porque el sistema
  // nacional de gestion del riesgo trata distinto un reporte comunitario y el concepto
  // de un profesional tecnico. El orden va de lo mas frecuente en terreno a lo mas
  // raro: quien llena esto de pie no debe recorrer once opciones para marcar la que
  // usa el noventa por ciento de las veces.
  //
  // Esto es POR DONDE LLEGO el dato. Quien lo observo se pregunta aparte, y de ahi
  // sale el nivel de verificacion. Presencial + «lo dijo la familia» es una
  // combinacion legitima y frecuente.
  fuenteDato: [
    { v: FuenteDato.Presencial, t: NOMBRE_FUENTE_DATO[FuenteDato.Presencial] },
    { v: FuenteDato.Llamada, t: NOMBRE_FUENTE_DATO[FuenteDato.Llamada] },
    { v: FuenteDato.WhatsApp, t: NOMBRE_FUENTE_DATO[FuenteDato.WhatsApp] },
    { v: FuenteDato.Videollamada, t: NOMBRE_FUENTE_DATO[FuenteDato.Videollamada] },
    { v: FuenteDato.Lider, t: NOMBRE_FUENTE_DATO[FuenteDato.Lider] },
    { v: FuenteDato.JuntaAccionComunal, t: NOMBRE_FUENTE_DATO[FuenteDato.JuntaAccionComunal] },
    { v: FuenteDato.AutoridadLocal, t: NOMBRE_FUENTE_DATO[FuenteDato.AutoridadLocal] },
    { v: FuenteDato.OrganismoSocorro, t: NOMBRE_FUENTE_DATO[FuenteDato.OrganismoSocorro] },
    { v: FuenteDato.ProfesionalTecnico, t: NOMBRE_FUENTE_DATO[FuenteDato.ProfesionalTecnico] },
    { v: FuenteDato.OtraEntidad, t: NOMBRE_FUENTE_DATO[FuenteDato.OtraEntidad] },
    { v: FuenteDato.FuenteDocumental, t: NOMBRE_FUENTE_DATO[FuenteDato.FuenteDocumental] },
    { v: FuenteDato.Otra, t: NOMBRE_FUENTE_DATO[FuenteDato.Otra] }
  ],
  habitabilidad: Object.values(Habitabilidad).map((v) => ({ v, t: NOMBRE_HABITABILIDAD[v] })),
  riesgoVisible: Object.values(RiesgoVisible).map((v) => ({ v, t: NOMBRE_RIESGO_VISIBLE[v] })),
  tenencia: [
    { v: Tenencia.Propietario, t: 'Propietario' },
    { v: Tenencia.Arrendatario, t: 'Arrendatario o inquilino' },
    { v: Tenencia.Poseedor, t: 'Poseedor sin titulo' },
    { v: Tenencia.Familiar, t: 'Casa de un familiar' },
    { v: Tenencia.Usufructo, t: 'Permiso del dueno' },
    { v: Tenencia.Ocupante, t: 'Ocupante' },
    { v: Tenencia.Mayordomo, t: 'Mayordomo del predio' }
  ],
  afectacion: [
    { v: NivelAfectacion.SinDano, t: 'Sin dano' },
    { v: NivelAfectacion.Leve, t: 'Leve, habitable' },
    { v: NivelAfectacion.Moderado, t: 'Moderado, requiere reparacion' },
    { v: NivelAfectacion.Severo, t: 'Severo, inhabitable' },
    { v: NivelAfectacion.Destruida, t: 'Destruida o colapsada' },
    { v: NivelAfectacion.Riesgo, t: 'En pie, riesgo de colapso' }
  ],
  // Se genera del enum para que no haya dos listas. El 20 de agosto se agregaron
  // «en un vehiculo» y «en un espacio publico», que son intemperie con otro nombre y
  // que antes caian en «otro», donde dejaban de poder contarse.
  dondeDuerme: Object.values(LugarPernocta).map((v) => ({ v, t: NOMBRE_LUGAR_PERNOCTA[v] })),
  prioridad: [
    { v: Prioridad.P0, t: 'P0 riesgo de vida' },
    { v: Prioridad.P1, t: 'P1 sin techo' },
    { v: Prioridad.P2, t: 'P2 dano severo' },
    { v: Prioridad.P3, t: 'P3 dano leve' }
  ],
  afiliacion: [
    { v: 'comite_reforma', t: 'Comité de reforma agraria' },
    { v: 'asoc_campesina', t: 'Asociación campesina' },
    { v: 'jac', t: 'Junta de Acción Comunal' },
    { v: 'federacion', t: 'Federación (convenio)' },
    { v: 'no_afiliada', t: 'No afiliada' },
    { v: 'otra', t: 'Otra' }
  ],
  requiereVivienda: [
    { v: 'remocion', t: 'Remoción de escombros' },
    { v: 'apuntalamiento', t: 'Apuntalamiento urgente' },
    { v: 'eval_estructural', t: 'Evaluacion estructural' },
    { v: 'demolicion', t: 'Demolicion controlada' },
    { v: 'materiales', t: 'Materiales' },
    { v: 'reubicacion_temp', t: 'Reubicacion temporal' },
    { v: 'reubicacion_def', t: 'Reubicacion definitiva' },
    { v: 'subsidio_arriendo', t: 'Subsidio de arriendo' },
    { v: 'reconstruccion', t: 'Reconstruccion total' }
  ],
  servicios: [
    { v: 'agua', t: 'Agua' },
    { v: 'energia', t: 'Energia' },
    { v: 'alcantarillado', t: 'Alcantarillado' },
    { v: 'gas', t: 'Gas' },
    { v: 'via', t: 'Via de acceso' }
  ],
  cultivos: [
    { v: 'cafe', t: 'Cafe' },
    { v: 'platano', t: 'Platano' },
    { v: 'aguacate', t: 'Aguacate' },
    { v: 'cana', t: 'Cana' },
    { v: 'maiz', t: 'Maiz' },
    { v: 'frijol', t: 'Frijol' },
    { v: 'yuca', t: 'Yuca' },
    { v: 'cacao', t: 'Cacao' },
    { v: 'hortalizas', t: 'Hortalizas' },
    { v: 'frutales', t: 'Frutales' },
    { v: 'pancoger', t: 'Pancoger' },
    { v: 'piscicola', t: 'Piscicola' }
  ],
  infraProductiva: [
    { v: 'beneficiadero', t: 'Beneficiadero' },
    { v: 'establo', t: 'Establo o corral' },
    { v: 'galpon', t: 'Galpon' },
    { v: 'invernadero', t: 'Invernadero' },
    { v: 'reservorio', t: 'Reservorio' },
    { v: 'acueducto_veredal', t: 'Acueducto veredal' },
    { v: 'bodega', t: 'Bodega' },
    { v: 'cercas', t: 'Cercas' },
    { v: 'maquinaria', t: 'Maquinaria' }
  ],
  requiereAgro: [
    { v: 'semillas', t: 'Semillas' },
    { v: 'insumos', t: 'Insumos' },
    { v: 'herramientas', t: 'Herramientas' },
    { v: 'animales', t: 'Reposicion de animales' },
    { v: 'asistencia', t: 'Asistencia tecnica' },
    { v: 'credito', t: 'Credito' },
    { v: 'agua_riego', t: 'Riego o acueducto' },
    { v: 'via', t: 'Rehabilitacion de via' }
  ],
  requiereUrbano: [
    { v: 'alojamiento_temp', t: 'Alojamiento temporal' },
    { v: 'subsidio_arriendo', t: 'Subsidio de arriendo' },
    { v: 'eval_estructural', t: 'Evaluacion estructural' },
    { v: 'remocion', t: 'Remoción de escombros' },
    { v: 'materiales', t: 'Materiales' },
    { v: 'reactivacion_negocio', t: 'Reactivacion del negocio' },
    { v: 'reubicacion', t: 'Reubicacion' }
  ],
  convenioLinea: [
    { v: 'vivienda_rural', t: 'Vivienda rural' },
    { v: 'cultivos', t: 'Cultivos y produccion' },
    { v: 'vivienda_urbana', t: 'Vivienda urbana' },
    { v: 'psicosocial', t: 'Apoyo psicosocial' }
  ],
  // EL ORDEN ES DE URGENCIA, no alfabetico ni el que quedo. Las tres primeras son las
  // que disparan una ruta el mismo dia; el mercado y la ropa esperan a mañana.
  necesidades: [
    { v: Necesidad.AtencionMedica, t: 'Atención médica urgente' },
    { v: Necesidad.Proteccion, t: 'Protección y seguridad' },
    { v: Necesidad.AlojamientoTemporal, t: 'Alojamiento temporal' },
    { v: Necesidad.AguaPotable, t: 'Agua potable' },
    { v: Necesidad.Alimentos, t: 'Alimentos o mercado' },
    // «Medicamentos» a secas invitaba a anotar el tratamiento. Lo que hace falta saber
    // es que alguien no puede quedarse sin su medicina, no cual es.
    { v: Necesidad.Medicamentos, t: 'Medicamentos de uso permanente' },
    { v: Necesidad.ApoyoDependencia, t: 'Apoyo para una persona dependiente' },
    { v: Necesidad.AlimentacionEspecial, t: 'Alimentación especial' },
    { v: Necesidad.Dormir, t: 'Colchonetas y cobijas' },
    { v: Necesidad.Carpa, t: 'Carpa o plástico' },
    { v: Necesidad.Aseo, t: 'Kit de aseo' },
    { v: Necesidad.Cocina, t: 'Kit de cocina' },
    { v: Necesidad.Ropa, t: 'Ropa' },
    { v: Necesidad.Panales, t: 'Pañales o leche infantil' },
    { v: Necesidad.Psicosocial, t: 'Apoyo psicosocial' },
    { v: Necesidad.Transporte, t: 'Transporte' },
    { v: Necesidad.Documentos, t: 'Reposición de documentos' }
  ],
  viaAcceso: [
    'Transitable en vehiculo', 'Solo moto', 'Solo a pie o en bestia', 'Bloqueada por derrumbe'
  ],
  estrato: ['1', '2', '3', '4', '5', '6', 'Sin estratificar'],
  tipoDoc: [
    'Cedula de ciudadania', 'Tarjeta de identidad', 'Registro civil',
    'Cedula de extranjeria', 'PPT', 'PEP', 'Pasaporte', 'Sin documento'
  ],
  coordenada: FuenteCoordenada
} as const;
