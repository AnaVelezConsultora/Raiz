import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Zona } from '../../core/domain/enums';
import { OPCIONES } from '../../core/services/caso-form.service';
import { PastillasComponent } from '../../shared/pastillas.component';

/**
 * Paso 3. Vivienda, dano y anexo segun la zona.
 *
 * Dos campos de este paso son los que mas se olvidan en los censos y los que mas
 * dejan familias por fuera de la ayuda:
 *
 *  - TENENCIA: el arrendatario perdio el techo aunque no sea dueno. Si no queda
 *    registrado, no aplica a subsidio de arriendo.
 *  - HOGARES EN LA MISMA ESTRUCTURA: una casa danada puede ser tres familias
 *    damnificadas. Contar viviendas subestima la emergencia.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-paso-vivienda',
  imports: [ReactiveFormsModule, PastillasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" [formGroup]="form()">
      <section class="pila-sm" formGroupName="vivienda">
        <h3>La vivienda</h3>

        <div class="campo">
          <label for="ten">Relacion con la vivienda</label>
          <select id="ten" formControlName="tenencia">
            @for (o of tenencias; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
          <span class="pista">Los arrendatarios se registran: aplican a subsidio de arriendo.</span>
        </div>

        <div class="campo">
          <label for="hog">Cuantas familias vivian en esa misma casa o estructura</label>
          <input id="hog" type="number" inputmode="numeric" min="1" formControlName="hogaresEnEstructura" />
          <span class="pista">Si son varias, se llena un formulario por cada familia.</span>
        </div>

        <div class="campo">
          <label for="afec">Nivel de afectacion</label>
          <select id="afec" formControlName="afectacion">
            @for (o of afectaciones; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>

        <label class="pastilla" [class.activa]="habitable()">
          <input type="checkbox" formControlName="habitable" />
          La vivienda es habitable hoy
        </label>

        <label class="pastilla" [class.activa]="riesgo()">
          <input type="checkbox" formControlName="riesgoColapso" />
          Hay riesgo inminente de colapso
        </label>

        @if (riesgo()) {
          <div class="campo">
            <label for="rdesc">Describa el riesgo</label>
            <textarea id="rdesc" formControlName="riesgoColapsoDesc"
                      placeholder="Que estructura amenaza caer y sobre quien"></textarea>
          </div>
          <p class="aviso peligro">
            Riesgo de colapso. Marque prioridad P0 en el ultimo paso y avise al
            coordinador hoy mismo, sin esperar a sincronizar.
          </p>
        }

        <div class="campo">
          <label for="duerme">Donde esta durmiendo la familia hoy</label>
          <select id="duerme" formControlName="dondeDuerme">
            @for (o of lugares; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>
      </section>

      <app-pastillas
        etiqueta="Que requiere la vivienda"
        [opciones]="opcRequiereVivienda"
        [(seleccion)]="requiereVivienda" />

      <app-pastillas
        etiqueta="Servicios interrumpidos"
        [opciones]="opcServicios"
        [(seleccion)]="serviciosAfectados" />

      @if (esRural()) {
        <section class="pila-sm" formGroupName="rural">
          <h3>Predio, cultivos y animales</h3>
          <p class="pista">Este bloque alimenta el reporte a la Secretaria de Agricultura y Pesca.</p>

          <div class="fila">
            <div class="campo" style="flex:1">
              <label for="area">Area del predio (ha)</label>
              <input id="area" type="number" inputmode="decimal" min="0" step="0.1" formControlName="areaHa" />
            </div>
            <div class="campo" style="flex:1">
              <label for="areac">Area de cultivo afectada (ha)</label>
              <input id="areac" type="number" inputmode="decimal" min="0" step="0.1"
                     formControlName="areaCultivoAfectadaHa" />
            </div>
          </div>

          <div class="campo">
            <label for="via">Estado de la via de acceso</label>
            <select id="via" formControlName="viaAcceso">
              <option [value]="null">Seleccione</option>
              @for (v of vias; track v) {
                <option [value]="v">{{ v }}</option>
              }
            </select>
            <span class="pista">Define si puede entrar ayuda en vehiculo.</span>
          </div>

          <div class="campo">
            <label for="perd">Perdida estimada de la produccion (%)</label>
            <input id="perd" type="number" inputmode="numeric" min="0" max="100" formControlName="perdidaPct" />
          </div>

          <div class="fila">
            <div class="campo" style="flex:1">
              <label for="bov">Bovinos perdidos</label>
              <input id="bov" type="number" inputmode="numeric" min="0" formControlName="bovinosPerdidos" />
            </div>
            <div class="campo" style="flex:1">
              <label for="aves">Aves perdidas</label>
              <input id="aves" type="number" inputmode="numeric" min="0" formControlName="avesPerdidas" />
            </div>
          </div>
        </section>

        <app-pastillas etiqueta="Cultivos afectados" [opciones]="opcCultivos" [(seleccion)]="cultivos" />
        <app-pastillas etiqueta="Infraestructura productiva afectada"
                       [opciones]="opcInfra" [(seleccion)]="infraProductiva" />
        <app-pastillas etiqueta="Que requiere para reactivar produccion"
                       [opciones]="opcAgro" [(seleccion)]="requiereAgro" />
      } @else {
        <section class="pila-sm" formGroupName="urbano">
          <h3>Anexo urbano</h3>
          <div class="campo">
            <label for="est">Estrato</label>
            <select id="est" formControlName="estrato">
              <option [value]="null">Seleccione</option>
              @for (e of estratos; track e) {
                <option [value]="e">{{ e }}</option>
              }
            </select>
          </div>
          <label class="pastilla" [class.activa]="perdioMedioVida()">
            <input type="checkbox" formControlName="perdioMedioVida" />
            La familia perdio su fuente de ingreso, negocio o local
          </label>
          @if (perdioMedioVida()) {
            <div class="campo">
              <label for="mvd">Describa la perdida</label>
              <textarea id="mvd" formControlName="medioVidaDesc"></textarea>
            </div>
          }
        </section>

        <app-pastillas etiqueta="Que requiere la familia"
                       [opciones]="opcUrbano" [(seleccion)]="requiereUrbano" />
      }
    </div>
  `
})
export class PasoViviendaComponent {
  readonly form = input.required<FormGroup>();

  readonly requiereVivienda = model.required<string[]>();
  readonly serviciosAfectados = model.required<string[]>();
  readonly cultivos = model.required<string[]>();
  readonly infraProductiva = model.required<string[]>();
  readonly requiereAgro = model.required<string[]>();
  readonly requiereUrbano = model.required<string[]>();

  readonly tenencias = OPCIONES.tenencia;
  readonly afectaciones = OPCIONES.afectacion;
  readonly lugares = OPCIONES.dondeDuerme;
  readonly vias = OPCIONES.viaAcceso;
  readonly estratos = OPCIONES.estrato;
  readonly opcRequiereVivienda = OPCIONES.requiereVivienda;
  readonly opcServicios = OPCIONES.servicios;
  readonly opcCultivos = OPCIONES.cultivos;
  readonly opcInfra = OPCIONES.infraProductiva;
  readonly opcAgro = OPCIONES.requiereAgro;
  readonly opcUrbano = OPCIONES.requiereUrbano;

  readonly esRural = computed(() => this.form().get('ubicacion.zona')?.value === Zona.Rural);

  habitable(): boolean {
    return this.form().get('vivienda.habitable')?.value === true;
  }

  riesgo(): boolean {
    return this.form().get('vivienda.riesgoColapso')?.value === true;
  }

  perdioMedioVida(): boolean {
    return this.form().get('urbano.perdioMedioVida')?.value === true;
  }
}
