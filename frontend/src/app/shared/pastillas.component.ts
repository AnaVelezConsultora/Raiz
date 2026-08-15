import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/** Opcion de una seleccion multiple: el codigo que se guarda y el texto que se lee. */
export interface OpcionPastilla {
  /** Codigo del vocabulario cerrado. Es lo que se persiste y lo que se agrega. */
  v: string;
  /** Texto que ve el voluntario. Puede cambiar sin romper los datos ya guardados. */
  t: string;
}

/**
 * Seleccion multiple en forma de pastillas.
 *
 * Se prefiere a las casillas nativas porque el objetivo tactil es todo el rotulo y no
 * un cuadrito de 16 px. En campo, con el celular en una mano y bajo sol directo, esa
 * diferencia decide si el dato se captura bien o se captura mal.
 *
 * GUARDA CODIGOS, MUESTRA TEXTO. Lo que se persiste es `v`; lo que se lee es `t`.
 * Separarlos permite corregir una redaccion sin invalidar los registros anteriores, y
 * permite que el consolidado se pueda sumar: con texto libre, "agua" y "agua potable"
 * serian dos necesidades distintas.
 *
 * @version 0.2.0
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
        @for (opcion of opciones(); track opcion.v) {
          <label class="pastilla" [class.activa]="estaActiva(opcion.v)">
            <input
              type="checkbox"
              [checked]="estaActiva(opcion.v)"
              (change)="alternar(opcion.v)"
              [attr.aria-label]="opcion.t" />
            {{ opcion.t }}
          </label>
        }
      </div>
    </fieldset>
  `
})
export class PastillasComponent {
  readonly etiqueta = input.required<string>();
  readonly opciones = input.required<readonly OpcionPastilla[]>();
  readonly pista = input<string>('');

  /** Codigos seleccionados. Bidireccional mediante model(). */
  readonly seleccion = model.required<string[]>();

  estaActiva(codigo: string): boolean {
    return this.seleccion().includes(codigo);
  }

  alternar(codigo: string): void {
    const actual = this.seleccion();
    this.seleccion.set(
      actual.includes(codigo) ? actual.filter((c) => c !== codigo) : [...actual, codigo]
    );
  }
}
