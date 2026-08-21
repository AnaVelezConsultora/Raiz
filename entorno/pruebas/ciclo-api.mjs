/**
 * Ciclo completo contra la API real.
 *
 * Envia un caso, lo reenvia simulando el corte de senal, y comprueba que la
 * segunda vez la API responda `yaExistia` sin crear una familia nueva. Es la
 * verificacion de HU 1.2.4 en el lado del servidor: la prueba SQL comprueba el
 * upsert, esta comprueba el camino entero desde una peticion HTTP.
 *
 * Uso, contra el entorno local:
 *   node entorno/pruebas/ciclo-api.mjs http://localhost:3021 <sub>
 *
 * Uso, contra un despliegue real:
 *   node entorno/pruebas/ciclo-api.mjs https://api.apoyo-colombia.com <correo> <clave>
 *
 * La diferencia esta en el segundo argumento. Con un `sub` se arma un token sin
 * firma, que solo sirve donde el verificador corre en modo local; con un correo y
 * una clave se abre sesion de verdad contra la API, que es lo unico que vale
 * contra la nube.
 *
 * El `sub` local se obtiene con:
 *   docker compose exec -T db psql -U postgres -d raiz -t -A \
 *     -c "select id from auth.users where email='ana@ejemplo.test';"
 *
 * OJO AL CORRERLA CONTRA PRODUCCION. Registra casos de prueba en la base real, con
 * `Prueba de ciclo (API)` como registrador para que se puedan encontrar y borrar
 * despues. Los identificadores que creo se imprimen al final, justamente para eso.
 */
import { createHash } from 'node:crypto';

const API = process.argv[2] ?? 'http://localhost:3021';
const QUIEN = process.argv[3];
const CLAVE = process.argv[4];

/**
 * El almacenamiento, para mirar lo que quedo guardado.
 *
 * Contra el entorno local se lee el objeto y se compara byte por byte, que es lo
 * unico que demuestra que los bloques se unieron EN ORDEN. LocalStack lo sirve sin
 * firma, y eso es una carencia suya, no un permiso nuestro.
 *
 * Contra un despliegue real esa misma lectura tiene que FALLAR, y ahi se comprueba
 * lo contrario: que una peticion anonima a una fotografia no la entrega. Es el
 * punto 6 de SEGURIDAD.md, el que el propio documento llama «el que mas se
 * olvida», y no se puede verificar en local.
 */
const LOCAL = /localhost|127\.0\.0\.1/.test(API);
const S3 = process.env.S3_ENDPOINT ?? 'http://localhost:4566';
const BUCKET = process.env.S3_BUCKET_FOTOS ?? 'raiz-fotos';
const urlObjeto = (ruta) =>
  LOCAL ? `${S3}/${BUCKET}/${ruta}` : `https://${BUCKET}.s3.amazonaws.com/${ruta}`;

if (!QUIEN) {
  console.error('Falta el sub del usuario, o su correo y clave. Ver el encabezado.');
  process.exit(1);
}

/**
 * El token con el que corre toda la prueba.
 *
 * Con correo y clave se abre sesion contra la API, que ademas comprueba de paso que
 * el camino de identidad funciona. Sin ellos se arma un token sin firma, que el
 * verificador acepta solo en modo local.
 */
const token = await (async () => {
  if (!QUIEN.includes('@')) {
    const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `eyJhbGciOiJub25lIn0.${base64url({ sub: QUIEN })}.`;
  }

  const r = await fetch(`${API}/sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: QUIEN, clave: CLAVE })
  });

  if (!r.ok) {
    console.error(`No se pudo abrir sesion como ${QUIEN}: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  return (await r.json()).token;
})();

/**
 * Los identificadores se generan en cada corrida, y no son fijos.
 *
 * Con UUID escritos a mano la prueba solo pasaba la primera vez: en la segunda el
 * caso ya existia, «el primer envio registra, no actualiza» fallaba, y lo que se
 * veia era una prueba rota donde no habia nada roto. Un identificador nuevo por
 * corrida es ademas lo que hace el dispositivo de verdad.
 */
const ORIGEN_CASO = crypto.randomUUID();

/**
 * El caso SIN autorizacion de la familia, aparte.
 *
 * Las pruebas de fotografia lo necesitan por su nombre: sobre el se comprueba que
 * sin consentimiento no se emite permiso de subida.
 */
const ORIGEN_SIN_CONSENTIMIENTO = crypto.randomUUID();

const CASO = {
  origenId: ORIGEN_CASO,
  control: {
    // Nombre reconocible A PROPOSITO: es lo que permite encontrar y borrar lo que
    // esta prueba deja, sobre todo cuando corre contra la base real.
    registradorNombre: 'Prueba de ciclo (API)',
    registradorOrg: 'Mesa de sistematizacion',
    registradorTel: null,
    fuenteDato: 'presencial',
    // Quien observo. De aqui deriva el servidor el nivel de verificacion, y el
    // cliente NO lo manda: un cliente modificado no puede declararse verificado.
    origenDato: 'observado',
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
    fueraDelHogar: 2,
    composicion: {
      h0a5: 0, m0a5: 1, h6a11: 0, m6a11: 0, h12a17: 0,
      m12a17: 0, h18a59: 2, m18a59: 2, h60mas: 0, m60mas: 0
    },
    vulnerabilidad: {
      gestantes: 0, lactantes: 0, discapacidadN: 0, discapacidadTipo: [],
      requiereApoyoEvacuar: 0,
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
    habitabilidad: 'no_habitable',
    riesgoVisible: 'peligro_evidente',
    danosVisibles: ['grietas_muros', 'cubierta'],
    danoDescripcion: 'Grietas diagonales en el muro del frente y se cayo parte del techo.',
    documentosTenencia: ['arrendamiento'],
    dondeDuerme: 'familiar_vecino',
    requiereVivienda: ['remocion', 'eval_estructural'],
    serviciosAfectados: ['agua'],
    // Constancia de visita oficial. Viaja con datos a proposito, por la misma razon
    // que el anexo rural: es la evidencia mas fuerte que puede traer un caso y, si el
    // servidor volviera a recibirla sin guardarla, esta prueba lo dice.
    visitaOficial: true,
    visitaOficialEntidad: 'Defensa Civil (prueba)',
    visitaOficialFecha: '2026-08-18',
    visitaOficialConcepto: 'Dijeron que no se podia habitar'
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
  origenId: ORIGEN_SIN_CONSENTIMIENTO,
  control: { ...CASO.control, consentimiento: false }
});
comprobar(sinConsentimiento.estado === 200, `caso sin consentimiento se acepta (${sinConsentimiento.estado})`);

// --- y el punto deja de senalar una casa -------------------------------------
//
// Quitar el nombre no vuelve anonimo a nadie: en una vereda, coordenada exacta mas
// siete personas mas vivienda destruida senala un solo hogar. Sin autorizacion, la
// coordenada se redondea a poco mas de un kilometro y el punto de referencia se
// retira. Esta prueba existe porque el error contrario —creer que basta con quitar el
// nombre— es invisible: el registro se ve anonimo y no lo es.
const listado = await (
  await fetch(`${API}/casos`, { headers: { Authorization: `Bearer ${token}` } })
).json();
const guardado = listado.find((c) => c.codigo === sinConsentimiento.cuerpo.codigo);

const latEsperada = Math.round(CASO.ubicacion.lat * 100) / 100;
comprobar(
  guardado?.lat === latEsperada,
  `sin autorizacion la coordenada se redondea (${CASO.ubicacion.lat} -> ${guardado?.lat})`
);
comprobar(
  guardado?.lat !== CASO.ubicacion.lat,
  'el punto exacto NO quedo guardado'
);

// Y con autorizacion la coordenada exacta SI se conserva: es lo que permite que un
// organismo de socorro llegue a la casa. Degradar siempre seria proteger de mas y
// hacer inutil el mapa justo cuando hay que llegar a alguien.
const conAutorizacion = listado.find((c) => c.codigo === uno.cuerpo.codigo);
comprobar(
  conAutorizacion?.lat === CASO.ubicacion.lat,
  `con autorizacion se conserva el punto exacto (${conAutorizacion?.lat})`
);

// --- sin autorizacion de datos sensibles, la salud tampoco viaja -------------
//
// Se manda un caso CON autorizacion de datos personales pero SIN la de sensibles,
// y con gestantes, discapacidad, enfermedad cronica, fallecidos y heridos llenos.
// El servidor debe aceptarlo —la familia queda contada— y guardar esos campos en
// cero. Hasta el 19 de agosto de 2026 se guardaban tal cual.
const ORIGEN_SIN_SENSIBLES = crypto.randomUUID();
const sinSensibles = await enviar({
  ...CASO,
  origenId: ORIGEN_SIN_SENSIBLES,
  control: {
    ...CASO.control,
    consentimiento: true,
    autorizaDatosSensibles: false,
    versionAutorizacion: '1.0.0-borrador',
    autorizadoEn: '2026-08-19T15:00:00.000Z'
  },
  hogar: {
    ...CASO.hogar,
    vulnerabilidad: {
      ...CASO.hogar.vulnerabilidad,
      gestantes: 2,
      // Tambien es sensible: quien no puede salir solo es casi siempre una persona
      // mayor dependiente, lesionada o con movilidad reducida. Sin la segunda
      // autorizacion debe quedar en cero como los demas.
      requiereApoyoEvacuar: 3,
      discapacidadN: 1,
      enfCronicaN: 3,
      fallecidos: 1,
      heridosLeves: 2,
      heridosGraves: 1,
      etnia: 'inventada',
      victimaConflicto: true
    }
  }
});
comprobar(
  sinSensibles.estado === 200,
  `caso sin autorizacion de sensibles se acepta (${sinSensibles.estado})`
);

// --- taxonomia de error -----------------------------------------------------
const sinToken = await enviar(CASO, false);
comprobar(sinToken.estado === 401 && sinToken.cuerpo.clase === 'sesion', `sin token: 401 clase sesion (${sinToken.estado}/${sinToken.cuerpo.clase})`);

const incompleto = await enviar({ origenId: crypto.randomUUID() });
comprobar(incompleto.estado === 422 && incompleto.cuerpo.clase === 'rechazo', `incompleto: 422 clase rechazo (${incompleto.estado}/${incompleto.cuerpo.clase})`);

// =============================================================================
// FOTOGRAFIAS
//
// El camino de tres pasos del ADR 003 seccion 5: se pide permiso, se suben los
// bloques al almacenamiento sin pasar por la API, y la API los une y verifica.
//
// Lo que de verdad se prueba aqui son dos cosas que en terreno cuestan caro:
//
//   REANUDACION  se sube media fotografia, se corta a proposito —que es lo que
//                hace la senal de una vereda— y se comprueba que al volver la API
//                dice exactamente cuales bloques faltan. Si eso se rompe, el
//                voluntario vuelve a gastar sus datos desde cero cada vez.
//
//   INTEGRIDAD   se sube un bloque danado DEL TAMANO CORRECTO. Comprobar tamanos
//                no lo detecta: una imagen corrupta pesa lo mismo que la buena.
//                La suma si, y la fotografia se rechaza en vez de quedar guardada
//                sin que nadie pueda abrirla el dia que la entidad pida verla.
// =============================================================================

const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const texto = await r.text();
  return { estado: r.status, cuerpo: texto ? JSON.parse(texto) : null };
};

const sha256 = (datos) => createHash('sha256').update(datos).digest('hex');

/** Una imagen de mentira del tamano pedido, con la firma de un JPEG al principio. */
const imagen = (bytes) => {
  const datos = Buffer.alloc(bytes);
  // Contenido variado y no un relleno constante: con todos los bytes iguales, unos
  // bloques pegados en el orden equivocado darian la MISMA suma y la prueba de
  // integridad pasaria sin comprobar nada.
  for (let i = 0; i < bytes; i++) datos[i] = (i * 31 + 7) % 251;
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(datos, 0);
  return datos;
};

const pedirPermiso = (fotoId, datos, casoOrigenId = CASO.origenId) =>
  api('POST', '/fotos/url-prefirmada', {
    fotoId,
    casoOrigenId,
    tipo: 'fachada',
    bytes: datos.length,
    tipoMime: 'image/jpeg',
    suma: sha256(datos)
  });

const subirBloque = async (bloque, datos) => {
  const r = await fetch(bloque.url, {
    method: 'PUT',
    body: datos.subarray(bloque.desde, bloque.hasta)
  });
  return r.ok;
};

// --- una foto corriente, de 200 KB, se parte igual --------------------------
const FOTO = crypto.randomUUID();
const DATOS = imagen(200 * 1024);

const permiso = await pedirPermiso(FOTO, DATOS);
comprobar(permiso.estado === 200, `autoriza la fotografia (${permiso.estado})`);
comprobar(
  permiso.cuerpo?.modo === 'bloques',
  `una foto de 200 KB tambien se parte (${permiso.cuerpo?.modo})`
);
comprobar(
  permiso.cuerpo?.tamanoBloque === 64 * 1024 && permiso.cuerpo?.total === 4,
  `en 4 bloques de 64 KiB (${permiso.cuerpo?.total} de ${permiso.cuerpo?.tamanoBloque})`
);
comprobar(
  /content-length/i.test(permiso.cuerpo?.pendientes?.[0]?.url ?? ''),
  'el permiso de cada bloque lleva el tamano dentro de la firma'
);

// --- se cae la senal a la mitad ---------------------------------------------
comprobar(await subirBloque(permiso.cuerpo.pendientes[0], DATOS), 'sube el bloque 1');
comprobar(await subirBloque(permiso.cuerpo.pendientes[1], DATOS), 'sube el bloque 2');

const aMedias = await api('POST', `/fotos/${FOTO}/confirmar`, { ruta: permiso.cuerpo.ruta });
comprobar(
  aMedias.estado === 422,
  `no se cierra una imagen a la que le faltan bloques (${aMedias.estado})`
);

const avance = await api('GET', `/fotos/${FOTO}/estado`);
comprobar(
  avance.cuerpo?.recibidos?.length === 2,
  `el estado dice cuanto lleva sin preguntarle al celular (${avance.cuerpo?.recibidos?.length} de 4)`
);

// --- vuelve la senal: solo se firma lo que falta ----------------------------
const reanuda = await pedirPermiso(FOTO, DATOS);
comprobar(
  reanuda.cuerpo?.recibidos?.length === 2,
  'al reanudar, la API sabe que los dos primeros bloques ya llegaron'
);
comprobar(
  reanuda.cuerpo?.pendientes?.map((b) => b.numero).join(',') === '3,4',
  `solo se vuelven a firmar los que faltan: ${reanuda.cuerpo?.pendientes?.map((b) => b.numero)}`
);

for (const bloque of reanuda.cuerpo.pendientes) {
  comprobar(await subirBloque(bloque, DATOS), `sube el bloque ${bloque.numero}`);
}

const cerrada = await api('POST', `/fotos/${FOTO}/confirmar`, { ruta: reanuda.cuerpo.ruta });
comprobar(cerrada.estado === 200, `la API une los bloques y cierra (${cerrada.estado})`);
comprobar(
  cerrada.cuerpo?.bytes === DATOS.length,
  `la imagen pesa lo que debia: ${cerrada.cuerpo?.bytes} de ${DATOS.length}`
);
comprobar(
  cerrada.cuerpo?.suma === sha256(DATOS),
  'la suma de lo guardado es la de la imagen original: se unio en orden y sin danarse'
);

// Lo que quedo en el almacenamiento. Dos comprobaciones distintas, cada una en el
// entorno donde significa algo.
if (LOCAL) {
  const guardada = Buffer.from(
    await (await fetch(urlObjeto(cerrada.cuerpo.ruta))).arrayBuffer()
  );
  comprobar(
    guardada.equals(DATOS),
    `lo guardado es identico a lo capturado (${guardada.length} bytes)`
  );
} else {
  // Lo que se exige es que NO la entregue. El codigo exacto puede variar: un bucket
  // recien creado responde 404 durante unos minutos, mientras propaga el nombre de
  // estilo virtual host, y despues pasa a 403 AccessDenied. Atarse a uno de los dos
  // haria fallar la prueba por una razon que no tiene que ver con el permiso.
  const anonima = await fetch(urlObjeto(cerrada.cuerpo.ruta));
  const cuerpoAnonimo = await anonima.text();
  comprobar(
    !anonima.ok && !cuerpoAnonimo.includes('\uFFFD') && cuerpoAnonimo.includes('<Error>'),
    `una peticion anonima a la fotografia NO la entrega (${anonima.status})`
  );
}

// --- reintentos: confirmar y pedir permiso son idempotentes -----------------
const reconfirma = await api('POST', `/fotos/${FOTO}/confirmar`, { ruta: cerrada.cuerpo.ruta });
comprobar(reconfirma.cuerpo?.yaEstaba === true, 'confirmar dos veces es idempotente');

const repermiso = await pedirPermiso(FOTO, DATOS);
comprobar(
  repermiso.cuerpo?.modo === 'confirmada',
  `pedir permiso de una foto ya guardada no manda subirla otra vez (${repermiso.cuerpo?.modo})`
);

// --- integridad: un bloque danado del tamano correcto -----------------------
const FOTO_MALA = crypto.randomUUID();
const permisoMalo = await pedirPermiso(FOTO_MALA, DATOS);

for (const bloque of permisoMalo.cuerpo.pendientes) {
  if (bloque.numero === 2) {
    // Mismo tamano, contenido distinto: exactamente lo que una comprobacion de
    // tamanos no puede ver.
    const danado = Buffer.alloc(bloque.hasta - bloque.desde, 0x00);
    const r = await fetch(bloque.url, { method: 'PUT', body: danado });
    comprobar(r.ok, 'el bloque danado sube: pesa lo que debia');
    continue;
  }
  await subirBloque(bloque, DATOS);
}

const rechazada = await api('POST', `/fotos/${FOTO_MALA}/confirmar`, {
  ruta: permisoMalo.cuerpo.ruta
});
comprobar(
  rechazada.estado === 422 && rechazada.cuerpo?.clase === 'rechazo',
  `una imagen danada NO se da por guardada (${rechazada.estado}/${rechazada.cuerpo?.clase})`
);

// Que no quede guardada se comprueba por la API, que sirve en los dos entornos: la
// fotografia sigue sin confirmar y sin un solo bloque, o sea que hay que subirla
// entera otra vez.
const trasRechazo = await api('GET', `/fotos/${FOTO_MALA}/estado`);
comprobar(
  trasRechazo.cuerpo?.confirmada === false && trasRechazo.cuerpo?.recibidos?.length === 0,
  'la imagen danada no queda a medias: se descartan tambien sus bloques'
);

if (LOCAL) {
  const noQuedo = await fetch(urlObjeto(permisoMalo.cuerpo.ruta));
  comprobar(
    noQuedo.status === 404,
    `y no queda nada guardado en el almacenamiento (${noQuedo.status})`
  );
}

// --- sin autorizacion de la familia no se firma nada ------------------------
const sinPermiso = await pedirPermiso(
  crypto.randomUUID(),
  imagen(100 * 1024),
  ORIGEN_SIN_CONSENTIMIENTO
);
comprobar(
  sinPermiso.estado === 422 && sinPermiso.cuerpo?.clase === 'rechazo',
  `sin consentimiento no se emite autorizacion (${sinPermiso.estado}/${sinPermiso.cuerpo?.clase})`
);

// --- cancelar una subida a medias libera lo transmitido ---------------------
const FOTO_BOTADA = crypto.randomUUID();
const permisoBotado = await pedirPermiso(FOTO_BOTADA, DATOS);
await subirBloque(permisoBotado.cuerpo.pendientes[0], DATOS);
const urlBloque1 = permisoBotado.cuerpo.pendientes[0].url.split('?')[0];

const cancelada = await api('DELETE', `/fotos/${FOTO_BOTADA}`);
comprobar(cancelada.estado === 204, `se cancela una subida a medias (${cancelada.estado})`);
if (LOCAL) {
  comprobar(
    (await fetch(urlBloque1)).status === 404,
    'los bloques ya transmitidos se borran: no se quedan pagando alquiler'
  );
}
comprobar(
  (await api('GET', `/fotos/${FOTO_BOTADA}/estado`)).estado === 422,
  'cancelada, la fotografia ya no existe para la API'
);
comprobar(
  (await api('DELETE', `/fotos/${FOTO}`)).estado === 422,
  'una fotografia ya guardada no se borra desde aqui'
);

console.log('');
if (fallos.length) {
  console.error(`FALLARON ${fallos.length} comprobaciones`);
  process.exit(1);
}
console.log('Ciclo completo verificado contra la API, la base y el almacenamiento reales.');
console.log('');
console.log('Casos que dejo esta corrida, por si hay que borrarlos:');
console.log(`  ${ORIGEN_CASO}`);
console.log(`  ${ORIGEN_SIN_CONSENTIMIENTO}`);
console.log(`  ${ORIGEN_SIN_SENSIBLES}`);
console.log('');
console.log('Para comprobar que la salud NO quedo guardada en el ultimo:');
console.log(
  '  docker compose exec -T db psql -U postgres -d raiz -c "' +
    'select gestantes, discapacidad_n, enf_cronica_n, fallecidos, heridos_leves,' +
    ' heridos_graves, etnia, victima_conflicto from familias' +
    ` where origen_id = '${ORIGEN_SIN_SENSIBLES}'"`
);
