import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { OPCIONES } from '../../core/services/caso-form.service';
import { ContadorComponent } from '../../shared/contador.component';
import { PastillasComponent } from '../../shared/pastillas.component';

/**
 * Paso 2. Quienes viven en el hogar.
 *
 * El desagregado por sexo y edad es el bloque que mas se omite en los censos
 * improvisados y el que las entidades y la cooperacion exigen para asignar ayuda. Es
 * tambien el bloque donde se abandona un formulario: diez casillas numericas son diez
 * aperturas de teclado, de pie y con la familia esperando.
 *
 * Por eso se llena con botones y no con teclado (ver ContadorComponent).
 *
 * El total se escribe primero, arriba de la rejilla, porque es lo primero que la
 * familia dice. No se calcula solo a proposito: si se sobreescribiera con la suma, el
 * voluntario que ya escribio "somos cinco" veria cambiar su dato mientras reparte por
 * edades. En vez de eso, mientras reparte ve cuantas lleva repartidas, y el aviso de
 * descuadre aparece ARRIBA de la rejilla, donde el teclado no lo tapa.
 *
 * EL DESCUADRE SI BLOQUEA, Y CAMBIO EL 16 DE AGOSTO
 *
 * Antes solo avisaba, con el argumento de que un formulario que bloquea se abandona.
 * La primera prueba en terreno lo desmintio: el total decia 7 y la suma por edades
 * daba 1, y el registro se podia enviar asi. Ese caso no sirve para nada aguas abajo
 * —la ayuda se asigna por edades y la cifra no cuadra con el total— y nadie va a
 * volver a llamar a esa familia para reconstruirlo.
 *
 * Corregirlo cuesta cinco toques de boton mientras la familia esta enfrente. Es mas
 * barato que un dato que hay que descartar despues.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-paso-hogar',
  imports: [ReactiveFormsModule, ContadorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" [formGroup]="form()">
      @if (consentimiento()) {
        <section class="pila-sm" formGroupName="hogar">
          <h3>Persona responsable del hogar</h3>
          <div class="fila">
            <div class="campo" style="flex:1">
              <label for="nom">Nombres</label>
              <input id="nom" type="text" formControlName="jefeNombres" autocomplete="off" />
            </div>
            <div class="campo" style="flex:1">
              <label for="ape">Apellidos</label>
              <input id="ape" type="text" formControlName="jefeApellidos" autocomplete="off" />
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
            <label for="ndoc">Número de documento</label>
            <input id="ndoc" type="text" inputmode="numeric" formControlName="numDoc" />
            <span class="pista">Es la clave para evitar registros duplicados.</span>
          </div>
        </section>
      } @else {
        <p class="aviso peligro">
          La familia no autorizó el tratamiento de datos. No se piden nombre ni
          documento. El caso se registra igual.
        </p>
      }

      <section class="pila-sm" formGroupName="hogar">
        <h3>Contacto</h3>
        <div class="campo" [class.invalido]="telInvalido()">
          <label for="tel1">Celular principal <span class="obligatorio">obligatorio</span></label>
          <input id="tel1" type="tel" inputmode="tel" formControlName="tel1" />
          @if (telInvalido()) {
            <span class="error">El teléfono es obligatorio: sin él no se puede verificar el caso.</span>
          }
        </div>
        <div class="campo">
          <label for="tel2">Celular alterno o de un vecino</label>
          <input id="tel2" type="tel" inputmode="tel" formControlName="tel2" />
        </div>
      </section>

      <section class="pila-sm">
        <h3>Cuántas personas habitan la vivienda, por edad y sexo</h3>

        <!-- El total va arriba de la rejilla: es lo primero que la familia dice, y
             así el voluntario ve cómo se llena mientras reparte por edades. -->
        <div class="campo" formGroupName="hogar" [class.invalido]="totalInvalido() || descuadre()">
          <label for="ptotal">
            Número total de personas que viven en la casa
            <span class="obligatorio">obligatorio</span>
          </label>
          <input id="ptotal" type="text" inputmode="numeric" formControlName="personasTotal" />
          @if (totalInvalido()) {
            <span class="error">Indique cuántas personas viven en la casa.</span>
          } @else if (sumaEdades() > 0) {
            <span class="pista">Repartidas abajo: {{ sumaEdades() }}.</span>
          }
        </div>

        @if (descuadre()) {
          <p class="aviso peligro">
            La suma por edades da {{ sumaEdades() }} y el total dice
            {{ totalDeclarado() }}. Los dos números tienen que coincidir para poder
            continuar: la ayuda se asigna por edades, y con esa diferencia el caso no
            sirve para pedirla.
          </p>
        }

        <div class="rejilla-edades" formGroupName="composicion">
          <span></span><span class="cab">Hombres</span><span class="cab">Mujeres</span>
          @for (r of rangos; track r.h) {
            <span class="rango" [class.priorizado]="r.priorizado">{{ r.t }}</span>
            <app-contador [formControlName]="r.h" [etiqueta]="'Hombres de ' + r.t" />
            <app-contador [formControlName]="r.m" [etiqueta]="'Mujeres de ' + r.t" />
          }
        </div>
        <span class="pista">
          Los menores de edad y las personas de 60 o más son población priorizada: de
          esos números depende buena parte de lo que se le puede exigir a una entidad.
        </span>
      </section>

      <section class="pila-sm" formGroupName="vulnerabilidad">
        <h3>Condiciones especiales</h3>
        <p class="pista">Dejar en cero si no aplica.</p>
        <div class="rejilla-condiciones">
          <span class="rango">Gestantes</span>
          <app-contador formControlName="gestantes" etiqueta="Gestantes" />
          <span class="rango">Con discapacidad</span>
          <app-contador formControlName="discapacidadN" etiqueta="Personas con discapacidad" />
          <span class="rango">Enfermedad crónica o huérfana</span>
          <app-contador formControlName="enfCronicaN"
                        etiqueta="Personas con enfermedad crónica o huérfana" />
        </div>
      </section>

      <!-- Antes preguntaba "a qué organización pertenece la familia", que da por
           sentado que pertenece a alguna. La mayoría no pertenece a ninguna, y esa
           familia es justamente la que más riesgo tiene de quedar invisible. -->
      <section class="pila-sm" formGroupName="hogar">
        <div class="campo">
          <label>¿La familia pertenece a alguna organización?</label>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="perteneceOrg() === true"
                    (click)="fijarPertenece(true)">Sí</button>
            <button type="button" class="pastilla" [class.activa]="perteneceOrg() === false"
                    (click)="fijarPertenece(false)">No</button>
          </div>
        </div>

        @if (perteneceOrg() === true) {
          <div class="campo">
            <label for="afiliacion-cual">¿Cuál?</label>
            <input id="afiliacion-cual" type="text" formControlName="afiliacionCual"
                   placeholder="Junta de acción comunal, asociación, comité..." />
            <span class="pista">Escríbala como la nombra la comunidad.</span>
          </div>
        }
      </section>
    </div>
  `
})
export class PasoHogarComponent {
  readonly form = input.required<FormGroup>();
  readonly afiliacion = model.required<string[]>();

  /** Valores del catalogo que esta pantalla necesita nombrar. */
  private static readonly NO_AFILIADA = 'no_afiliada';
  private static readonly OTRA = 'otra';

  readonly tiposDoc = OPCIONES.tipoDoc;

  /**
   * Rangos de edad.
   *
   * `priorizado` marca los grupos que las entidades y la cooperacion miran primero:
   * menores de edad y personas de 60 o mas. No cambia el dato, cambia lo que el
   * voluntario sabe que no puede dejar en cero por descuido.
   */
  readonly rangos = [
    { t: '0 a 5', h: 'h0a5', m: 'm0a5', priorizado: true },
    { t: '6 a 11', h: 'h6a11', m: 'm6a11', priorizado: true },
    { t: '12 a 17', h: 'h12a17', m: 'm12a17', priorizado: true },
    { t: '18 a 59', h: 'h18a59', m: 'm18a59', priorizado: false },
    { t: '60 o más', h: 'h60mas', m: 'm60mas', priorizado: true }
  ] as const;

  readonly consentimiento = computed(
    () => this.form().get('control.consentimiento')?.value === true
  );

  /**
   * Si la familia pertenece a una organizacion.
   *
   * Se deriva de la seleccion que ya existe y no de un campo nuevo: marcar No es
   * marcar `no_afiliada`, que es el valor que el esquema y el formulario de Kobo ya
   * conocen. Asi la respuesta viaja con el caso y sobrevive a salir del paso y volver.
   *
   * Son tres estados y hacen falta los tres: sin marcar es "nadie pregunto", que no es
   * lo mismo que "no pertenece a ninguna". La familia sin organizacion es justamente
   * la que mas riesgo tiene de quedar invisible, y por eso se cuenta aparte.
   */
  perteneceOrg(): boolean | null {
    const marcadas = this.afiliacion();
    if (marcadas.length === 0) return null;
    return !marcadas.includes(PasoHogarComponent.NO_AFILIADA);
  }

  fijarPertenece(pertenece: boolean): void {
    if (pertenece) {
      // Se retira la marca de "no afiliada" y se deja que escriba cual.
      this.afiliacion.set(this.afiliacion().filter((v) => v !== PasoHogarComponent.NO_AFILIADA));
      if (this.afiliacion().length === 0) this.afiliacion.set([PasoHogarComponent.OTRA]);
      return;
    }

    this.afiliacion.set([PasoHogarComponent.NO_AFILIADA]);
    this.form().get('hogar.afiliacionCual')?.setValue(null);
  }

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
