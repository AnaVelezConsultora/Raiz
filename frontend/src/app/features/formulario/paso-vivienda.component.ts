import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NivelAfectacion, Zona } from '../../core/domain/enums';
import { OPCIONES } from '../../core/services/caso-form.service';
import { ContadorComponent } from '../../shared/contador.component';
import { PastillasComponent } from '../../shared/pastillas.component';

/** Niveles de dano con los que decir que la casa es habitable es una contradiccion. */
const NIVELES_INHABITABLES: readonly string[] = [
  NivelAfectacion.Severo,
  NivelAfectacion.Destruida,
  NivelAfectacion.Riesgo
];

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
  imports: [ReactiveFormsModule, PastillasComponent, ContadorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" [formGroup]="form()">
      <section class="pila-sm" formGroupName="vivienda">
        <h3>La vivienda</h3>

        @if (heredado()) {
          <p class="aviso">
            El estado del inmueble viene del registro anterior de esta misma casa:
            afectacion, riesgo y servicios. Corrijalo si no coincide. La tenencia y
            donde duerme esta familia se preguntan de nuevo, porque son de ella.
          </p>
        }

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
          <div class="fila" style="flex-wrap:nowrap">
            <app-contador formControlName="hogaresEnEstructura" [minimo]="1"
                          etiqueta="Familias en la misma estructura" />
          </div>
          <span class="pista">Si son varias, se llena un formulario por cada familia.</span>
        </div>

        <div class="campo">
          <label for="afec">Nivel de afectacion</label>
          <select id="afec" formControlName="afectacion">
            <!-- Sin preseleccion. Antes venia en "moderado", asi que un paso que nadie
                 lleno describia una casa con dano moderado que no tiene. -->
            <option [value]="null">Seleccione</option>
            @for (o of afectaciones; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>

        <!-- Pregunta explicita en vez de casilla: una casilla sin marcar no distingue
             "no es habitable" de "no me preguntaron", y de este dato depende si la
             familia entra en la lista de quienes necesitan techo esta noche. -->
        <div class="campo">
          <label>Se puede vivir ahi hoy</label>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="habitable() === true"
                    (click)="fijarHabitable(true)">Si, es habitable</button>
            <button type="button" class="pastilla" [class.activa]="habitable() === false"
                    (click)="fijarHabitable(false)">No se puede vivir ahi</button>
          </div>
          @if (habitable() === null) {
            <span class="pista">Sin responder.</span>
          }
        </div>

        @if (incoherente()) {
          <p class="aviso peligro">
            Dice que el dano es {{ textoAfectacion() }} y que si se puede vivir ahi.
            Revise cual de las dos es. Puede continuar igual.
          </p>
        }

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
            Riesgo de colapso: el caso queda en prioridad P0. Avise al coordinador hoy
            mismo, sin esperar a sincronizar.
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

          <!-- Texto con teclado decimal, no type=number: el campo numerico de HTML
               cambia de valor al deslizar el dedo encima, y este paso es largo y se
               recorre deslizando. Ver el mismo cambio en el paso 2. -->
          <div class="fila">
            <div class="campo" style="flex:1">
              <label for="area">Area del predio (ha)</label>
              <input id="area" type="text" inputmode="decimal" formControlName="areaHa" />
            </div>
            <div class="campo" style="flex:1">
              <label for="areac">Area de cultivo afectada (ha)</label>
              <input id="areac" type="text" inputmode="decimal"
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
            <input id="perd" type="text" inputmode="numeric" formControlName="perdidaPct" />
          </div>

          <div class="rejilla-condiciones">
            <span class="rango">Bovinos perdidos</span>
            <app-contador formControlName="bovinosPerdidos" etiqueta="Bovinos perdidos" />
            <span class="rango">Aves perdidas</span>
            <app-contador formControlName="avesPerdidas" etiqueta="Aves perdidas" />
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

  /** True cuando el caso nacio de otro de la misma estructura. */
  readonly heredado = input(false);

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

  /** true, false o null cuando todavia nadie respondio. */
  habitable(): boolean | null {
    const v = this.form().get('vivienda.habitable')?.value;
    return v === true || v === false ? v : null;
  }

  fijarHabitable(valor: boolean): void {
    this.form().get('vivienda.habitable')?.setValue(valor);
  }

  riesgo(): boolean {
    return this.form().get('vivienda.riesgoColapso')?.value === true;
  }

  /**
   * Avisa cuando el nivel de dano y la habitabilidad se contradicen.
   *
   * Pasa mas de lo que parece: se escoge "Severo, inhabitable" en la lista y despues
   * se responde que si se puede vivir ahi. Uno de los dos dato entra mal a la base y
   * decide si la familia aparece o no en el listado de quienes necesitan techo.
   *
   * Avisa, no bloquea: en campo el voluntario puede tener una razon, y un formulario
   * que bloquea es un formulario que se abandona.
   */
  incoherente(): boolean {
    const nivel = this.form().get('vivienda.afectacion')?.value as string | null;
    return this.habitable() === true && NIVELES_INHABITABLES.includes(nivel ?? '');
  }

  textoAfectacion(): string {
    const nivel = this.form().get('vivienda.afectacion')?.value;
    return this.afectaciones.find((o) => o.v === nivel)?.t.toLowerCase() ?? 'grave';
  }

  perdioMedioVida(): boolean {
    return this.form().get('urbano.perdioMedioVida')?.value === true;
  }
}
