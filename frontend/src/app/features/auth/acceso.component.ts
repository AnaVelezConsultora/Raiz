import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SesionService } from '../../core/services/sesion.service';

/**
 * Pantalla de acceso.
 *
 * Dice de frente lo unico que el voluntario necesita saber sobre conectividad:
 * hay que entrar UNA vez con senal, y despues se trabaja sin ella.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-acceso',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:2rem 1rem;max-width:26rem">
      <header class="pila-sm">
        <h1>Entrar a Raíz</h1>
        <p class="tenue">
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
        <form class="pila-sm" [formGroup]="form" (ngSubmit)="entrar()">
          <div class="campo">
            <label for="correo">Correo</label>
            <input id="correo" type="email" inputmode="email" autocomplete="username"
                   formControlName="correo" />
          </div>
          <div class="campo">
            <label for="clave">Clave</label>
            <input id="clave" [type]="verClave() ? 'text' : 'password'"
                   autocomplete="current-password" formControlName="clave" />
            <label class="pastilla" style="align-self:flex-start;margin-top:.35rem"
                   [class.activa]="verClave()">
              <input type="checkbox" [checked]="verClave()" (change)="verClave.set(!verClave())" />
              Ver la clave
            </label>
          </div>

          @if (sesion.error()) {
            <p class="aviso peligro">{{ sesion.error() }}</p>
          }

          <button type="submit" class="btn-primario btn-ancho btn-grande"
                  [disabled]="form.invalid || sesion.cargando()">
            {{ sesion.cargando() ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>

        <p class="pista">
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
  readonly configurado = environment.supabaseUrl !== '';

  readonly form = this.fb.nonNullable.group({
    correo: ['', [Validators.required, Validators.email]],
    clave: ['', [Validators.required, Validators.minLength(8)]]
  });

  async entrar(): Promise<void> {
    if (this.form.invalid) return;
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
