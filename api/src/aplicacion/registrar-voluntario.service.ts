import { ROLES_QUE_PUEDE_CREAR, Rol, puedeCrear } from '@raiz/dominio';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ADMINISTRADOR_IDENTIDAD,
  AdministradorIdentidadPort,
  ErrorRechazo,
  ErrorSesion,
  Identidad,
  PERFIL_REPOSITORIO,
  Perfil,
  PerfilRepositorioPort
} from '../dominio/puertos';

/** Lo que hay que saber de un voluntario para darlo de alta. */
export interface AltaVoluntario {
  correo: string;
  /** Nombres COMPLETOS: nombre y apellido. Un solo nombre no identifica a nadie. */
  nombre: string;
  /** Cedula. Obligatoria: quien registra a una familia firma ese registro. */
  documento: string;
  /** Obligatorio: es como se le pregunta a quien levanto un caso. */
  telefono: string;
  clave: string;
  /** Que va a ser. Se comprueba contra lo que puede crear quien pide. */
  rol: Rol;
}

/** Lo que se devuelve. NUNCA incluye la clave. */
export interface VoluntarioCreado {
  sub: string;
  correo: string;
  nombre: string;
  rol: Rol;
}

/**
 * Dar de alta a un voluntario.
 *
 * POR QUE NO HAY REGISTRO ABIERTO
 *
 * Porque lo que se escribe con esta cuenta es el padron de familias damnificadas. Un
 * formulario de registro publico significa que cualquiera con el enlace puede empezar a
 * meter casos, y un censo contaminado no se limpia: se descarta, y con el se descarta
 * el trabajo de los voluntarios que si fueron a la vereda.
 *
 * Da de alta el CUSTODIO, que es quien responde por la proteccion de datos, y en
 * ausencia de custodio el coordinador. Es la misma regla que ya declara `permisosDe`
 * en el dominio compartido: `administrarUsuarios` es del custodio.
 *
 * SON DOS ESCRITURAS Y EL ORDEN IMPORTA
 *
 *   1. Cognito, que es quien puede decir "este correo ya existe"
 *   2. auth.users, y de ahi el disparador crea el perfil
 *
 * Si la segunda falla, queda una cuenta en Cognito sin perfil: el voluntario podria
 * autenticarse pero no entrar, y la API se lo dice con todas las letras. Repetir el
 * alta lo arregla. Al reves —perfil sin cuenta— seria peor: una fila con rol y sin
 * nadie detras.
 *
 * QUE "REPETIR LO ARREGLA" SEA CIERTO COSTO UNA CORRECCION (H16)
 *
 * Este comentario decia que las dos escrituras eran idempotentes, y no lo eran. La
 * primera —Cognito— respondia que el correo ya existe, asi que el reintento moria
 * ahi y la segunda no llegaba a intentarse NUNCA. La cuenta a medias se quedaba a
 * medias para siempre y solo se arreglaba borrandola del proveedor a mano.
 *
 * Se descubrio probando contra el despliegue, no leyendo el codigo: en el entorno
 * local nunca se habia interrumpido un alta entre las dos escrituras.
 *
 * Ahora el adaptador de Cognito si es idempotente —busca la cuenta existente en vez
 * de rendirse— y este servicio decide que significa que ya exista, mirando si la
 * persona tiene perfil.
 *
 * @version 0.1.0
 */
@Injectable()
export class RegistrarVoluntarioService {
  private readonly log = new Logger(RegistrarVoluntarioService.name);


  constructor(
    @Inject(ADMINISTRADOR_IDENTIDAD) private readonly proveedor: AdministradorIdentidadPort,
    @Inject(PERFIL_REPOSITORIO) private readonly perfiles: PerfilRepositorioPort
  ) {}

  async ejecutar(alta: AltaVoluntario, quienPide: Identidad): Promise<VoluntarioCreado> {
    const quien = await this.exigirPermiso(quienPide, alta.rol);
    this.validar(alta);

    const correo = alta.correo.trim().toLowerCase();
    const nombre = alta.nombre.trim();
    const documento = alta.documento.replace(/\D/g, '');
    const telefono = this.aFormatoInternacional(alta.telefono);

    const { sub, yaExistia } = await this.proveedor.crearVoluntario(
      correo,
      nombre,
      telefono,
      alta.clave
    );

    // La cuenta ya estaba en el proveedor. Hay dos situaciones detras de eso y se
    // parecen mucho, pero exigen respuestas opuestas:
    //
    //   tiene perfil  -> el alta esta completa. Repetirla es un descuido y se
    //                    rechaza, que es lo que el custodio necesita saber.
    //   sin perfil    -> el alta anterior se corto entre las dos escrituras. Ese
    //                    es el estado roto que hay que reparar, no denunciar.
    //
    // El proveedor de identidad no puede distinguirlos porque no sabe nada de
    // perfiles. Por eso la decision esta aqui.
    if (yaExistia) {
      const perfil = await this.perfiles.porSub(sub);
      if (perfil) {
        throw new ErrorRechazo('Ya hay un voluntario con ese correo.');
      }
      this.log.warn(`Alta a medias de ${sub}: existe en el proveedor y no tenia perfil. Se completa.`);
    }

    await this.perfiles.reflejarDelProveedor({
      sub,
      correo,
      nombre,
      telefono,
      documento
    });

    // NACE LIDER SIEMPRE, que es lo que pone el disparador, y ascender es un acto
    // aparte que pasa por las politicas de acceso. Si el rol viniera en el alta,
    // quien pudiera escribir en `auth.users` se fabricaria un coordinador sin que
    // ninguna politica lo mirara.
    //
    // El ascenso corre A NOMBRE DE QUIEN PIDE: la base vuelve a decidir, y por eso
    // la regla vale aunque manana alguien escriba otra ruta y olvide comprobarla.
    let rol = Rol.Lider;
    if (alta.rol !== Rol.Lider) {
      const ascendido = await this.perfiles.cambiar(sub, { rol: alta.rol }, quienPide);
      if (!ascendido) {
        // La cuenta existe y quedo como lider. Se dice tal cual: media verdad aqui
        // seria un coordinador que cree que dio de alta a alguien que no puede
        // hacer su trabajo.
        this.log.error(`La base no dejo asignar ${alta.rol} a ${sub}, pedido por ${quien.rol}.`);
        throw new ErrorRechazo(
          `La cuenta se creo, pero no se pudo dejar como ${alta.rol}. Quedo como lider.`
        );
      }
      rol = ascendido.rol;
    }

    this.log.log(`Voluntario ${sub} dado de alta como ${rol} por ${quienPide.sub} (${quien.rol})`);
    return { sub, correo, nombre, rol };
  }

  /**
   * El rol se lee de la base en el momento, no del token.
   *
   * Si viviera en el token, retirarle el permiso a alguien no surtiria efecto hasta
   * que su token caducara. Aqui el custodio revoca y en la siguiente peticion ya no
   * puede dar de alta a nadie.
   */
  private async exigirPermiso(quien: Identidad, rolNuevo: Rol): Promise<Perfil> {
    const perfil: Perfil | null = await this.perfiles.porSub(quien.sub);

    if (!perfil || !perfil.activo) {
      throw new ErrorSesion('Su acceso no esta activo.');
    }

    const puede = ROLES_QUE_PUEDE_CREAR[perfil.rol] ?? [];
    if (puede.length === 0) {
      // Clase sesion y no rechazo: el problema no es el dato que mando, es que no
      // tiene permiso. Decirle "revise los campos" seria mandarlo a buscar donde no es.
      throw new ErrorSesion('Su rol no da de alta a nadie.');
    }
    if (!puedeCrear(perfil.rol, rolNuevo)) {
      throw new ErrorSesion(
        `Un ${perfil.rol} no puede crear un ${rolNuevo}. Puede crear: ${puede.join(', ')}.`
      );
    }

    return perfil;
  }

  /**
   * El telefono, como lo exige un proveedor de identidad: `+57...`.
   *
   * COGNITO REAL RECHAZA `3001112233` con «Invalid phone number format» y el Cognito
   * del entorno local lo acepta sin chistar. Es decir: el alta funcionaba en la
   * maquina de quien programa y fallaba con un 503 en la nube, sin que el mensaje
   * mencionara el telefono. Se descubrio desplegando.
   *
   * Se asume Colombia cuando el numero llega sin indicativo, que es de donde son
   * todos los voluntarios de este proyecto. Quien traiga un numero de otro pais lo
   * escribe con `+` y se respeta tal cual.
   */
  private aFormatoInternacional(telefono: string): string {
    const limpio = telefono.trim();
    if (limpio.startsWith('+')) return '+' + limpio.slice(1).replace(/\D/g, '');

    const digitos = limpio.replace(/\D/g, '');
    return digitos.startsWith('57') ? `+${digitos}` : `+57${digitos}`;
  }

  private validar(alta: AltaVoluntario): void {
    const faltantes: string[] = [];

    // Comprobacion deliberadamente laxa: la forma exacta la valida Cognito, que es
    // quien manda. Aqui solo se evita gastar un viaje de red en algo evidente.
    if (!alta?.correo?.includes('@')) faltantes.push('correo debe ser una direccion valida');
    if (!alta?.clave || alta.clave.length < 8) faltantes.push('la clave debe tener al menos 8 caracteres');

    // Nombres COMPLETOS: se exigen dos palabras. Un «Juan» suelto no distingue a
    // nadie el dia que una entidad pregunte quien levanto un caso.
    const nombre = (alta?.nombre ?? '').trim();
    if (nombre.split(/\s+/).filter(Boolean).length < 2) {
      faltantes.push('nombre debe traer nombres y apellidos');
    }

    const documento = (alta?.documento ?? '').replace(/\D/g, '');
    if (documento.length < 5 || documento.length > 15) {
      faltantes.push('documento debe ser una cedula de entre 5 y 15 digitos');
    }

    const telefono = (alta?.telefono ?? '').replace(/\D/g, '');
    if (telefono.length < 7) {
      faltantes.push('telefono es obligatorio y debe tener al menos 7 digitos');
    }

    if (faltantes.length > 0) {
      throw new ErrorRechazo('No se puede dar de alta al voluntario.', faltantes);
    }
  }
}
