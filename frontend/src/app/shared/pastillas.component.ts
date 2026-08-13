import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * Seleccion multiple en forma de pastillas.
 *
 * Se prefiere a las casillas nativas porque el objetivo tactil es todo el rotulo y
 * no un cuadrito de 16 px. En campo, con el celular en una mano y bajo sol directo,
 * esa diferencia decide si el dato se captura bien o se captura mal.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-pastillas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="grupo campo">
      <legend>{{ etiqueta() }}</legend>
      @if (pista()) {
        <p class="pista">{{ pista() }}</p>
      }
      <div class="pastillas">
        @for (opcion of opciones(); track opcion) {
          <label class="pastilla" [class.activa]="estaActiva(opcion)">
            <input
              type="checkbox"
              [checked]="estaActiva(opcion)"
              (change)="alternar(opcion)"
              [attr.aria-label]="opcion" />
            {{ opcion }}
          </label>
        }
      </div>
    </fieldset>
  `
})
export class PastillasComponent {
  readonly etiqueta = input.required<string>();
  readonly opciones = input.required<readonly string[]>();
  readonly pista = input<string>('');

  /** Seleccion actual. Bidireccional mediante model(). */
  readonly seleccion = model.required<string[]>();

  estaActiva(opcion: string): boolean {
    return this.seleccion().includes(opcion);
  }

  alternar(opcion: string): void {
    const actual = this.seleccion();
    this.seleccion.set(
      actual.includes(opcion) ? actual.filter((o) => o !== opcion) : [...actual, opcion]
    );
  }
}
