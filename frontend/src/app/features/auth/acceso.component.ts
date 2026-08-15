import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SesionService } from '../../core/services/sesion.service';

/**
 * Pantalla de acceso.
 *
 * Dice de frente lo unico que el voluntario necesita saber sobre conectividad: hay
 * que entrar UNA vez con senal, y despues se trabaja sin ella.
 *
 * -----------------------------------------------------------------------------
 * LO QUE SE CORRIGIO EL 15 DE AGOSTO DE 2026, Y POR QUE IMPORTA
 * -----------------------------------------------------------------------------
 *
 * Esta es la primera pantalla que ve un voluntario, y era la peor de la aplicacion.
 *
 * 1. EL BOTON DESHABILITADO SIN EXPLICACION. "Entrar" arrancaba apagado hasta que el
 *    formulario fuera valido, y no decia por que. Alguien que escribe su correo con
 *    un espacio de mas ve un boton muerto y no tiene forma de saber que le falta.
 *    Ahora el boton SIEMPRE se puede tocar: al enviar, si algo falta, se dice cual
 *    campo y que le pasa. Un mensaje se lee; un boton apagado se interpreta.
 *
 * 2. EL TECLADO DEL CELULAR SABOTEABA EL CORREO. Sin `autocapitalize`, iOS pone
 *    mayuscula a la primera letra: el voluntario escribe "Ana@..." sin notarlo y el
 *    ingreso falla con "correo o clave incorrectos". Es un fallo que no se reproduce
 *    en un escritorio y que en campo cuesta la jornada.
 *
 * 3. "VER LA CLAVE" ERA UNA PASTILLA SUELTA debajo del campo, que parecia otro boton
 *    de accion. Ahora va en la linea de la etiqueta, a la derecha, que es donde la
 *    gente ya la busca.
 *
 * @version 0.2.0
 */
@Component({
  selector: 'app-acceso',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:2rem 1rem 3rem;max-width:26rem">
      <header class="pila-sm">
        <h1>Entrar a Raíz</h1>
        <p class="tenue" style="margin:0">
          Necesita conexión solo para entrar. Después puede registrar familias en la
          vereda sin señal, y sincronizar cuando vuelva a tenerla.
        </p>
      </header>

      @if (!configurado) {
        <p class="aviso">
          El servidor todavía no está configurado. La aplicación funciona en modo
          local: los registros se guardan en este celular.
        </p>
        <button type="button" class="btn-primario btn-ancho btn-grande" (click)="entrarLocal()">
          Continuar sin cuenta
        </button>
      } @else {
        <!-- novalidate: la validacion del navegador muestra globos en ingles y con
             textos que no podemos redactar. Se valida aqui y se explica en espanol. -->
        <form class="pila" [formGroup]="form" (ngSubmit)="entrar()" novalidate>
          <div class="campo" [class.invalido]="correoMal()">
            <label for="correo">Correo</label>
            <input
              id="correo"
              type="email"
              inputmode="email"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="next"
              formControlName="correo"
              [attr.aria-invalid]="correoMal()"
              [attr.aria-describedby]="correoMal() ? 'error-correo' : null" />
            @if (correoMal()) {
              <p class="error" id="error-correo" style="margin:0">
                Escriba un correo completo, como nombre&#64;ejemplo.com
              </p>
            }
          </div>

          <div class="campo" [class.invalido]="claveMal()">
            <div class="campo-cabecera">
              <label for="clave">Clave</label>
              <button type="button" class="enlace-accion" (click)="verClave.set(!verClave())">
                {{ verClave() ? 'Ocultar' : 'Ver la clave' }}
              </button>
            </div>
            <input
              id="clave"
              [type]="verClave() ? 'text' : 'password'"
              autocomplete="current-password"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="go"
              formControlName="clave"
              [attr.aria-invalid]="claveMal()"
              [attr.aria-describedby]="claveMal() ? 'error-clave' : null" />
            @if (claveMal()) {
              <p class="error" id="error-clave" style="margin:0">
                La clave tiene al menos 8 caracteres.
              </p>
            }
          </div>

          @if (sesion.error()) {
            <p class="aviso peligro" style="margin:0" role="alert">{{ sesion.error() }}</p>
          }

          <!-- Solo se deshabilita mientras la peticion viaja, para no mandarla dos
               veces. Nunca por el estado del formulario: ver el comentario de arriba. -->
          <button
            type="submit"
            class="btn-primario btn-ancho btn-grande"
            [disabled]="sesion.cargando()">
            {{ sesion.cargando() ? 'Entrando…' : 'Entrar' }}
          </button>
        </form>

        <p class="pista" style="margin:0">
          ¿No tiene cuenta? El coordinador se la crea y le asigna un rol. No hay
          registro abierto: los datos de las familias son sensibles.
        </p>
      }
    </div>
  `
})
export class AccesoComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly sesion = inject(SesionService);
  readonly verClave = signal(false);
  readonly configurado = environment.apiUrl !== '';

  /** Se levanta al primer envio. Antes de eso no se le senala nada a nadie. */
  private readonly intentado = signal(false);

  readonly form = this.fb.nonNullable.group({
    correo: ['', [Validators.required, Validators.email]],
    clave: ['', [Validators.required, Validators.minLength(8)]]
  });

  // Los errores aparecen DESPUES de intentar entrar, no mientras se escribe.
  // Senalar "correo invalido" a alguien que va por la tercera letra es reganarlo por
  // no haber terminado.
  readonly correoMal = computed(() => this.intentado() && this.form.controls.correo.invalid);
  readonly claveMal = computed(() => this.intentado() && this.form.controls.clave.invalid);

  async entrar(): Promise<void> {
    this.intentado.set(true);
    if (this.form.invalid) {
      // Llevar el foco al primer campo con problema: en un celular el error puede
      // quedar fuera de la pantalla y el voluntario solo ve que "no pasa nada".
      const id = this.form.controls.correo.invalid ? 'correo' : 'clave';
      document.getElementById(id)?.focus();
      return;
    }

    const ok = await this.sesion.iniciarSesion(this.form.getRawValue());
    if (ok) void this.router.navigateByUrl(this.destino());
  }

  entrarLocal(): void {
    void this.router.navigateByUrl(this.destino());
  }

  private destino(): string {
    return this.ruta.snapshot.queryParamMap.get('volverA') ?? '/casos';
  }
}
