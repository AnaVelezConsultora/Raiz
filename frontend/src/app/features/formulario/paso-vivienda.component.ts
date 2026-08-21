import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NivelAfectacion, RiesgoVisible, Zona } from '../../core/domain/enums';
import { DANOS_VISIBLES, DOCUMENTOS_TENENCIA } from '../../core/domain/enums';
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
        </div>

        <div class="campo">
          <label for="hog">Cuántas familias vivían en esa misma casa o estructura</label>
          <div class="fila" style="flex-wrap:nowrap">
            <app-contador formControlName="hogaresEnEstructura" [minimo]="1"
                          etiqueta="Familias en la misma estructura" />
          </div>
          <span class="pista">Si son varias, se llena un formulario por cada familia.</span>
        </div>

        <!-- QUÉ documento tiene, no el documento. Caracterizar sin pedir papeles: si
             después hay una ruta jurídica o de reconstrucción, ahí se solicita lo que
             haga falta. Recoger escrituras hoy sería acumular documentos sensibles que
             nadie necesita todavía, en teléfonos prestados. -->
        <app-pastillas
          etiqueta="¿Qué documentos tiene la familia sobre este inmueble?"
          [opciones]="opcDocumentosTenencia"
          [(seleccion)]="documentosTenencia" />
        <span class="pista">
          No hay que pedírselos ni fotografiarlos. Basta con saber cuáles existen.
        </span>

        <!-- QUÉ SE OBSERVA. Una lista cerrada convierte una impresión en algo que se
             puede sumar por vereda y que un ingeniero puede leer antes de subir: con
             texto libre, «grietas», «rajaduras» y «fisuras» son tres cosas distintas.
             Y describir no es diagnosticar: nombra lo que cualquiera ve desde afuera. -->
        <div class="campo">
          <label for="afec">Nivel de afectación</label>
          <select id="afec" formControlName="afectacion">
            <!-- Sin preseleccion. Antes venia en "moderado", asi que un paso que nadie
                 lleno describia una casa con dano moderado que no tiene. -->
            <option [value]="null">Seleccione</option>
            @for (o of afectaciones; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>

        <!-- HABITABILIDAD, QUE NO ES EL DAÑO. Una casa con daño moderado puede ser
             inhabitable por el terreno, y una severa puede estar apuntalada. El sí/no
             anterior no distinguía «se puede, pero no en toda la casa» ni «ya
             salieron», que son los dos casos más frecuentes en terreno. -->
        <div class="campo">
          <label for="habit">¿Se puede vivir ahí hoy?</label>
          <select id="habit" formControlName="habitabilidad">
            <option [value]="null">Seleccione</option>
            @for (o of habitabilidades; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>

        <app-pastillas
          etiqueta="¿Qué se observa?"
          [opciones]="opcDanosVisibles"
          [(seleccion)]="danosVisibles" />

        <div class="campo">
          <label for="danodesc">Descríbalo en una o dos frases</label>
          <textarea id="danodesc" rows="2" formControlName="danoDescripcion" maxlength="500"
                    placeholder="Grietas diagonales en dos muros del segundo piso y se cayó parte del techo."></textarea>
          <!-- Es el campo que de verdad le sirve a quien va a evaluar, y por eso pide
               lo que se VE y no lo que se concluye. -->
          <span class="pista">
            Lo que usted ve, no lo que concluye. Es lo que va a leer quien venga a
            revisar. Máximo 500 caracteres.
          </span>
        </div>

        @if (incoherente()) {
          <p class="aviso peligro">
            Dice que el dano es {{ textoAfectacion() }} y que si se puede vivir ahi.
            Revise cual de las dos es. Puede continuar igual.
          </p>
        }

        <!-- ALERTA COMUNITARIA, NO DICTAMEN. Antes decia «hay riesgo inminente de
             colapso», que es una afirmacion tecnica, y quien llena esta ficha es un
             lider comunal y no un ingeniero. Firmar un diagnostico estructural que no
             se puede sostener expone a quien registra y le quita fuerza al registro
             entero. Lo que la comunidad si puede afirmar es lo que ve. -->
        <div class="campo">
          <label for="riesgoV">¿Se ve algo peligroso para entrar?</label>
          <select id="riesgoV" formControlName="riesgoVisible">
            <option [value]="null">Seleccione</option>
            @for (o of riesgos; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>

        @if (riesgo()) {
          <div class="campo">
            <label for="rdesc">¿Qué se ve? ¿Sobre quién caería?</label>
            <textarea id="rdesc" formControlName="riesgoColapsoDesc"
                      placeholder="Grietas grandes en el muro del frente, se inclinó hacia la casa vecina..."></textarea>
            <span class="pista">
              Describa lo que observa, no lo que concluye. Eso es lo que después puede
              sostener un técnico.
            </span>
          </div>
          <!-- QUE HACER, NO SOLO QUE PASO. Antes decia «avisarle al coordinador», que
               deja la cadena a medias: el coordinador tampoco puede entrar a esa casa.
               Quien tiene que ir es el equipo tecnico de gestion del riesgo del
               municipio, y decirlo con ese nombre es lo que convierte el aviso en una
               instruccion ejecutable. Lo pidio el enlace institucional: si hay riesgo
               de entrar, se reporta de inmediato para que lleguen expertos y
               autoridades, sin esperar al censo. -->
          <p class="aviso peligro">
            <strong>
              @if (peligroEvidente()) {
                No entre. Repórtelo hoy mismo, sin esperar a sincronizar.
              } @else {
                Repórtelo hoy mismo, sin esperar a sincronizar.
              }
            </strong>
            Avise al Consejo Municipal de Gestión del Riesgo o al organismo de socorro
            más cercano para que vayan los técnicos. El caso queda en prioridad P0. No es
            un dictamen estructural: es lo que usted vio, y por eso tiene que ir alguien
            que sí pueda dictaminarlo.
          </p>
        }

        <!-- CONSTANCIA DE VISITA OFICIAL.
             Responde tres preguntas de un solo campo, y la tercera es la mas util:
             no mandar dos veces al mismo tecnico, no perder el concepto que ya dio, y
             saber DONDE NO HA IDO NADIE. «Estas 60 casas no han tenido una sola visita
             oficial» es una frase que mueve una agenda.

             No sube el nivel de verificacion por si sola: que la familia diga que vino
             un ingeniero es, todavia, algo que dijo la familia. -->
        <div class="campo">
          <label for="visita">¿Ya vino alguna entidad a ver esta casa?</label>
          <select id="visita" [value]="visitaComoTexto()" (change)="responderVisita($event)">
            <option value="">No se preguntó</option>
            <option value="no">No ha venido nadie</option>
            <option value="si">Sí, ya vino una entidad</option>
          </select>
        </div>

        @if (tuvoVisita()) {
          <div class="fila" style="gap:.6rem;flex-wrap:wrap">
            <div class="campo" style="flex:2;min-width:10rem">
              <label for="ventidad">Cuál entidad</label>
              <input id="ventidad" type="text" formControlName="visitaOficialEntidad"
                     placeholder="Bomberos, Defensa Civil, la Alcaldía..." />
            </div>
            <div class="campo" style="flex:1;min-width:8rem">
              <label for="vfecha">Cuándo</label>
              <input id="vfecha" type="date" formControlName="visitaOficialFecha" />
            </div>
          </div>
          <div class="campo">
            <label for="vconcepto">Qué dijeron</label>
            <textarea id="vconcepto" rows="2" formControlName="visitaOficialConcepto"
                      placeholder="Dijeron que no se podía habitar y que volvían con un ingeniero"></textarea>
            <span class="pista">
              Es la evidencia más fuerte que puede traer este caso. Si le dejaron un
              papel o un número de acta, escríbalo.
            </span>
          </div>
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

          <!-- La maquinaria es insumo de la cadena productiva igual que el cultivo, y
               quedarse por fuera del listado es exactamente como se pierde en el
               camino: si no está escrita, no entra en ninguna reclamación. -->
          <div class="campo">
            <label>¿Perdió o se le dañó maquinaria o vehículos de trabajo?</label>
            <div class="pastillas">
              <button type="button" class="pastilla"
                      [class.activa]="maquinaria() === true"
                      (click)="fijarMaquinaria(true)">Sí</button>
              <button type="button" class="pastilla"
                      [class.activa]="maquinaria() === false"
                      (click)="fijarMaquinaria(false)">No</button>
            </div>
          </div>

          @if (maquinaria() === true) {
            <div class="campo">
              <label for="maq">¿Cuál y qué le pasó?</label>
              <textarea id="maq" rows="2" formControlName="maquinariaDetalle"
                        placeholder="Guadaña, moto de trabajo, despulpadora, tractor..."></textarea>
            </div>
          }
        </section>

        <app-pastillas etiqueta="Cultivos afectados" [opciones]="opcCultivos" [(seleccion)]="cultivos" />
        <section class="pila-sm" formGroupName="rural">
          <div class="campo">
            <label for="cult-otro">Otro cultivo o pérdida que no esté en la lista</label>
            <input id="cult-otro" type="text" formControlName="cultivosOtro"
                   placeholder="Se cayó toda la aguacatera, se perdió la naranja..." />
          </div>
        </section>

        <app-pastillas etiqueta="Infraestructura productiva afectada"
                       [opciones]="opcInfra" [(seleccion)]="infraProductiva" />
        <section class="pila-sm" formGroupName="rural">
          <div class="campo">
            <label for="infra-otro">Otra infraestructura afectada</label>
            <input id="infra-otro" type="text" formControlName="infraProductivaOtro" />
          </div>
        </section>

        <app-pastillas etiqueta="Qué requiere para reactivar la producción"
                       [opciones]="opcAgro" [(seleccion)]="requiereAgro" />
        <section class="pila-sm" formGroupName="rural">
          <div class="campo">
            <label for="agro-otro">Otra cosa que necesita para volver a producir</label>
            <input id="agro-otro" type="text" formControlName="requiereAgroOtro" />
          </div>
        </section>
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
  readonly danosVisibles = model.required<string[]>();
  readonly documentosTenencia = model.required<string[]>();
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
  readonly opcDanosVisibles = DANOS_VISIBLES;
  readonly opcDocumentosTenencia = DOCUMENTOS_TENENCIA;
  readonly habitabilidades = OPCIONES.habitabilidad;
  readonly riesgos = OPCIONES.riesgoVisible;
  readonly opcServicios = OPCIONES.servicios;
  /** Tres estados: sin responder, si, no. Sin responder no es lo mismo que no tenia. */
  maquinaria(): boolean | null {
    const v = this.form().get('rural.maquinariaAfectada')?.value;
    return v === true || v === false ? v : null;
  }

  fijarMaquinaria(afectada: boolean): void {
    this.form().get('rural.maquinariaAfectada')?.setValue(afectada);
    if (!afectada) this.form().get('rural.maquinariaDetalle')?.setValue(null);
  }

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

  /**
   * True cuando quien registra vio algo peligroso.
   *
   * Cubre los DOS niveles altos a proposito. El aviso de «no entre» tiene que salir
   * tambien cuando solo se pidio evaluacion tecnica: la diferencia entre las dos
   * respuestas la sabe quien las escribio, no quien esta parado frente a la casa media
   * hora despues.
   *
   * Sigue mirando `riesgoColapso` ademas del eje nuevo, porque un caso empezado con la
   * version anterior de la aplicacion se abre en esta para completarlo, y ese aviso no
   * puede desaparecer al reabrirlo.
   */
  riesgo(): boolean {
    const visible = this.form().get('vivienda.riesgoVisible')?.value;
    return (
      visible === RiesgoVisible.PeligroEvidente ||
      visible === RiesgoVisible.RequiereEvaluacion ||
      this.form().get('vivienda.riesgoColapso')?.value === true
    );
  }

  /** El mas alto de los dos: cambia el tono del aviso, no si aparece. */
  peligroEvidente(): boolean {
    return this.form().get('vivienda.riesgoVisible')?.value === RiesgoVisible.PeligroEvidente;
  }

  /** True solo si respondieron que si. Sin responder NO es un no. */
  tuvoVisita(): boolean {
    return this.form().get('vivienda.visitaOficial')?.value === true;
  }

  /**
   * El tri-estado como texto, porque un `select` no distingue nulo de false.
   *
   * Un checkbox habria sido mas corto y habria borrado justamente la distincion que
   * importa: «no ha venido nadie» y «no se pregunto» son respuestas distintas, y solo
   * la primera permite decirle a una entidad donde no ha ido ningun tecnico.
   */
  /**
   * Traduce la respuesta de tres estados y limpia el detalle si dejo de ser «si».
   *
   * Limpiar importa: si alguien marca que vino la Defensa Civil, escribe el concepto y
   * despues corrige a «no ha venido nadie», dejar el texto ahi produciria una casa sin
   * visita que aun asi trae el concepto de una entidad.
   */
  responderVisita(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    const grupo = this.form().get('vivienda');
    if (!grupo) return;

    grupo.get('visitaOficial')?.setValue(valor === 'si' ? true : valor === 'no' ? false : null);

    if (valor !== 'si') {
      grupo.get('visitaOficialEntidad')?.setValue(null);
      grupo.get('visitaOficialFecha')?.setValue(null);
      grupo.get('visitaOficialConcepto')?.setValue(null);
    }
  }

  visitaComoTexto(): string {
    const valor = this.form().get('vivienda.visitaOficial')?.value;
    if (valor === true) return 'si';
    if (valor === false) return 'no';
    return '';
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
