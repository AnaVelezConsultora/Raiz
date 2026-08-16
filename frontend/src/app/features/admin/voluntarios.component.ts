import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AUTH, AuthPort, PerfilAdministrable } from '../../core/domain/auth.model';
import {
  ROLES_QUE_PUEDE_CREAR,
  Rol,
  faltantesDeAlta,
  faltantesDeClave,
  sugerirClave
} from '../../core/domain/enums';
import { SesionService } from '../../core/services/sesion.service';

/** Etiquetas de rol en el idioma del proyecto, no del esquema. */
const ROLES: readonly { v: Rol; t: string; explica: string }[] = [
  { v: Rol.Lider, t: 'Líder', explica: 'Registra familias. Solo ve lo que él mismo reportó' },
  { v: Rol.Digitador, t: 'Digitador', explica: 'Carga reportes que llegan por otros canales. No exporta' },
  { v: Rol.Validador, t: 'Validador', explica: 'Depura duplicados y verifica casos' },
  { v: Rol.Coordinador, t: 'Coordinador', explica: 'Ve todo y firma las remisiones a las entidades' },
  { v: Rol.Custodio, t: 'Custodia de datos', explica: 'Administra accesos y autoriza exportaciones' }
];

/**
 * Administración de voluntarios.
 *
 * QUE DECIDE QUIEN USA ESTA PANTALLA
 *
 * La cuenta la crea la custodia desde `POST /voluntarios` y nace con el rol menos
 * privilegiado. Aquí se hacen las dos cosas que vienen después: ascender a alguien
 * cuando el equipo lo necesita, y retirarle el acceso a quien se va. No hay registro
 * abierto, y esta pantalla no lo suple.
 *
 * Retirar el acceso NO borra los casos que la persona levantó. La familia sigue
 * contada y el registro conserva quién la reportó: sacar a alguien del equipo no
 * puede borrar el trabajo hecho ni romper la trazabilidad.
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
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:1rem 1rem 4rem">
      <header class="pila-sm">
        <a routerLink="/casos" class="pastilla" style="align-self:flex-start">
          ← Casos
        </a>
        <h1>Voluntarios</h1>
        <p class="tenue">
          {{ activos().length }} con acceso · {{ sinAcceso().length }} sin acceso
        </p>
      </header>

      @if (error()) {
        <p class="aviso peligro">{{ error() }}</p>
      }
      @if (creado()) {
        <div class="aviso exito pila-sm">
          <strong>{{ creado()!.nombre }} ya puede entrar.</strong>
          <span>Entrega estos datos por el canal de la coordinación, nunca por correo:</span>
          <span class="mono">{{ creado()!.correo }}</span>
          <span class="mono">{{ claveEntregada() }}</span>
          <span class="pista">
            No se vuelve a mostrar. Si se pierde, se da de alta otra vez con otra clave.
          </span>
        </div>
      }

      <!-- El alta. Solo aparece si quien mira puede crear a alguien: un validador o
           un digitador no ven un formulario que la API les va a negar. -->
      @if (rolesQuePuedoCrear().length > 0) {
        <section class="tarjeta pila-sm">
          <h3>Dar de alta</h3>
          <p class="pista">
            Quien registra a una familia firma ese registro. Por eso se piden cédula,
            nombres completos y teléfono: el día que una entidad devuelva un caso
            preguntando quién lo levantó, la respuesta es una persona.
          </p>

          <label for="a-nombre">Nombres y apellidos</label>
          <input id="a-nombre" [value]="alta.nombre()" (input)="alta.nombre.set(valor($event))"
                 autocomplete="name" placeholder="Ana María Velásquez" />

          <label for="a-doc">Cédula</label>
          <input id="a-doc" [value]="alta.documento()" (input)="alta.documento.set(valor($event))"
                 inputmode="numeric" placeholder="1094..." />

          <label for="a-tel">Teléfono</label>
          <input id="a-tel" [value]="alta.telefono()" (input)="alta.telefono.set(valor($event))"
                 inputmode="tel" autocomplete="tel" placeholder="3001234567" />

          <label for="a-correo">Correo</label>
          <input id="a-correo" [value]="alta.correo()" (input)="alta.correo.set(valor($event))"
                 inputmode="email" autocomplete="off" placeholder="nombre@ejemplo.org" />

          <label for="a-rol">Rol</label>
          <select id="a-rol" [value]="alta.rol()" (change)="alta.rol.set(valorRol($event))">
            @for (r of rolesQuePuedoCrear(); track r.v) {
              <option [value]="r.v">{{ r.t }}</option>
            }
          </select>
          <span class="pista">{{ explicacion(alta.rol()) }}</span>

          <label for="a-clave">Clave inicial</label>
          <div class="fila" style="flex-wrap:nowrap">
            <input id="a-clave" style="flex:1" [value]="alta.clave()"
                   (input)="alta.clave.set(valor($event))" autocomplete="off" />
            <button type="button" class="btn-secundario" (click)="sugerirClave()">Sugerir</button>
          </div>
          <!-- Se avisa ANTES de enviar, y de TODO lo que falta, no solo de la clave.
               El proveedor de identidad valida tarde —cuando la cuenta ya existe— y
               ese estado a medias es el que confunde a todos. -->
          @if (alta.clave() && faltaEnLaClave().length > 0) {
            <span class="error">La clave necesita {{ faltaEnLaClave().join(', ') }}.</span>
          }
          @if (altaEmpezada() && faltaEnElAlta().length > 0) {
            <span class="pista">Falta {{ faltaEnElAlta().join(' · ') }}.</span>
          }

          <button type="button" class="btn-primario btn-ancho btn-grande"
                  [disabled]="creando() || faltaEnElAlta().length > 0" (click)="crear()">
            {{ creando() ? 'Creando...' : 'Crear la cuenta' }}
          </button>
        </section>
      }

      @if (cargando()) {
        <p class="aviso">Consultando...</p>
      }

      @if (!cargando() && todos().length === 0) {
        <p class="aviso">
          Todavía no hay voluntarios dados de alta, o el servidor no está configurado.
          Las cuentas las crea la custodia; no hay registro abierto.
        </p>
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

      @if (sinAcceso().length > 0) {
        <section class="pila-sm">
          <h3>Sin acceso</h3>
          <p class="pista">
            Conservan su cuenta y los casos que levantaron, pero no pueden entrar.
          </p>
          @for (v of sinAcceso(); track v.id) {
            <article class="tarjeta pila-sm">
              <strong>{{ v.nombre }}</strong>
              <span class="tenue">{{ v.correo }}</span>
              @if (v.telefono) {
                <a class="mono" [href]="'tel:' + v.telefono">{{ v.telefono }}</a>
              }
              <span class="tenue">Cuenta creada el {{ fecha(v.creadoEn) }}</span>

              <button type="button" class="btn-primario"
                      [disabled]="ocupado() === v.id"
                      (click)="activar(v)">
                {{ ocupado() === v.id ? 'Devolviendo...' : 'Devolver el acceso' }}
              </button>
            </article>
          }
        </section>
      }
    </div>
  `
})
export class VoluntariosComponent implements OnInit {
  private readonly auth = inject(AUTH) as AuthPort;
  private readonly sesion = inject(SesionService);

  readonly roles = ROLES;

  /** Lo que quien mira esta pantalla puede crear. Sale del contrato compartido. */
  readonly rolesQuePuedoCrear = computed(() => {
    const mio = this.sesion.rol();
    if (!mio) return [];
    const permitidos = ROLES_QUE_PUEDE_CREAR[mio] ?? [];
    return ROLES.filter((r) => permitidos.includes(r.v));
  });

  readonly creando = signal(false);
  readonly creado = signal<PerfilAdministrable | null>(null);
  readonly claveEntregada = signal('');

  readonly alta = {
    nombre: signal(''),
    documento: signal(''),
    telefono: signal(''),
    correo: signal(''),
    clave: signal(''),
    rol: signal<Rol>(Rol.Lider)
  };

  valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  valorRol(evento: Event): Rol {
    return (evento.target as HTMLSelectElement).value as Rol;
  }

  /**
   * Una clave que cumple la política del proveedor y se puede dictar por teléfono.
   *
   * La genera el dominio compartido, no esta pantalla. Escrita aquí, sugería
   * `abcd-2345-efgh`: sin mayúscula, y con un guion que Cognito no cuenta como
   * símbolo. La cuenta se creaba, el proveedor rechazaba la clave DESPUÉS, y quedaba
   * un voluntario que existe, no puede entrar y no tiene perfil.
   */
  sugerirClave(): void {
    this.alta.clave.set(sugerirClave());
  }

  /** Lo que le falta a la clave escrita. Vacío si sirve. */
  readonly faltaEnLaClave = computed(() => faltantesDeClave(this.alta.clave()));

  /**
   * Lo que le falta al alta completa. Vacío si se puede mandar.
   *
   * Es la MISMA función que usa la API antes de llamar al proveedor de identidad.
   * No se comprueba aquí por comodidad: el proveedor valida tarde —después de haber
   * creado la cuenta— así que un dato que llegue sin comprobar puede dejar un
   * usuario que existe, no puede entrar y no tiene perfil. Que la regla sea una sola
   * es lo que impide que esta pantalla ofrezca un botón que va a fallar.
   */
  readonly faltaEnElAlta = computed(() =>
    faltantesDeAlta({
      correo: this.alta.correo(),
      nombre: this.alta.nombre(),
      documento: this.alta.documento(),
      telefono: this.alta.telefono(),
      clave: this.alta.clave()
    })
  );

  /** True cuando ya se escribió algo: no se regaña a quien no ha empezado. */
  readonly altaEmpezada = computed(() =>
    Boolean(
      this.alta.correo() || this.alta.nombre() || this.alta.documento() ||
      this.alta.telefono() || this.alta.clave()
    )
  );

  async crear(): Promise<void> {
    this.creando.set(true);
    this.error.set(null);
    this.creado.set(null);

    try {
      const clave = this.alta.clave();
      const nuevo = await this.auth.crearVoluntario({
        nombre: this.alta.nombre().trim(),
        documento: this.alta.documento().trim(),
        telefono: this.alta.telefono().trim(),
        correo: this.alta.correo().trim(),
        clave,
        rol: this.alta.rol()
      });

      // La clave se muestra UNA vez y no se guarda en ninguna parte: la entrega la
      // hace una persona por el canal de la coordinación.
      this.claveEntregada.set(clave);
      this.creado.set(nuevo);

      for (const campo of Object.values(this.alta)) {
        if (typeof campo.set === 'function') campo.set('' as never);
      }
      this.alta.rol.set(Rol.Lider);

      await this.recargar();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo crear la cuenta.');
    } finally {
      this.creando.set(false);
    }
  }
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly ocupado = signal<string | null>(null);
  readonly todos = signal<PerfilAdministrable[]>([]);

  readonly activos = computed(() => this.todos().filter((v) => v.activo));
  readonly sinAcceso = computed(() => this.todos().filter((v) => !v.activo));

  async ngOnInit(): Promise<void> {
    await this.recargar();
  }

  async activar(v: PerfilAdministrable): Promise<void> {
    await this.aplicar(v, { activo: true });
  }

  async desactivar(v: PerfilAdministrable): Promise<void> {
    await this.aplicar(v, { activo: false });
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
