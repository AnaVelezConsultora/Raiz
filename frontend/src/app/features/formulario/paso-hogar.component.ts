import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { OPCIONES } from '../../core/services/caso-form.service';
import { PastillasComponent } from '../../shared/pastillas.component';

/**
 * Paso 2. Quienes viven en el hogar.
 *
 * El desagregado por sexo y edad es el bloque que mas se omite y el que las
 * entidades y la cooperacion exigen para asignar ayuda. Se pinta como rejilla de
 * numeros grandes para que se llene rapido, y se avisa cuando la suma no cuadra con
 * el total declarado, sin bloquear: en campo el total suele ser correcto y el
 * desagregado se corrige por telefono.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-paso-hogar',
  imports: [ReactiveFormsModule, PastillasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" [formGroup]="form()">
      @if (consentimiento()) {
        <section class="pila-sm" formGroupName="hogar">
          <h3>Persona responsable del hogar</h3>
          <div class="fila">
            <div class="campo" style="flex:1">
              <label for="nom">Nombres</label>
              <input id="nom" type="text" formControlName="jefeNombres" />
            </div>
            <div class="campo" style="flex:1">
              <label for="ape">Apellidos</label>
              <input id="ape" type="text" formControlName="jefeApellidos" />
            </div>
          </div>
          <div class="campo">
            <label for="tdoc">Tipo de documento</label>
            <select id="tdoc" formControlName="tipoDoc">
              <option [value]="null">Seleccione</option>
              @for (t of tiposDoc; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="ndoc">Numero de documento</label>
            <input id="ndoc" type="text" inputmode="numeric" formControlName="numDoc" />
            <span class="pista">Es la clave para evitar registros duplicados.</span>
          </div>
        </section>
      } @else {
        <p class="aviso peligro">
          La familia no autorizo el tratamiento de datos. No se piden nombre ni
          documento. El caso se registra igual.
        </p>
      }

      <section class="pila-sm" formGroupName="hogar">
        <h3>Contacto</h3>
        <div class="campo" [class.invalido]="telInvalido()">
          <label for="tel1">Celular principal</label>
          <input id="tel1" type="tel" inputmode="tel" formControlName="tel1" />
          @if (telInvalido()) {
            <span class="error">El telefono es obligatorio: sin el no se puede verificar el caso.</span>
          }
        </div>
        <div class="campo">
          <label for="tel2">Celular alterno o de un vecino</label>
          <input id="tel2" type="tel" inputmode="tel" formControlName="tel2" />
        </div>
        <div class="campo" [class.invalido]="totalInvalido()">
          <label for="ptotal">Total de personas en el hogar</label>
          <input id="ptotal" type="number" inputmode="numeric" min="1" formControlName="personasTotal" />
          @if (totalInvalido()) {
            <span class="error">Indique cuantas personas viven en el hogar.</span>
          }
        </div>
      </section>

      <section class="pila-sm">
        <h3>Cuantos son, por edad y sexo</h3>
        <div class="rejilla-edades" formGroupName="composicion">
          <span></span><span class="cab">Hombres</span><span class="cab">Mujeres</span>
          @for (r of rangos; track r.h) {
            <span class="rango">{{ r.t }}</span>
            <input type="number" inputmode="numeric" min="0" [formControlName]="r.h"
                   [attr.aria-label]="'Hombres ' + r.t" />
            <input type="number" inputmode="numeric" min="0" [formControlName]="r.m"
                   [attr.aria-label]="'Mujeres ' + r.t" />
          }
        </div>

        @if (descuadre()) {
          <p class="aviso peligro">
            La suma por edades da {{ sumaEdades() }} y el total declarado es
            {{ totalDeclarado() }}. Revise antes de continuar.
          </p>
        }
      </section>

      <section class="pila-sm" formGroupName="vulnerabilidad">
        <h3>Condiciones especiales</h3>
        <div class="fila">
          <div class="campo" style="flex:1">
            <label for="gest">Gestantes</label>
            <input id="gest" type="number" inputmode="numeric" min="0" formControlName="gestantes" />
          </div>
          <div class="campo" style="flex:1">
            <label for="disc">Con discapacidad</label>
            <input id="disc" type="number" inputmode="numeric" min="0" formControlName="discapacidadN" />
          </div>
          <div class="campo" style="flex:1">
            <label for="enf">Enfermedad cronica</label>
            <input id="enf" type="number" inputmode="numeric" min="0" formControlName="enfCronicaN" />
          </div>
        </div>
      </section>

      <app-pastillas
        etiqueta="A que organizacion pertenece la familia"
        pista="Marque No afiliada si no pertenece a ninguna. Las familias no afiliadas tambien se registran."
        [opciones]="opcionesAfiliacion"
        [(seleccion)]="afiliacion" />
    </div>
  `
})
export class PasoHogarComponent {
  readonly form = input.required<FormGroup>();
  readonly afiliacion = model.required<string[]>();

  readonly tiposDoc = OPCIONES.tipoDoc;
  readonly opcionesAfiliacion = OPCIONES.afiliacion;

  readonly rangos = [
    { t: '0 a 5', h: 'h0a5', m: 'm0a5' },
    { t: '6 a 11', h: 'h6a11', m: 'm6a11' },
    { t: '12 a 17', h: 'h12a17', m: 'm12a17' },
    { t: '18 a 59', h: 'h18a59', m: 'm18a59' },
    { t: '60 o mas', h: 'h60mas', m: 'm60mas' }
  ] as const;

  readonly consentimiento = computed(
    () => this.form().get('control.consentimiento')?.value === true
  );

  sumaEdades(): number {
    const grupo = this.form().get('composicion');
    if (!grupo) return 0;
    const valores = grupo.value as Record<string, number | string>;
    return Object.values(valores).reduce<number>((a, v) => a + (Number(v) || 0), 0);
  }

  totalDeclarado(): number {
    return Number(this.form().get('hogar.personasTotal')?.value) || 0;
  }

  descuadre(): boolean {
    const total = this.totalDeclarado();
    const suma = this.sumaEdades();
    return total > 0 && suma > 0 && total !== suma;
  }

  telInvalido(): boolean {
    const c = this.form().get('hogar.tel1');
    return !!c && c.invalid && c.touched;
  }

  totalInvalido(): boolean {
    const c = this.form().get('hogar.personasTotal');
    return !!c && c.invalid && c.touched;
  }
}
