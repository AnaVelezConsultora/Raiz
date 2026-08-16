import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FotoLocal } from '../../core/domain/caso.model';
import { TipoFoto } from '../../core/domain/enums';
import { OPCIONES } from '../../core/services/caso-form.service';
import { FotoService } from '../../core/services/foto.service';
import { AlmacenamientoService } from '../../core/services/almacenamiento.service';
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
        <h3>Fotografias</h3>
        <p class="pista">
          Fotografie la vivienda y el dano, no las caras. Nunca rostros de menores de
          edad. Las imagenes se comprimen en el celular antes de guardarse.
        </p>

        @if (!consentimiento()) {
          <p class="aviso peligro">
            Sin autorizacion de la familia no se toman fotografias.
          </p>
        } @else {
          @if (almacenamiento.avisoEspacio()) {
            <p class="aviso peligro">{{ almacenamiento.avisoEspacio() }}</p>
          }
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

      <section class="pila-sm" formGroupName="convenio">
        <h3>Convenio de la federacion</h3>
        <label class="pastilla" [class.activa]="afiliada()">
          <input type="checkbox" formControlName="afiliadaFederacion" />
          La familia esta afiliada a la federacion
        </label>
        <label class="pastilla" [class.activa]="postula()">
          <input type="checkbox" formControlName="aplicaConvenio" />
          El caso se postula al convenio
        </label>
        <span class="pista">Las familias no afiliadas tambien pueden postularse.</span>
      </section>

      @if (postula()) {
        <app-pastillas etiqueta="Linea del convenio"
                       [opciones]="opcConvenio" [(seleccion)]="convenioLinea" />
      }

      <section class="pila-sm" formGroupName="triaje">
        <h3>Prioridad</h3>
        <div class="campo">
          <label for="prio">Nivel</label>
          <select id="prio" formControlName="prioridad">
            @for (o of prioridades; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>
      </section>

      <app-pastillas etiqueta="Necesidades de las próximas 72 horas"
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
          <label for="obs">Observaciones</label>
          <textarea id="obs" formControlName="observaciones"
                    placeholder="Lo que no cupo en los campos anteriores"></textarea>
        </div>
      </section>
    </div>
  `
})
export class PasoCierreComponent {
  private readonly fotoService = inject(FotoService);
  readonly almacenamiento = inject(AlmacenamientoService);

  readonly form = input.required<FormGroup>();
  readonly casoId = input.required<string>();
  readonly fotos = input.required<FotoLocal[]>();
  readonly convenioLinea = model.required<string[]>();
  readonly necesidades = model.required<string[]>();

  readonly fotoLista = output<FotoLocal>();
  readonly eliminarFoto = output<string>();

  readonly errorFoto = model<string>('');

  readonly prioridades = OPCIONES.prioridad;
  readonly opcConvenio = OPCIONES.convenioLinea;
  readonly opcNecesidades = OPCIONES.necesidades;
  readonly tipoFachada = TipoFoto.Fachada;
  readonly tipoDano = TipoFoto.Dano;

  readonly consentimiento = computed(
    () => this.form().get('control.consentimiento')?.value === true
  );

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
