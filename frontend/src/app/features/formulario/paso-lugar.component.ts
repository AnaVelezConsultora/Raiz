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
        <h3>Quién registra</h3>
        <div class="campo">
          <label for="reg">Su nombre</label>
          <input id="reg" type="text" formControlName="registradorNombre" autocomplete="name" />
          <!-- Este dato es del voluntario, no de la familia: se conserva entre casos a
               proposito. Sin decirlo, verlo ya escrito parece que la aplicacion
               arrastro datos del registro anterior. -->
          <span class="pista">Es suyo, no de la familia: queda guardado para los siguientes casos.</span>
        </div>
        <div class="campo">
          <label for="org">Organización, junta o comité</label>
          <input id="org" type="text" formControlName="registradorOrg"
                 placeholder="Escriba independiente si no pertenece a ninguna" />
        </div>
        <div class="campo">
          <label for="fuente">Cómo obtuvo la información</label>
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
            ante las entidades y ante organismos de cooperación, con el fin de gestionar
            ayuda. Sus datos solo se usarán para eso y puede pedir que los eliminemos.
            ¿Nos autoriza a registrar sus datos?
          </p>
        </div>

        <!-- Dos botones y no una casilla. Una casilla sin marcar no distingue "la
             familia dijo que no" de "nadie le preguntó", y de esa diferencia depende si
             el nombre de una persona puede guardarse. Sin responder no se continúa. -->
        <div class="campo">
          <label>
            ¿La familia autoriza el tratamiento de sus datos?
            <span class="obligatorio">obligatorio</span>
          </label>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="consentimiento === true"
                    (click)="fijarConsentimiento(true)">Sí, autoriza</button>
            <button type="button" class="pastilla" [class.activa]="consentimiento === false"
                    (click)="fijarConsentimiento(false)">No autoriza</button>
          </div>
        </div>

        @if (consentimiento === null) {
          <p class="aviso">
            Sin esta respuesta no se puede continuar. Es lo que decide si el nombre y el
            documento de la familia pueden guardarse.
          </p>
        } @else if (consentimiento === false) {
          <p class="aviso peligro">
            Sin autorización NO se registran nombre, documento ni fotos. El caso se
            guarda con ubicación, número de personas y tipo de daño.
          </p>
        }
      </section>

      <section class="pila-sm" formGroupName="ubicacion">
        <h3>Dónde queda</h3>
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
          <!-- Un solo campo y no dos. En terreno nadie separa vereda de corregimiento
               de centro poblado: dice el nombre del sitio. Con dos casillas, la mitad
               de los registros llegaba con una vacía y la otra con el nombre puesto
               donde alcanzó, y después no se pueden agrupar por lugar. -->
          <div class="campo">
            <label for="vereda">
              Vereda, corregimiento o centro poblado
              <span class="obligatorio">obligatorio</span>
            </label>
            <input id="vereda" type="text" formControlName="vereda" />
            <span class="pista">Escriba el nombre como lo dice la comunidad.</span>
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
          El GPS del celular funciona SIN internet. Quédese quieto unos segundos hasta
          que la precisión baje.
        </p>

        @if (lat() !== null) {
          <p class="aviso exito mono">
            {{ lat() }}, {{ lon() }}
            @if (precision() !== null) { · precisión {{ precision() }} m }
          </p>

          <!-- El enlace abre el mapa, con internet o con la aplicación de mapas del
               celular. Antes la coordenada solo se veía y no se podía comprobar, que
               es justo lo que se necesita al llegar a una casa vecina. -->
          <a class="btn-secundario btn-ancho" style="text-align:center;text-decoration:none;
                    display:flex;align-items:center;justify-content:center"
             [href]="'https://www.google.com/maps/search/?api=1&query=' + lat() + ',' + lon()"
             target="_blank" rel="noopener">
            Ver la coordenada en el mapa
          </a>

          @if (precision() !== null && precision()! > 15) {
            <p class="aviso">
              Con {{ precision() }} m de precisión, dos casas vecinas pueden quedar en el
              mismo punto. Escriba el punto de referencia arriba: es lo que permite
              distinguirlas cuando alguien vaya a verificar.
            </p>
          }
        }

        <button type="button" class="btn-secundario btn-ancho"
                [disabled]="gps.estado() === 'buscando'"
                (click)="capturarGps.emit()">
          @switch (gps.estado()) {
            @case ('buscando') {
              Buscando satélites...
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

  /**
   * Tres estados y hacen falta los tres.
   *
   * null es "nadie ha preguntado", que no es lo mismo que "la familia dijo que no".
   * Un caso sin responder no puede continuar: de esta respuesta depende si el nombre y
   * el documento de una persona se guardan.
   */
  get consentimiento(): boolean | null {
    const valor = this.form().get('control.consentimiento')?.value;
    return valor === true || valor === false ? valor : null;
  }

  fijarConsentimiento(autoriza: boolean): void {
    const control = this.form().get('control.consentimiento');
    if (!control) return;
    control.setValue(autoriza);
    control.markAsDirty();
  }

  /** El contenedor escucha este evento, captura la coordenada y la persiste. */
  readonly capturarGps = output<void>();
}
