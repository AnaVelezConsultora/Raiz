import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Zona } from '../../core/domain/enums';
import { OPCIONES } from '../../core/services/caso-form.service';
import { GeolocalizacionService } from '../../core/services/geolocalizacion.service';

/**
 * Paso 1. Quien reporta, autorizacion y donde queda el hogar.
 *
 * La captura de coordenada esta aqui y no al final a proposito: si el voluntario se
 * va del sitio antes de terminar el formulario, lo unico irrecuperable es la
 * coordenada. Todo lo demas se puede completar despues por telefono.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-paso-lugar',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" [formGroup]="form()">
      <section class="pila-sm" formGroupName="control">
        <h3>Quien registra</h3>
        <div class="campo">
          <label for="reg">Su nombre</label>
          <input id="reg" type="text" formControlName="registradorNombre" autocomplete="name" />
        </div>
        <div class="campo">
          <label for="org">Organizacion, junta o comite</label>
          <input id="org" type="text" formControlName="registradorOrg"
                 placeholder="Escriba independiente si no pertenece a ninguna" />
        </div>
        <div class="campo">
          <label for="fuente">Como obtuvo la informacion</label>
          <select id="fuente" formControlName="fuenteDato">
            @for (o of fuentes; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
        </div>

        <div class="aviso">
          <strong>Lea esto a la familia antes de continuar</strong>
          <p style="margin:.4rem 0 0">
            Estamos levantando un censo de familias afectadas por el sismo para presentarlo
            ante las entidades y ante organismos de cooperacion, con el fin de gestionar
            ayuda. Sus datos solo se usaran para eso y puede pedir que los eliminemos.
            Nos autoriza a registrar sus datos?
          </p>
        </div>

        <label class="pastilla" [class.activa]="consentimiento">
          <input type="checkbox" formControlName="consentimiento" />
          La familia autoriza el tratamiento de sus datos
        </label>

        @if (!consentimiento) {
          <p class="aviso peligro">
            Sin autorizacion NO se registran nombre, documento ni fotos. El caso se
            guarda con ubicacion, numero de personas y tipo de dano.
          </p>
        }
      </section>

      <section class="pila-sm" formGroupName="ubicacion">
        <h3>Donde queda</h3>
        <div class="campo">
          <label for="zona">Zona</label>
          <select id="zona" formControlName="zona">
            <option [value]="zonaRural">Rural: vereda, corregimiento o finca</option>
            <option [value]="zonaUrbana">Urbana: barrio o casco urbano</option>
          </select>
        </div>

        <div class="fila">
          <div class="campo" style="flex:1">
            <label for="mun">Municipio</label>
            <input id="mun" type="text" formControlName="municipio" />
          </div>
          <div class="campo" style="flex:1">
            <label for="dpto">Departamento</label>
            <input id="dpto" type="text" formControlName="departamento" />
          </div>
        </div>

        @if (esRural()) {
          <div class="campo">
            <label for="vereda">Vereda</label>
            <input id="vereda" type="text" formControlName="vereda" />
            <span class="pista">Escriba el nombre como lo dice la comunidad.</span>
          </div>
          <div class="campo">
            <label for="correg">Corregimiento o centro poblado</label>
            <input id="correg" type="text" formControlName="corregimiento" />
          </div>
        } @else {
          <div class="campo">
            <label for="barrio">Barrio</label>
            <input id="barrio" type="text" formControlName="barrio" />
          </div>
          <div class="campo">
            <label for="comuna">Comuna o sector</label>
            <input id="comuna" type="text" formControlName="comuna" />
          </div>
        }

        <div class="campo">
          <label for="ref">Punto de referencia</label>
          <input id="ref" type="text" formControlName="direccionRef"
                 placeholder="300 m arriba de la escuela, casa de teja roja" />
        </div>
      </section>

      <section class="pila-sm">
        <h3>Coordenada</h3>
        <p class="pista">
          El GPS del celular funciona SIN internet. Quedese quieto unos segundos hasta
          que la precision baje.
        </p>

        @if (lat() !== null) {
          <p class="aviso exito mono">
            {{ lat() }}, {{ lon() }}
            @if (precision() !== null) { · precision {{ precision() }} m }
          </p>
        }

        <button type="button" class="btn-secundario btn-ancho"
                [disabled]="gps.estado() === 'buscando'"
                (click)="capturarGps.emit()">
          @switch (gps.estado()) {
            @case ('buscando') {
              Buscando satelites...
              @if (gps.precisionActual() !== null) { ({{ gps.precisionActual() }} m) }
            }
            @case ('denegado') { Permiso de ubicacion denegado. Toque para reintentar }
            @default { {{ lat() === null ? 'Obtener ubicacion' : 'Volver a medir' }} }
          }
        </button>

        @if (gps.estado() === 'denegado') {
          <p class="pista">
            Active el permiso de ubicacion en los ajustes del navegador. Si no es
            posible, continue: la mesa puede pedir la ubicacion despues por WhatsApp.
          </p>
        }
      </section>
    </div>
  `
})
export class PasoLugarComponent {
  readonly gps = inject(GeolocalizacionService);

  readonly form = input.required<FormGroup>();
  readonly lat = input.required<number | null>();
  readonly lon = input.required<number | null>();
  readonly precision = input.required<number | null>();

  readonly fuentes = OPCIONES.fuenteDato;
  readonly zonaRural = Zona.Rural;
  readonly zonaUrbana = Zona.Urbana;

  readonly esRural = computed(() => this.form().get('ubicacion.zona')?.value === Zona.Rural);

  get consentimiento(): boolean {
    return this.form().get('control.consentimiento')?.value === true;
  }

  /** El contenedor escucha este evento, captura la coordenada y la persiste. */
  readonly capturarGps = output<void>();
}
