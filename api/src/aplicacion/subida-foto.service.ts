import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AutorizacionSubida,
  BloquePendiente,
  BloqueRecibido,
  ConfirmacionFoto,
  EstadoFoto,
  FotoConfirmada,
  MAXIMO_BYTES_FOTO,
  SolicitudSubidaFoto,
  TIPOS_MIME_FOTO,
  bloquesQueOcupa,
  tamanoBloquePara
} from '@raiz/dominio';
import {
  ALMACENAMIENTO,
  AlmacenamientoObjetosPort,
  CasoDeLaFoto,
  ErrorRechazo,
  FOTO_REPOSITORIO,
  FotoRegistrada,
  FotoRepositorioPort,
  Identidad
} from '../dominio/puertos';

/** Un bloque, con donde vive y que pedazo del archivo le toca. */
interface Bloque {
  numero: number;
  clave: string;
  desde: number;
  hasta: number;
}

/**
 * La subida de una fotografia por bloques, de principio a fin.
 *
 * -----------------------------------------------------------------------------------
 * TODA FOTOGRAFIA SE PARTE, INCLUSO UNA DE 200 KB
 * -----------------------------------------------------------------------------------
 *
 * La red de una vereda no se cae cuando el archivo es grande: se cae cuando se cae. Un
 * envio de 200 KB cortado al 80 % no deja nada, y el reintento vuelve a transmitir
 * —y a cobrarle al voluntario— los mismos 160 KB. Tres intentos asi son 800 KB de un
 * plan de datos ajeno, y la fotografia sigue sin llegar.
 *
 * Partida, cada pedazo que llega SE QUEDA. Es la unica diferencia que importa.
 *
 * -----------------------------------------------------------------------------------
 * LA VERDAD SOBRE LO QUE LLEGO NO ESTA EN EL CELULAR
 * -----------------------------------------------------------------------------------
 *
 * Que bloques hay se le pregunta al almacenamiento, objeto por objeto, en cada
 * autorizacion. No se guarda en la base y no se le cree al dispositivo. Por eso un
 * telefono que se quedo sin bateria a mitad, o al que le reinstalaron la aplicacion,
 * retoma exactamente donde iba.
 *
 * Y por eso quien cierra la fotografia es la API: junta los bloques que ella misma
 * verifico, no los que el cliente diga. Una version defectuosa de la aplicacion no
 * puede dar por completa una imagen a la que le falta un pedazo — y a una fotografia
 * del dano de una vivienda a la que le falta un pedazo no se le toma otra.
 *
 * @version 0.2.0
 */
@Injectable()
export class SubidaFotoService {
  private readonly log = new Logger(SubidaFotoService.name);

  constructor(
    @Inject(FOTO_REPOSITORIO) private readonly fotos: FotoRepositorioPort,
    @Inject(ALMACENAMIENTO) private readonly almacen: AlmacenamientoObjetosPort
  ) {}

  // ---------------------------------------------------------------------------
  // Paso 1. Autorizar
  // ---------------------------------------------------------------------------

  async autorizar(
    solicitud: SolicitudSubidaFoto,
    identidad: Identidad
  ): Promise<AutorizacionSubida> {
    this.validar(solicitud);
    const tamanoBloque = tamanoBloquePara(solicitud.bytes);

    // El repositorio comprueba que el caso exista, que sea de quien pide y que la
    // familia haya autorizado. Si algo de eso falla, no se firma nada.
    const foto = await this.fotos.autorizar(
      {
        origenId: solicitud.fotoId,
        casoOrigenId: solicitud.casoOrigenId,
        tipo: solicitud.tipo,
        bytes: solicitud.bytes,
        tipoMime: solicitud.tipoMime,
        suma: solicitud.suma,
        tamanoBloque
      },
      identidad,
      (caso) => this.rutas(caso, solicitud)
    );

    if (foto.confirmada) {
      // El dispositivo perdio la respuesta de la confirmacion y volvio a empezar. Sin
      // este caso subiria otra vez, por su plan de datos, algo que ya esta guardado.
      return { modo: 'confirmada', ruta: foto.ruta, bytes: foto.bytes };
    }

    const bloques = this.repartir(foto);
    const recibidos = await this.bloquesQueYaEstan(bloques);
    const yaEstan = new Set(recibidos.map((b) => b.numero));

    const pendientes: BloquePendiente[] = [];
    let expiraEn = new Date(Date.now() + 900_000).toISOString();

    for (const bloque of bloques) {
      if (yaEstan.has(bloque.numero)) continue;

      const permiso = await this.almacen.firmarEscritura({
        clave: bloque.clave,
        bytes: bloque.hasta - bloque.desde
      });
      expiraEn = permiso.expiraEn;

      pendientes.push({
        numero: bloque.numero,
        desde: bloque.desde,
        hasta: bloque.hasta,
        url: permiso.url
      });
    }

    this.log.log(
      `Foto ${foto.origenId}: ${recibidos.length}/${bloques.length} bloques ya estaban; ` +
        `se firman ${pendientes.length}.`
    );

    return {
      modo: 'bloques',
      ruta: foto.ruta,
      tamanoBloque: foto.tamanoBloque,
      total: bloques.length,
      pendientes,
      recibidos,
      expiraEn
    };
  }

  // ---------------------------------------------------------------------------
  // Paso 3. Confirmar
  // ---------------------------------------------------------------------------

  /**
   * Une los bloques, verifica el resultado y da la fotografia por guardada.
   *
   * Es idempotente: repetirlo no sube nada de nuevo, asi que el dispositivo puede
   * reintentarlo sin miedo cuando se le cae la senal justo despues del ultimo bloque.
   */
  async confirmar(
    fotoId: string,
    confirmacion: ConfirmacionFoto,
    identidad: Identidad
  ): Promise<FotoConfirmada> {
    const foto = await this.exigir(fotoId, identidad);

    // Que el dispositivo confirme una ruta distinta de la suya seria pedirle a la API
    // que verifique el objeto de otra familia y lo apunte en esta fila.
    if (confirmacion?.ruta && confirmacion.ruta !== foto.ruta) {
      throw new ErrorRechazo('La ruta confirmada no corresponde a esta fotografia.', [
        `se esperaba ${foto.ruta}`
      ]);
    }

    if (foto.confirmada) {
      const bytes = await this.almacen.tamano(foto.ruta);
      if (bytes === null) {
        // La base afirma algo que el almacenamiento no sostiene. Se dice en voz alta:
        // es una fotografia que se dio por salvada y no esta.
        this.log.error(`Foto ${fotoId} figura confirmada y NO esta en ${foto.ruta}.`);
        throw new ErrorRechazo('La fotografia figuraba guardada y no esta en el almacenamiento.');
      }
      return { fotoId, ruta: foto.ruta, bytes, suma: foto.suma, yaEstaba: true };
    }

    const bloques = this.repartir(foto);
    const recibidos = await this.bloquesQueYaEstan(bloques);
    const faltan = bloques
      .filter((b) => !recibidos.some((r) => r.numero === b.numero))
      .map((b) => b.numero);

    if (faltan.length > 0) {
      // No se une a medias: quedaria un archivo que pesa poco y no se abre. Se dice
      // cuales faltan, que es lo que la aplicacion necesita para terminar.
      throw new ErrorRechazo('Faltan bloques por subir.', [
        `bloques pendientes: ${faltan.join(', ')} de ${bloques.length}`
      ]);
    }

    const declarado = recibidos.reduce((suma, b) => suma + b.bytes, 0);
    if (declarado !== foto.bytes) {
      // Los permisos fijan el tamano de cada bloque, asi que esto no deberia ocurrir.
      // Si ocurre, unir produciria una imagen corrupta: mejor no unir.
      throw new ErrorRechazo('Los bloques subidos no suman el tamano declarado.', [
        `se esperaban ${foto.bytes} bytes y hay ${declarado}`
      ]);
    }

    const { suma } = await this.almacen.unir({
      claves: bloques.map((b) => b.clave),
      destino: foto.ruta,
      tipoMime: foto.tipoMime,
      bytes: foto.bytes
    });

    await this.verificarIntegridad(foto, suma, bloques);

    const bytes = await this.almacen.tamano(foto.ruta);
    if (bytes === null) {
      throw new ErrorRechazo('Se unieron los bloques y el objeto no aparece.');
    }

    await this.fotos.confirmar(fotoId, bytes, identidad);
    await this.limpiar(bloques);

    this.log.log(
      `Foto ${fotoId} confirmada en ${foto.ruta} (${bytes} bytes, ${bloques.length} bloques, ` +
        `sha256 ${suma.slice(0, 12)}).`
    );
    return { fotoId, ruta: foto.ruta, bytes, suma, yaEstaba: false };
  }

  /**
   * Que lo unido sea EXACTAMENTE la imagen que el voluntario tomo.
   *
   * Comprobar tamanos no alcanza y esa es toda la razon de este metodo: una imagen
   * corrupta, unos bloques pegados en el orden equivocado y la imagen buena pesan
   * igual. La suma no.
   *
   * Que se hace cuando no cuadra: se borra lo unido y se borran los bloques. Es duro
   * —el voluntario vuelve a subir la fotografia entera— y es lo correcto: dejar
   * guardada una imagen que no se puede abrir seria peor, porque nadie se enteraria
   * hasta el dia en que la entidad pida ver la evidencia del dano.
   *
   * Cuando el dispositivo no declara suma —una version vieja de la aplicacion en un
   * telefono que lleva semanas en la vereda— no se rechaza: se registra y se acepta. La
   * fotografia de esa familia vale mas que la comprobacion.
   */
  private async verificarIntegridad(
    foto: FotoRegistrada,
    suma: string,
    bloques: Bloque[]
  ): Promise<void> {
    if (!foto.suma) {
      this.log.warn(
        `Foto ${foto.origenId}: llego sin suma de verificacion. Se acepta y se anota la ` +
          `calculada (${suma.slice(0, 12)}). Revisar la version del cliente que la envio.`
      );
      return;
    }

    if (foto.suma.toLowerCase() === suma.toLowerCase()) return;

    this.log.error(
      `Foto ${foto.origenId}: la imagen unida NO corresponde. Declarada ` +
        `${foto.suma.slice(0, 12)}, calculada ${suma.slice(0, 12)}. Se descarta.`
    );

    await this.almacen.borrar(foto.ruta).catch(() => undefined);
    await this.limpiar(bloques);

    throw new ErrorRechazo(
      'La imagen recibida no coincide con la que se declaro. Hay que volver a subirla.',
      ['la suma de verificacion no cuadra: algun bloque llego danado']
    );
  }

  // ---------------------------------------------------------------------------
  // Consulta y cancelacion
  // ---------------------------------------------------------------------------

  /** Como va la subida. No firma nada ni cambia nada: es para la barra de avance. */
  async estado(fotoId: string, identidad: Identidad): Promise<EstadoFoto> {
    const foto = await this.exigir(fotoId, identidad);

    if (foto.confirmada) {
      return {
        fotoId,
        ruta: foto.ruta,
        bytes: foto.bytes,
        confirmada: true,
        tamanoBloque: foto.tamanoBloque,
        total: bloquesQueOcupa(foto.bytes, foto.tamanoBloque || foto.bytes),
        recibidos: [],
        progreso: 1
      };
    }

    const bloques = this.repartir(foto);
    const recibidos = await this.bloquesQueYaEstan(bloques);
    const subidos = recibidos.reduce((suma, b) => suma + b.bytes, 0);

    return {
      fotoId,
      ruta: foto.ruta,
      bytes: foto.bytes,
      confirmada: false,
      tamanoBloque: foto.tamanoBloque,
      total: bloques.length,
      recibidos,
      progreso: foto.bytes > 0 ? Math.min(1, subidos / foto.bytes) : 0
    };
  }

  /**
   * Cancela una subida a medias y libera lo que ya se transmitio.
   *
   * Los bloques de una fotografia que nadie termino ocupan espacio facturable. El ciclo
   * de vida del bucket los barre a los siete dias; esto es para cuando se sabe antes:
   * el voluntario borro la foto, o la familia retiro la autorizacion.
   *
   * NO borra fotografias confirmadas. Retirar una imagen que ya llego es otra decision
   * y otra historia — la HU 1.5.3.
   */
  async abortar(fotoId: string, identidad: Identidad): Promise<void> {
    const foto = await this.exigir(fotoId, identidad);

    if (foto.confirmada) {
      throw new ErrorRechazo('La fotografia ya esta guardada y no se cancela desde aqui.');
    }

    await this.limpiar(this.repartir(foto));
    await this.fotos.descartar(fotoId, identidad);

    this.log.log(`Foto ${fotoId}: subida cancelada y lo transmitido liberado.`);
  }

  // ---------------------------------------------------------------------------
  // Detalles
  // ---------------------------------------------------------------------------

  /**
   * En cuantos bloques se parte esta fotografia y donde va cada uno.
   *
   * Se calcula, no se guarda. El tamano de bloque y el peso total estan en la fila, y
   * de esos dos sale todo lo demas: guardar ademas la lista seria una segunda copia que
   * puede contradecir a la primera.
   */
  private repartir(foto: FotoRegistrada): Bloque[] {
    const tamano = foto.tamanoBloque > 0 ? foto.tamanoBloque : tamanoBloquePara(foto.bytes);
    const total = bloquesQueOcupa(foto.bytes, tamano);
    const prefijo = foto.partesPrefijo ?? `${foto.ruta}.partes`;

    return Array.from({ length: total }, (_, i) => {
      const numero = i + 1;
      const desde = i * tamano;
      return {
        numero,
        // Numerado con ceros a la izquierda para que el orden alfabetico de una consola
        // coincida con el orden real. Quien mire el bucket a las 2 de la manana lo
        // agradece.
        clave: `${prefijo}/${String(numero).padStart(4, '0')}`,
        desde,
        hasta: Math.min(desde + tamano, foto.bytes)
      };
    });
  }

  /**
   * Cuales de estos bloques ya estan, preguntando por cada uno.
   *
   * Se consulta objeto por objeto y NO se lista el prefijo. Listar es de consistencia
   * eventual: podria omitir un bloque recien subido, y entonces el celular volveria a
   * mandar —y a pagar— algo que ya habia llegado. Lo dice el ADR 003.
   *
   * Las consultas van en paralelo porque son entre la API y el almacenamiento, dentro
   * de la nube: aqui el paralelismo no le cuesta nada al voluntario. Lo que va
   * secuencial es lo que viaja por SU red.
   */
  private async bloquesQueYaEstan(bloques: Bloque[]): Promise<BloqueRecibido[]> {
    const tamanos = await Promise.all(bloques.map((b) => this.almacen.tamano(b.clave)));

    const recibidos: BloqueRecibido[] = [];
    bloques.forEach((bloque, i) => {
      const bytes = tamanos[i];
      if (bytes === null) return;

      // Un bloque con un tamano distinto del que le toca es de otra version de la
      // imagen: la foto se volvio a tomar y se reutilizo el identificador. Se ignora,
      // de modo que se vuelva a subir y pise al anterior.
      if (bytes !== bloque.hasta - bloque.desde) return;

      recibidos.push({ numero: bloque.numero, bytes });
    });

    return recibidos;
  }

  /** Borra los bloques sueltos. Si alguno falla, el ciclo de vida del bucket lo barre. */
  private async limpiar(bloques: Bloque[]): Promise<void> {
    await Promise.all(
      bloques.map((b) =>
        this.almacen.borrar(b.clave).catch((e: unknown) => {
          const detalle = e instanceof Error ? e.message : 'desconocido';
          this.log.warn(`No se pudo borrar el bloque ${b.clave}: ${detalle}`);
        })
      )
    );
  }

  private async exigir(fotoId: string, identidad: Identidad): Promise<FotoRegistrada> {
    const foto = await this.fotos.buscar(fotoId, identidad);
    if (!foto) {
      // Igual que con los casos: no se distingue «no existe» de «no es suya». Decir
      // cual de las dos ya seria contar algo de otra familia.
      throw new ErrorRechazo('No hay una fotografia autorizada con ese identificador.');
    }
    return foto;
  }

  private validar(solicitud: SolicitudSubidaFoto): void {
    const faltantes: string[] = [];

    if (!solicitud?.fotoId) faltantes.push('fotoId es obligatorio');
    if (!solicitud?.casoOrigenId) faltantes.push('casoOrigenId es obligatorio');
    if (!solicitud?.tipo) faltantes.push('tipo es obligatorio');

    if (!(solicitud?.bytes > 0)) {
      faltantes.push('bytes debe ser mayor que cero');
    } else if (solicitud.bytes > MAXIMO_BYTES_FOTO) {
      // El techo no es tacaneria: lo que pesa mas que esto no es la foto de una
      // vivienda, y firmarlo seria firmar espacio que paga el proyecto. La PWA ademas
      // comprime antes de guardar, asi que llegar aqui ya es raro.
      faltantes.push(`bytes no puede pasar de ${MAXIMO_BYTES_FOTO}`);
    }

    if (!TIPOS_MIME_FOTO[solicitud?.tipoMime]) {
      faltantes.push(`tipoMime no admitido: ${solicitud?.tipoMime ?? 'sin declarar'}`);
    }

    // Se exige la forma, no que sea cierta: si no es la suma de verdad, se descubre al
    // unir, que es donde se puede comprobar de verdad.
    if (solicitud?.suma && !/^[0-9a-f]{64}$/i.test(solicitud.suma)) {
      faltantes.push('suma debe ser un SHA-256 en hexadecimal');
    }

    if (faltantes.length > 0) {
      throw new ErrorRechazo('La solicitud de subida no es valida.', faltantes);
    }
  }

  /**
   * Donde vive la imagen y donde viven sus bloques.
   *
   * La imagen final va bajo el consecutivo institucional del caso, de modo que quien
   * tenga que auditar las fotografias de una familia las encuentre por prefijo.
   *
   * Los bloques van bajo `partes/`, en otra rama del bucket, y eso no es organizacion:
   * es lo que permite que la regla de ciclo de vida barra pedazos abandonados sin
   * arriesgarse a tocar una sola imagen buena.
   */
  private rutas(
    caso: CasoDeLaFoto,
    solicitud: SolicitudSubidaFoto
  ): { ruta: string; partesPrefijo: string } {
    const extension = TIPOS_MIME_FOTO[solicitud.tipoMime] ?? 'bin';
    return {
      ruta: `casos/${caso.codigo}/${solicitud.tipo}-${solicitud.fotoId}.${extension}`,
      partesPrefijo: `partes/${caso.codigo}/${solicitud.fotoId}`
    };
  }
}
