import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FotoLocal } from '../../core/domain/caso.model';
import { TipoFoto } from '../../core/domain/enums';
import { TIPOS_EVIDENCIA } from '../../core/domain/enums';
import { OPCIONES } from '../../core/services/caso-form.service';
import { FotoService } from '../../core/services/foto.service';
import { PastillasComponent } from '../../shared/pastillas.component';

/**
 * Paso 4. Fotografias, convenio, prioridad y necesidad inmediata.
 *
 * Las fotos van al final porque son lo mas lento y lo que mas bateria consume. Si el
 * voluntario debe cortar el registro, lo hace habiendo capturado ya todo lo que la
 * entidad necesita para actuar.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-paso-cierre',
  imports: [ReactiveFormsModule, PastillasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" [formGroup]="form()">
      <section class="pila-sm">
        <h3>Evidencia fotográfica</h3>
        <!-- LA SEGURIDAD PRIMERO, Y ANTES QUE LA FOTO. Nunca se le pide al voluntario
             que fotografíe: se le dice que lo haga SI es seguro. Una ficha que exige
             una imagen es una ficha que empuja a alguien a entrar a una casa que se
             puede caer. -->
        <p class="pista">
          Registre solo lo necesario para documentar la vivienda, los daños visibles y el
          entorno. <strong>No fotografíe rostros</strong>, y nunca a niñas, niños ni
          adolescentes.
        </p>
        <p class="aviso">
          <strong>Tome fotografías únicamente si hacerlo es seguro.</strong> No entre a
          una estructura que pueda representar peligro: ninguna foto vale eso.
        </p>
        <span class="pista">
          Cada imagen queda asociada al caso, con la fecha, la hora y la ubicación cuando
          estén disponibles.
        </span>

        @if (!consentimiento()) {
          <p class="aviso peligro">
            Sin autorizacion de la familia no se toman fotografias.
          </p>
        } @else {
          <div class="fila">
            <label class="pastilla" style="min-height:52px">
              <input type="file" accept="image/*" capture="environment" hidden
                     (change)="alSeleccionar($event, tipoFachada)" />
              Foto de la fachada
            </label>
            <label class="pastilla" style="min-height:52px">
              <input type="file" accept="image/*" capture="environment" hidden
                     (change)="alSeleccionar($event, tipoDano)" />
              Foto del dano
            </label>
          </div>

          @if (fotos().length > 0) {
            <ul class="pila-sm" style="list-style:none;padding:0;margin:0">
              @for (f of fotos(); track f.id) {
                <li class="tarjeta fila" style="justify-content:space-between">
                  <span>{{ f.tipo === tipoFachada ? 'Fachada' : 'Dano' }}
                    <span class="tenue">· {{ (f.bytes / 1024).toFixed(0) }} KB</span>
                  </span>
                  <button type="button" class="btn-secundario" (click)="eliminarFoto.emit(f.id)">
                    Quitar
                  </button>
                </li>
              }
            </ul>
          }

          @if (errorFoto()) {
            <p class="aviso peligro">{{ errorFoto() }}</p>
          }
        }
      </section>

      <!-- CON QUÉ SE SOSTIENE ESTE CASO. Cuando una alcaldía pregunte de dónde salió
           un dato, la respuesta útil no es «hay una foto»: es «visita presencial, más
           lo que reportó la familia, más seis fotografías». -->
      <app-pastillas etiqueta="¿Con qué se sostiene este caso?"
                     [opciones]="opcTiposEvidencia" [(seleccion)]="tiposEvidencia" />

      <!-- RUTA DE APOYO, EN LUGAR DEL CONVENIO CON UNA ORGANIZACIÓN CONCRETA.
           Dos razones. La pertenencia a organizaciones sociales es dato sensible, así
           que preguntarla como un campo más no corresponde. Y «el caso se postula al
           convenio» promete algo que depende de un tercero: Raíz no entrega la ayuda y
           no puede comprometerla.

           Lo que sí puede ofrecer con verdad es preguntar si la familia QUIERE ser
           orientada, y dejar constancia de a dónde se remitió. -->
      <section class="pila-sm" formGroupName="triaje">
        <h3>Ruta de apoyo</h3>
        <div class="campo">
          <label>¿La familia quiere que la orientemos hacia alguna organización o programa?</label>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="deseaRuta() === true"
                    (click)="fijarRuta(true)">Sí</button>
            <button type="button" class="pastilla" [class.activa]="deseaRuta() === false"
                    (click)="fijarRuta(false)">No</button>
          </div>
          <span class="pista">
            La información podrá remitirse a una organización o programa cuando
            corresponda, según sus propios criterios de atención. No es una ayuda
            garantizada.
          </span>
        </div>

        @if (deseaRuta() === true) {
          <div class="campo">
            <label for="ruta-org">¿Cuál?</label>
            <input id="ruta-org" type="text" formControlName="rutaApoyoOrganizacion"
                   placeholder="Si ya sabe a cuál. Si no, déjelo vacío." />
          </div>
        }
      </section>

      <!-- LA PRIORIDAD YA NO SE ELIGE. La calcula el servidor con las respuestas de
           los cuatro pasos y devuelve además POR QUÉ. Lo que queda aquí es la única
           excepción que tiene sentido: quien está ahí puede SUBIRLA si ve una
           emergencia que ninguna regla previó. Bajarla no, para eso está la regla. -->
      <section class="pila-sm" formGroupName="triaje">
        <h3>Prioridad preliminar</h3>
        <p class="pista">
          La calcula el sistema con lo que usted ya respondió, y viaja con sus razones
          escritas. No es una evaluación técnica ni una decisión de la autoridad
          competente.
        </p>
        <div class="campo">
          <label for="prio">Si ve una emergencia que el formulario no alcanzó a recoger, súbala</label>
          <select id="prio" formControlName="prioridad">
            @for (o of prioridades; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
          <span class="pista">
            Solo se tiene en cuenta si es más alta que la calculada. Queda registrado que
            la subió una persona.
          </span>
        </div>
      </section>

      <app-pastillas etiqueta="Necesidades inmediatas — próximas 72 horas"
                     [opciones]="opcNecesidades" [(seleccion)]="necesidades" />

      <section class="pila-sm" formGroupName="triaje">
        <!-- La lista cerrada sirve para sumar por vereda; no para describir. El texto
             la acompaña: lo que la familia pide con sus palabras es lo que después
             permite explicarle a una entidad por qué el consolidado no basta. -->
        <div class="campo">
          <label for="nec-otra">Otra necesidad, en palabras de la familia</label>
          <input id="nec-otra" type="text" formControlName="necesidadesOtra"
                 placeholder="Lo que hace falta y no está en la lista" />
        </div>

        <div class="campo">
          <label for="obs">Observación relevante</label>
          <textarea id="obs" formControlName="observaciones"
                    placeholder="Lo que hace falta para entender la afectación o la necesidad"></textarea>
          <!-- «Lo que no cupo en los campos anteriores» invita a escribir de todo, y
               en un campo libre lo que se escribe de más son datos personales que
               nadie pidió y que después hay que proteger igual. -->
          <span class="pista">
            Solo lo necesario para entender la afectación, la necesidad o la evidencia.
            No anote datos personales que no hagan falta, ni diagnósticos médicos.
          </span>
        </div>
      </section>
    </div>
  `
})
export class PasoCierreComponent {
  private readonly fotoService = inject(FotoService);

  readonly form = input.required<FormGroup>();
  readonly casoId = input.required<string>();
  readonly fotos = input.required<FotoLocal[]>();
  readonly convenioLinea = model.required<string[]>();
  readonly tiposEvidencia = model.required<string[]>();
  readonly necesidades = model.required<string[]>();

  readonly fotoLista = output<FotoLocal>();
  readonly eliminarFoto = output<string>();

  readonly errorFoto = model<string>('');

  readonly prioridades = OPCIONES.prioridad;
  readonly opcConvenio = OPCIONES.convenioLinea;
  readonly opcTiposEvidencia = TIPOS_EVIDENCIA;
  readonly opcNecesidades = OPCIONES.necesidades;
  readonly tipoFachada = TipoFoto.Fachada;
  readonly tipoDano = TipoFoto.Dano;

  readonly consentimiento = computed(
    () => this.form().get('control.consentimiento')?.value === true
  );

  /** Tres estados. Sin responder no es un no: es que no se pregunto. */
  deseaRuta(): boolean | null {
    const valor = this.form().get('triaje.deseaRutaApoyo')?.value;
    return valor === true ? true : valor === false ? false : null;
  }

  fijarRuta(quiere: boolean): void {
    const control = this.form().get('triaje.deseaRutaApoyo');
    // Volver a tocar la misma respuesta la borra: es la unica forma de corregir un
    // toque accidental sin un tercer boton que diga «sin responder».
    control?.setValue(control.value === quiere ? null : quiere);

    if (!quiere) this.form().get('triaje.rutaApoyoOrganizacion')?.setValue(null);
  }

  afiliada(): boolean {
    return this.form().get('convenio.afiliadaFederacion')?.value === true;
  }

  postula(): boolean {
    return this.form().get('convenio.aplicaConvenio')?.value === true;
  }

  async alSeleccionar(evento: Event, tipo: TipoFoto): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    if (!archivo) return;

    this.errorFoto.set('');
    try {
      const foto = await this.fotoService.preparar({ casoId: this.casoId(), tipo, archivo });
      this.fotoLista.emit(foto);
    } catch (e) {
      this.errorFoto.set(e instanceof Error ? e.message : 'No se pudo procesar la imagen.');
    } finally {
      // Permite volver a elegir el mismo archivo si el voluntario repite la toma.
      entrada.value = '';
    }
  }
}
