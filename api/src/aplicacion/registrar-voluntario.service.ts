import { Rol } from '@raiz/dominio';
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
  nombre: string;
  telefono: string | null;
  clave: string;
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

  /** Quienes pueden dar de alta. Se declara aqui y no en el controlador. */
  private static readonly PUEDEN_DAR_DE_ALTA: readonly Rol[] = [Rol.Custodio, Rol.Coordinador];

  constructor(
    @Inject(ADMINISTRADOR_IDENTIDAD) private readonly proveedor: AdministradorIdentidadPort,
    @Inject(PERFIL_REPOSITORIO) private readonly perfiles: PerfilRepositorioPort
  ) {}

  async ejecutar(alta: AltaVoluntario, quienPide: Identidad): Promise<VoluntarioCreado> {
    await this.exigirPermiso(quienPide);
    this.validar(alta);

    const correo = alta.correo.trim().toLowerCase();
    const nombre = alta.nombre.trim();

    const { sub, yaExistia } = await this.proveedor.crearVoluntario(
      correo,
      nombre,
      alta.telefono,
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

    await this.perfiles.reflejarDelProveedor({ sub, correo, nombre, telefono: alta.telefono });

    this.log.log(`Voluntario ${sub} dado de alta por ${quienPide.sub}`);

    // Nace con el rol menos privilegiado, que es el que pone el disparador. Ascender
    // es una accion aparte y deliberada del custodio.
    return { sub, correo, nombre, rol: Rol.Lider };
  }

  /**
   * El rol se lee de la base en el momento, no del token.
   *
   * Si viviera en el token, retirarle el permiso a alguien no surtiria efecto hasta
   * que su token caducara. Aqui el custodio revoca y en la siguiente peticion ya no
   * puede dar de alta a nadie.
   */
  private async exigirPermiso(quien: Identidad): Promise<void> {
    const perfil: Perfil | null = await this.perfiles.porSub(quien.sub);

    if (!perfil || !perfil.activo) {
      throw new ErrorSesion('Su acceso no esta activo.');
    }
    if (!RegistrarVoluntarioService.PUEDEN_DAR_DE_ALTA.includes(perfil.rol)) {
      // Clase sesion y no rechazo: el problema no es el dato que mando, es que no
      // tiene permiso. Decirle "revise los campos" seria mandarlo a buscar donde no es.
      throw new ErrorSesion('Solo el custodio de datos puede dar de alta voluntarios.');
    }
  }

  private validar(alta: AltaVoluntario): void {
    const faltantes: string[] = [];

    // Comprobacion deliberadamente laxa: la forma exacta la valida Cognito, que es
    // quien manda. Aqui solo se evita gastar un viaje de red en algo evidente.
    if (!alta?.correo?.includes('@')) faltantes.push('correo debe ser una direccion valida');
    if (!alta?.nombre?.trim()) faltantes.push('nombre es obligatorio');
    if (!alta?.clave || alta.clave.length < 8) faltantes.push('la clave debe tener al menos 8 caracteres');

    if (faltantes.length > 0) {
      throw new ErrorRechazo('No se puede dar de alta al voluntario.', faltantes);
    }
  }
}
