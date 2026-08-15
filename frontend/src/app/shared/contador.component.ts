import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Contador de personas: menos, numero, mas.
 *
 * POR QUE NO ES UN CAMPO NUMERICO NORMAL
 *
 * El voluntario esta de pie, con el celular en una mano y la familia esperando. Un
 * campo numerico abre el teclado, y el teclado tapa la mitad inferior de la pantalla:
 * al llenar la cuarta fila de la rejilla de edades ya no se ve lo que se escribio en
 * la primera, ni el aviso de que la suma no cuadra. Diez campos numericos son diez
 * aperturas de teclado para escribir, casi siempre, un digito.
 *
 * Con botones no se abre teclado nunca. Un hogar de cinco personas se llena tocando
 * cinco veces, viendo la rejilla completa todo el tiempo.
 *
 * El numero igual se puede escribir a mano, para el hogar grande o el error que hay
 * que corregir de una. Es `type="text"` con teclado numerico, no `type="number"`: el
 * campo numerico de HTML cambia de valor cuando se desliza el dedo encima, y en un
 * formulario largo que se recorre deslizando eso altera datos sin que nadie se entere.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-contador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ContadorComponent),
      multi: true
    }
  ],
  template: `
    <div class="contador" [class.en-cero]="valor() === 0">
      <button type="button" class="contador-boton"
              [disabled]="deshabilitado() || valor() <= minimo()"
              [attr.aria-label]="'Quitar uno a ' + etiqueta()"
              (click)="restar()">&minus;</button>

      <input class="contador-valor" type="text" inputmode="numeric"
             [attr.aria-label]="etiqueta()"
             [value]="valor()"
             [disabled]="deshabilitado()"
             (input)="escribir($event)"
             (blur)="alSalir()" />

      <button type="button" class="contador-boton"
              [disabled]="deshabilitado()"
              [attr.aria-label]="'Agregar uno a ' + etiqueta()"
              (click)="sumar()">+</button>
    </div>
  `
})
export class ContadorComponent implements ControlValueAccessor {
  /** Se lee en voz alta por el lector de pantalla. No se pinta. */
  readonly etiqueta = input<string>('cantidad');
  readonly minimo = input<number>(0);

  readonly valor = signal(0);
  readonly deshabilitado = signal(false);

  private alCambiar: (v: number) => void = () => undefined;
  private alTocar: () => void = () => undefined;

  writeValue(v: number | string | null): void {
    this.valor.set(this.normalizar(v));
  }

  registerOnChange(fn: (v: number) => void): void {
    this.alCambiar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.alTocar = fn;
  }

  setDisabledState(estado: boolean): void {
    this.deshabilitado.set(estado);
  }

  sumar(): void {
    this.fijar(this.valor() + 1);
  }

  restar(): void {
    this.fijar(this.valor() - 1);
  }

  escribir(evento: Event): void {
    const crudo = (evento.target as HTMLInputElement).value;
    // Se acepta el vacio mientras se escribe: obligar a que siempre haya un numero
    // impide borrar para reescribir.
    this.fijar(crudo === '' ? this.minimo() : this.normalizar(crudo));
  }

  alSalir(): void {
    this.alTocar();
  }

  private fijar(v: number): void {
    const acotado = Math.max(this.minimo(), v);
    this.valor.set(acotado);
    this.alCambiar(acotado);
  }

  private normalizar(v: number | string | null): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(this.minimo(), Math.trunc(n)) : this.minimo();
  }
}
