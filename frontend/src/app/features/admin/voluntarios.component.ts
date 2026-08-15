import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AUTH, AuthPort, PerfilAdministrable } from '../../core/domain/auth.model';
import { Rol } from '../../core/domain/enums';

/** Etiquetas de rol en el idioma del proyecto, no del esquema. */
const ROLES: readonly { v: Rol; t: string; explica: string }[] = [
  { v: Rol.Lider, t: 'Líder', explica: 'Registra familias. Solo ve lo que él mismo reportó' },
  { v: Rol.Digitador, t: 'Digitador', explica: 'Carga reportes que llegan por otros canales. No exporta' },
  { v: Rol.Validador, t: 'Validador', explica: 'Depura duplicados y verifica casos' },
  { v: Rol.Coordinador, t: 'Coordinador', explica: 'Ve todo y firma las remisiones a las entidades' },
  { v: Rol.Custodio, t: 'Custodia de datos', explica: 'Administra accesos y autoriza exportaciones' }
];

/**
 * Activación de voluntarios.
 *
 * QUE DECIDE QUIEN USA ESTA PANTALLA
 *
 * Activar una cuenta no es un trámite: es decir que esta persona puede empezar a
 * registrar familias reales, y que sus datos van a entrar al registro que después se
 * remite a las entidades. Por eso la pantalla muestra lo que la persona declaró y no
 * solo su nombre, y por eso el botón dice lo que va a pasar.
 *
 * LA PANTALLA NO ES LA PROTECCION
 *
 * Que solo la vea la custodia es comodidad de navegación. Lo que impide que otro
 * cambie un rol es la política de acceso por fila del servidor —`custodio_administra_
 * perfiles` en el esquema—, no esta guarda. Si un día alguien llega a esta ruta sin
 * permiso, la API le dirá que no.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-voluntarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:1rem 1rem 4rem">
      <header class="pila-sm">
        <h1>Voluntarios</h1>
        <p class="tenue">
          {{ pendientes().length }} esperando activación · {{ activos().length }} activos
        </p>
      </header>

      @if (error()) {
        <p class="aviso peligro">{{ error() }}</p>
      }

      @if (cargando()) {
        <p class="aviso">Consultando...</p>
      }

      @if (!cargando() && pendientes().length === 0 && activos().length === 0) {
        <p class="aviso">
          Todavía no hay voluntarios registrados, o el servidor no está configurado.
        </p>
      }

      @if (pendientes().length > 0) {
        <section class="pila-sm">
          <h3>Esperando activación</h3>
          <p class="pista">
            Confirme quién es cada persona antes de activarla. Al activarla podrá
            registrar familias reales, y esos datos entran al registro que se remite a
            las entidades.
          </p>

          @for (v of pendientes(); track v.id) {
            <article class="tarjeta pila-sm">
              <strong>{{ v.nombre }}</strong>
              <span class="tenue">{{ v.correo }}</span>
              @if (v.telefono) {
                <a class="mono" [href]="'tel:' + v.telefono">{{ v.telefono }}</a>
              }
              <span class="tenue">
                Dice pertenecer a:
                <strong>{{ v.organizacionDeclarada || 'no indicó ninguna' }}</strong>
                <br />Se registró el {{ fecha(v.creadoEn) }}
              </span>

              <div class="fila">
                <button type="button" class="btn-primario"
                        [disabled]="ocupado() === v.id"
                        (click)="activar(v)">
                  {{ ocupado() === v.id ? 'Activando...' : 'Activar como líder' }}
                </button>
                <button type="button" class="btn-secundario"
                        [disabled]="ocupado() === v.id"
                        (click)="rechazar(v)">
                  Dejar sin activar
                </button>
              </div>
            </article>
          }
        </section>
      }

      @if (activos().length > 0) {
        <section class="pila-sm">
          <h3>Con acceso</h3>
          @for (v of activos(); track v.id) {
            <article class="tarjeta pila-sm">
              <div class="fila" style="justify-content:space-between">
                <strong>{{ v.nombre }}</strong>
                <span class="chip sincronizado">{{ etiquetaRol(v.rol) }}</span>
              </div>
              <span class="tenue">{{ v.correo }}</span>

              <div class="campo">
                <label [attr.for]="'rol-' + v.id">Rol</label>
                <select [attr.id]="'rol-' + v.id" [value]="v.rol"
                        [disabled]="ocupado() === v.id"
                        (change)="cambiarRol(v, $event)">
                  @for (r of roles; track r.v) {
                    <option [value]="r.v">{{ r.t }}</option>
                  }
                </select>
                <span class="pista">{{ explicacion(v.rol) }}</span>
              </div>

              <button type="button" class="btn-peligro"
                      [disabled]="ocupado() === v.id"
                      (click)="desactivar(v)">
                Retirar el acceso
              </button>
            </article>
          }
          <p class="pista">
            Retirar el acceso <strong>no borra los casos</strong> que la persona
            levantó. La familia sigue contada y el registro conserva quién la reportó.
          </p>
        </section>
      }
    </div>
  `
})
export class VoluntariosComponent implements OnInit {
  private readonly auth = inject(AUTH) as AuthPort;

  readonly roles = ROLES;
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly ocupado = signal<string | null>(null);
  private readonly todos = signal<PerfilAdministrable[]>([]);

  readonly pendientes = computed(() => this.todos().filter((v) => !v.activo));
  readonly activos = computed(() => this.todos().filter((v) => v.activo));

  async ngOnInit(): Promise<void> {
    await this.recargar();
  }

  async activar(v: PerfilAdministrable): Promise<void> {
    await this.aplicar(v, { activo: true });
  }

  async desactivar(v: PerfilAdministrable): Promise<void> {
    await this.aplicar(v, { activo: false });
  }

  /**
   * Dejar sin activar es simplemente no hacer nada, y se dice en voz alta.
   *
   * No hay boton de rechazar en el servidor a proposito: una cuenta que nunca se
   * activa no puede hacer nada, y borrarla obligaria a la persona a registrarse otra
   * vez si despues resulta que si era de confianza.
   */
  rechazar(v: PerfilAdministrable): void {
    this.error.set(
      `${v.nombre} queda sin activar. No puede registrar familias hasta que alguien la active.`
    );
  }

  async cambiarRol(v: PerfilAdministrable, evento: Event): Promise<void> {
    const rol = (evento.target as HTMLSelectElement).value as Rol;
    if (rol === v.rol) return;
    await this.aplicar(v, { rol });
  }

  etiquetaRol(rol: Rol): string {
    return ROLES.find((r) => r.v === rol)?.t ?? rol;
  }

  explicacion(rol: Rol): string {
    return ROLES.find((r) => r.v === rol)?.explica ?? '';
  }

  fecha(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private async aplicar(
    v: PerfilAdministrable,
    cambio: { activo?: boolean; rol?: Rol }
  ): Promise<void> {
    this.ocupado.set(v.id);
    this.error.set(null);

    try {
      const actualizado = await this.auth.cambiarVoluntario(v.id, cambio);
      // Se reemplaza con lo que devolvio el servidor, no con lo que se pidio: si la
      // API aplico algo distinto, la pantalla muestra lo que de verdad quedo.
      this.todos.update((lista) => lista.map((x) => (x.id === v.id ? actualizado : x)));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo aplicar el cambio.');
    } finally {
      this.ocupado.set(null);
    }
  }

  private async recargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.todos.set(await this.auth.listarVoluntarios());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo consultar la lista.');
    } finally {
      this.cargando.set(false);
    }
  }
}
