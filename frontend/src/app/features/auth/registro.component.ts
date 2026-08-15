import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AUTH, AuthPort } from '../../core/domain/auth.model';

/**
 * Pedir una cuenta de voluntario.
 *
 * POR QUE EL REGISTRO ES ABIERTO Y LA CUENTA NACE INACTIVA
 *
 * En una emergencia no se puede poner friccion para sumar gente: quien quiera ayudar
 * tiene que poder pedir su cuenta a las once de la noche, sin esperar a que alguien
 * conteste un mensaje.
 *
 * Y a la vez, no puede entrar informacion de familias reales al registro sin que
 * alguien responda por quien la levanto. Por eso la cuenta se crea con el rol menos
 * privilegiado y sin activar: el voluntario se registra y conoce la herramienta, y la
 * custodia de datos la activa cuando confirma quien es.
 *
 * Cero friccion para sumarse, cero datos sin responsable.
 *
 * QUE SE PIDE Y QUE NO. Se piden cinco cosas y tres son obligatorias. La organizacion
 * es texto libre y no un catalogo, porque quien llega no siempre sabe como se llama
 * formalmente su junta, y hacerlo escoger de una lista lo deja por fuera.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:2rem 1rem;max-width:26rem">
      @if (registrado()) {
        <header class="pila-sm">
          <h1>Cuenta creada</h1>
        </header>
        <p class="aviso exito">
          Su cuenta quedo creada. <strong>Falta que la mesa la active</strong> antes de
          que pueda registrar familias.
        </p>
        <p class="tenue">
          No es un tramite: es que ningun dato de una familia entra al registro sin que
          alguien responda por quien lo levanto. Avise en el grupo que ya se registro y
          la activan.
        </p>
        <a routerLink="/acceso" class="btn-primario btn-ancho btn-grande"
           style="text-align:center;display:flex;align-items:center;justify-content:center;
                  border-radius:4px">
          Volver a la pantalla de entrada
        </a>
      } @else {
        <header class="pila-sm">
          <h1>Pedir una cuenta</h1>
          <p class="tenue">
            Para voluntarios, lideres comunales y personas de juntas o asociaciones que
            van a registrar familias afectadas.
          </p>
        </header>

        @if (!configurado) {
          <p class="aviso">
            El servidor todavia no esta configurado. Mientras tanto puede usar la
            aplicacion en modo local desde la pantalla de entrada.
          </p>
        } @else {
          <form class="pila-sm" [formGroup]="form" (ngSubmit)="enviar()">
            <div class="campo">
              <label for="nombre">Su nombre completo</label>
              <input id="nombre" type="text" autocomplete="name" formControlName="nombre" />
              <span class="pista">Con este nombre queda firmado cada caso que registre.</span>
            </div>

            <div class="campo">
              <label for="correo">Correo</label>
              <input id="correo" type="email" inputmode="email" autocomplete="username"
                     formControlName="correo" />
            </div>

            <div class="campo">
              <label for="tel">Celular</label>
              <input id="tel" type="tel" inputmode="tel" formControlName="telefono" />
              <span class="pista">Para poder confirmar quien es usted y activarle la cuenta.</span>
            </div>

            <div class="campo">
              <label for="org">Junta, comite o asociacion</label>
              <input id="org" type="text" formControlName="organizacion"
                     placeholder="Escriba independiente si no pertenece a ninguna" />
            </div>

            <div class="campo" [class.invalido]="claveCorta()">
              <label for="clave">Clave</label>
              <input id="clave" [type]="verClave() ? 'text' : 'password'"
                     autocomplete="new-password" formControlName="clave" />
              @if (claveCorta()) {
                <span class="error">Use al menos 8 caracteres.</span>
              }
              <label class="pastilla" style="align-self:flex-start;margin-top:.35rem"
                     [class.activa]="verClave()">
                <input type="checkbox" [checked]="verClave()"
                       (change)="verClave.set(!verClave())" />
                Ver la clave
              </label>
            </div>

            @if (error()) {
              <p class="aviso peligro">{{ error() }}</p>
            }

            <p class="pista">
              Al crear la cuenta usted se compromete a no compartir con nadie los datos
              de las familias que registre. Son datos sensibles y estan protegidos por
              la Ley 1581 de 2012.
            </p>

            <button type="submit" class="btn-primario btn-ancho btn-grande"
                    [disabled]="form.invalid || enviando()">
              {{ enviando() ? 'Creando la cuenta...' : 'Pedir la cuenta' }}
            </button>
          </form>
        }

        <p class="pista">
          Ya tiene cuenta? <a routerLink="/acceso">Entre por aqui</a>.
        </p>
      }
    </div>
  `
})
export class RegistroComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AUTH) as AuthPort;
  private readonly router = inject(Router);

  readonly configurado = environment.apiUrl !== '';
  readonly verClave = signal(false);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly registrado = signal(false);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    correo: ['', [Validators.required, Validators.email]],
    telefono: ['', Validators.required],
    organizacion: [''],
    clave: ['', [Validators.required, Validators.minLength(8)]]
  });

  claveCorta(): boolean {
    const c = this.form.controls.clave;
    return c.invalid && c.touched;
  }

  async enviar(): Promise<void> {
    if (this.form.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);

    const v = this.form.getRawValue();
    const resultado = await this.auth.registrar({
      nombre: v.nombre,
      correo: v.correo,
      clave: v.clave,
      telefono: v.telefono || null,
      organizacion: v.organizacion || null
    });

    this.enviando.set(false);

    if (!resultado.exito) {
      this.error.set(resultado.error ?? 'No se pudo crear la cuenta.');
      return;
    }

    // Si el servidor la dejo activa, se entra directo; si no, se explica que falta.
    if (resultado.pendienteDeActivacion) {
      this.registrado.set(true);
      return;
    }
    void this.router.navigate(['/acceso']);
  }
}
