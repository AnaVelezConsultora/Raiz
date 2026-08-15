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
import { createHash } from 'node:crypto';

const API = process.argv[2] ?? 'http://localhost:3021';
const SUB = process.argv[3];

/** El almacenamiento local. Solo se consulta para verificar lo que quedo guardado. */
const S3 = process.env.S3_ENDPOINT ?? 'http://localhost:4566';
const BUCKET = process.env.S3_BUCKET_FOTOS ?? 'raiz-fotos';

if (!SUB) {
  console.error('Falta el sub del usuario. Ver el encabezado de este archivo.');
  process.exit(1);
}

/** Token sin firma: el verificador corre en modo local cuando no hay proveedor. */
const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const token = `eyJhbGciOiJub25lIn0.${base64url({ sub: SUB })}.`;

/**
 * Los identificadores se generan en cada corrida, y no son fijos.
 *
 * Con UUID escritos a mano la prueba solo pasaba la primera vez: en la segunda el
 * caso ya existia, «el primer envio registra, no actualiza» fallaba, y lo que se
 * veia era una prueba rota donde no habia nada roto. Un identificador nuevo por
 * corrida es ademas lo que hace el dispositivo de verdad.
 */
const ORIGEN_CASO = crypto.randomUUID();
const ORIGEN_SIN_CONSENTIMIENTO = crypto.randomUUID();

const CASO = {
  origenId: ORIGEN_CASO,
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
      etnia: null, victimaConflicto: null
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
  anexoRural: null,
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

// El objeto guardado, byte por byte. LocalStack sirve sin firma —eso NO pasa en
// AWS, y es la salvedad conocida de este entorno— y aqui se aprovecha para
// comprobar el contenido, que es lo que ninguna cabecera puede afirmar.
const guardada = Buffer.from(
  await (await fetch(`${S3}/${BUCKET}/${cerrada.cuerpo.ruta}`)).arrayBuffer()
);
comprobar(
  guardada.equals(DATOS),
  `lo guardado es identico a lo capturado (${guardada.length} bytes)`
);

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

const noQuedo = await fetch(`${S3}/${BUCKET}/${permisoMalo.cuerpo.ruta}`);
comprobar(
  noQuedo.status === 404,
  `y no queda guardada a medias en el almacenamiento (${noQuedo.status})`
);

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
comprobar(
  (await fetch(urlBloque1)).status === 404,
  'los bloques ya transmitidos se borran: no se quedan pagando alquiler'
);
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
