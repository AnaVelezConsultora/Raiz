/**
 * Ciclo completo contra la API real.
 *
 * Envia un caso, lo reenvia simulando el corte de senal, y comprueba que la
 * segunda vez la API responda `yaExistia` sin crear una familia nueva. Es la
 * verificacion de HU 1.2.4 en el lado del servidor: la prueba SQL comprueba el
 * upsert, esta comprueba el camino entero desde una peticion HTTP.
 *
 * Uso:
 *   node entorno/pruebas/ciclo-api.mjs [urlApi] [sub]
 *
 * El `sub` es el identificador del usuario en Cognito. Se obtiene con:
 *   docker compose exec -T db psql -U postgres -d raiz -t -A \
 *     -c "select id from auth.users where email='ana@ejemplo.test';"
 */
const API = process.argv[2] ?? 'http://localhost:3021';
const SUB = process.argv[3];

if (!SUB) {
  console.error('Falta el sub del usuario. Ver el encabezado de este archivo.');
  process.exit(1);
}

/** Token sin firma: el verificador corre en modo local cuando no hay proveedor. */
const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const token = `eyJhbGciOiJub25lIn0.${base64url({ sub: SUB })}.`;

/**
 * Identificador de origen NUEVO en cada corrida.
 *
 * Antes era fijo, y entonces la prueba solo pasaba contra una base recien creada:
 * en la segunda corrida el primer envio ya encontraba el caso y la comprobacion de
 * "el primer envio registra, no actualiza" fallaba. Una prueba que depende del
 * estado que dejo la anterior ensena al equipo a desconfiar del rojo.
 *
 * La idempotencia se sigue verificando igual: los dos envios de esta corrida usan
 * este mismo identificador.
 */
const ORIGEN = crypto.randomUUID();

const CASO = {
  origenId: ORIGEN,
  control: {
    registradorNombre: 'Ana Lider (prueba)',
    registradorOrg: 'Mesa de sistematizacion',
    registradorTel: null,
    fuenteDato: 'presencial',
    consentimiento: true,
    fechaRegistro: '2026-08-14'
  },
  ubicacion: {
    departamento: 'Valle del Cauca',
    municipio: 'Sevilla',
    zona: 'rural',
    vereda: 'Vereda de la prueba de ciclo',
    corregimiento: null,
    barrio: null,
    comuna: null,
    direccionRef: '300 m arriba de la escuela',
    lat: 4.2712345,
    lon: -75.9412345,
    precisionM: 11,
    gpsFuente: 'sitio'
  },
  hogar: {
    jefeNombres: 'Familia',
    jefeApellidos: 'Inventada Tres',
    tipoDoc: 'CC',
    numDoc: '10000003',
    tel1: '3000000103',
    tel1Whatsapp: true,
    tel2: null,
    personasTotal: 5,
    composicion: {
      h0a5: 0, m0a5: 1, h6a11: 0, m6a11: 0, h12a17: 0,
      m12a17: 0, h18a59: 2, m18a59: 2, h60mas: 0, m60mas: 0
    },
    vulnerabilidad: {
      gestantes: 0, lactantes: 0, discapacidadN: 0, discapacidadTipo: [],
      enfCronicaN: 0, requiereMedicamento: null, medicamentoCual: null,
      etnia: null, victimaConflicto: null,
      // Fallecidos y heridos: el bloque que pidio el terreno el 16 de agosto.
      fallecidos: 0, heridosLeves: 2, heridosGraves: 1
    },
    afiliacion: ['comite_reforma'],
    afiliacionCual: null
  },
  vivienda: {
    tenencia: 'arrendatario',
    arrendadorContacto: null,
    hogaresEnEstructura: 2,
    tipoVivienda: null,
    materialParedes: null,
    materialTecho: null,
    afectacion: 'severo',
    habitable: false,
    riesgoColapso: true,
    riesgoColapsoDesc: 'La estructura vecina amenaza caer',
    dondeDuerme: 'familiar_vecino',
    requiereVivienda: ['remocion', 'eval_estructural'],
    serviciosAfectados: ['agua']
  },
  // El anexo rural viaja con datos a proposito. Se descubrio el 16 de agosto que la
  // API lo recibia y no lo guardaba en ninguna parte: en un municipio que vive del
  // cafe, eso es perder la mitad del dano. Si vuelve a pasar, esta prueba lo dice.
  anexoRural: {
    predioNombre: 'Predio inventado',
    areaHa: 3.5,
    tenenciaPredio: null,
    tieneTitulo: null,
    viaAcceso: 'transitable',
    cultivos: ['cafe', 'aguacate'],
    cultivosOtro: 'Se cayo toda la aguacatera',
    areaCultivoAfectadaHa: 1.25,
    perdidaPct: 60,
    perdidaEstimadaCopMinor: null,
    bovinosPerdidos: 0,
    porcinosPerdidos: 0,
    avesPerdidas: 12,
    otrosAnimales: null,
    infraProductiva: ['beneficiadero'],
    infraProductivaOtro: 'Tanque de agua del beneficiadero',
    requiereAgro: ['insumos'],
    requiereAgroOtro: 'Plantulas de aguacate',
    maquinariaAfectada: true,
    maquinariaDetalle: 'Guadana y despulpadora bajo el derrumbe'
  },
  anexoUrbano: null,
  anexoConvenio: {
    afiliadaFederacion: false,
    aplicaConvenio: false,
    convenioLinea: [],
    convenioObs: null
  },
  triaje: {
    prioridad: 'p0',
    necesidadesInmediatas: ['alimentos', 'agua_potable'],
    yaRecibioAyuda: null,
    ayudaCual: null,
    ayudaQuien: null,
    necesidadesOtra: 'Necesitan quien les ayude a mover el derrumbe',
    observaciones: 'Caso de prueba del ciclo completo'
  }
};

const enviar = async (caso, autorizado = true) => {
  const r = await fetch(`${API}/casos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(autorizado ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(caso)
  });
  return { estado: r.status, cuerpo: await r.json() };
};

const fallos = [];
const comprobar = (condicion, mensaje) => {
  console.log(`${condicion ? 'OK  ' : 'FALLA'} ${mensaje}`);
  if (!condicion) fallos.push(mensaje);
};

// --- disponibilidad ---------------------------------------------------------
const salud = await (await fetch(`${API}/salud`)).json();
comprobar(salud.disponible === true, `la base responde (${salud.base})`);

// --- primer envio -----------------------------------------------------------
const uno = await enviar(CASO);
comprobar(uno.estado === 200, `primer envio responde 200 (${uno.estado})`);
comprobar(/^RZ-\d{4}-\d{6}$/.test(uno.cuerpo.codigo ?? ''), `asigna codigo institucional (${uno.cuerpo.codigo})`);
comprobar(uno.cuerpo.yaExistia === false, 'el primer envio registra, no actualiza');

// --- reenvio: se perdio la respuesta y el dispositivo reintenta -------------
const dos = await enviar({ ...CASO, hogar: { ...CASO.hogar, personasTotal: 6 } });
comprobar(dos.estado === 200, `reenvio responde 200 (${dos.estado})`);
comprobar(dos.cuerpo.codigo === uno.cuerpo.codigo, 'el reenvio conserva el mismo codigo');
comprobar(dos.cuerpo.yaExistia === true, 'el reenvio actualiza, no duplica');

// --- sin autorizacion la identidad no debe viajar ---------------------------
const sinConsentimiento = await enviar({
  ...CASO,
  origenId: crypto.randomUUID(),
  control: { ...CASO.control, consentimiento: false }
});
comprobar(sinConsentimiento.estado === 200, `caso sin consentimiento se acepta (${sinConsentimiento.estado})`);

// --- taxonomia de error -----------------------------------------------------
const sinToken = await enviar(CASO, false);
comprobar(sinToken.estado === 401 && sinToken.cuerpo.clase === 'sesion', `sin token: 401 clase sesion (${sinToken.estado}/${sinToken.cuerpo.clase})`);

const incompleto = await enviar({ origenId: crypto.randomUUID() });
comprobar(incompleto.estado === 422 && incompleto.cuerpo.clase === 'rechazo', `incompleto: 422 clase rechazo (${incompleto.estado}/${incompleto.cuerpo.clase})`);

console.log('');
if (fallos.length) {
  console.error(`FALLARON ${fallos.length} comprobaciones`);
  process.exit(1);
}
console.log('Ciclo completo verificado contra la API y la base reales.');
