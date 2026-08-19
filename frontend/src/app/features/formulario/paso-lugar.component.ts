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

        <!-- El texto completo, no un resumen. Se despliega para leerlo en voz alta y
             se contrae para no empujar las tres preguntas fuera de la pantalla. La
             versión queda guardada con el caso: la ley exige poder decir después qué
             texto exacto se le leyó a esa familia ese día. -->
        <details class="aviso" [open]="consentimiento === null">
          <summary style="cursor:pointer;font-weight:600">
            Lea esto a la familia antes de continuar
          </summary>
          <div style="margin-top:.6rem;font-size:.94rem">
            <p style="margin:0 0 .6rem">
              Estamos levantando una caracterización de familias afectadas por el sismo,
              para presentarla ante las autoridades del sistema de gestión del riesgo y
              ante organismos de cooperación, con el fin de gestionar ayuda.
            </p>
            <p style="margin:0 0 .6rem">
              Esta caracterización <strong>no reemplaza</strong> el censo oficial, ni las
              evaluaciones técnicas, ni ningún trámite que le corresponda a una entidad.
            </p>
            <p style="margin:0 0 .6rem">
              Sus datos se usarán solo para eso, se tratarán de forma reservada, y usted
              puede pedir en cualquier momento que se eliminen.
            </p>
            <p style="margin:0">
              Voy a hacerle tres preguntas por separado, y puede responder que no a
              cualquiera de ellas sin quedar por fuera del registro.
            </p>
          </div>
        </details>

        <!-- Tres preguntas y no una. La Ley 1581 trata los datos sensibles aparte y
             establece que nadie está obligado a autorizarlos: si la única forma de
             quedar caracterizado fuera aceptar en bloque, la autorización sería
             discutible por no ser libre. Y en terreno hay familias que quieren quedar
             contadas y no quieren que su salud salga hacia una entidad.

             Cada una con tres estados. Sin marcar no es un no: es que nadie preguntó. -->
        <div class="campo">
          <label>
            1 · ¿Autoriza que registremos sus datos personales?
            <span class="obligatorio">obligatorio</span>
          </label>
          <span class="pista">Nombre, documento y teléfono. Sin esto el caso se guarda sin identidad.</span>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="consentimiento === true"
                    (click)="fijarConsentimiento(true)">Sí, autoriza</button>
            <button type="button" class="pastilla" [class.activa]="consentimiento === false"
                    (click)="fijarConsentimiento(false)">No autoriza</button>
          </div>
        </div>

        <div class="campo">
          <label>2 · ¿Autoriza que registremos datos de salud del hogar?</label>
          <span class="pista">
            Gestantes, discapacidad, enfermedad crónica, personas heridas o fallecidas.
            Sirven para priorizar la atención.
          </span>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="sensibles === true"
                    (click)="fijarSensibles(true)">Sí, autoriza</button>
            <button type="button" class="pastilla" [class.activa]="sensibles === false"
                    (click)="fijarSensibles(false)">No autoriza</button>
          </div>
        </div>

        <div class="campo">
          <label>3 · ¿Autoriza que su caso se remita con su nombre a las entidades?</label>
          <span class="pista">
            Alcaldía, gestión del riesgo, salud. Si dice que no, la familia igual cuenta
            en el total, pero su nombre no sale en el listado.
          </span>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="remision === true"
                    (click)="fijarRemision(true)">Sí, autoriza</button>
            <button type="button" class="pastilla" [class.activa]="remision === false"
                    (click)="fijarRemision(false)">No autoriza</button>
          </div>
        </div>

        @if (consentimiento === null) {
          <p class="aviso">
            La primera pregunta hay que hacerla para continuar. Las otras dos se pueden
            dejar sin responder si la familia no quiere contestarlas.
          </p>
        } @else {
          @if (consentimiento === false) {
            <p class="aviso peligro">
              Sin autorización NO se registran nombre, documento, teléfono ni fotos de la
              familia. El caso se guarda con ubicación, número de personas y tipo de daño.
            </p>
          }
          @if (sensibles !== true) {
            <p class="aviso peligro">
              Sin la segunda, no se registran datos de salud: ni gestantes, ni
              discapacidad, ni heridos ni fallecidos. Si los llena, no se guardan.
            </p>
          }
          @if (remision !== true) {
            <p class="aviso">
              Sin la tercera, la familia cuenta en el consolidado pero no aparece por su
              nombre en un oficio a una entidad.
            </p>
          }
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
    this.responder('consentimiento', autoriza);
  }

  /** Datos de salud del hogar. Ley 1581: se autorizan aparte y nadie esta obligado. */
  get sensibles(): boolean | null {
    return this.leer('autorizaDatosSensibles');
  }
  fijarSensibles(autoriza: boolean): void {
    this.responder('autorizaDatosSensibles', autoriza);
  }

  /** Remision nominal a entidades. Sin ella la familia cuenta, pero sin nombre. */
  get remision(): boolean | null {
    return this.leer('autorizaRemisionEntidades');
  }
  fijarRemision(autoriza: boolean): void {
    this.responder('autorizaRemisionEntidades', autoriza);
  }

  private leer(campo: string): boolean | null {
    const valor = this.form().get(`control.${campo}`)?.value;
    return valor === true || valor === false ? valor : null;
  }

  /**
   * Guarda la respuesta y, con ella, la prueba de que se pidio.
   *
   * La Ley 1581 exige poder consultar la autorizacion despues y conservar prueba de
   * haber informado. Por eso, al responder la primera pregunta, se estampa QUE VERSION
   * del texto se leyo y CUANDO respondio la familia. Sin eso, «autorizo: si» no se
   * puede sostener ante nadie.
   *
   * La hora se estampa una sola vez, en la primera respuesta: es el momento en que se
   * le leyo el texto a la familia, no el de cada toque de boton.
   */
  private responder(campo: string, autoriza: boolean): void {
    const control = this.form().get(`control.${campo}`);
    if (!control) return;

    control.setValue(autoriza);
    control.markAsDirty();

    const version = this.form().get('control.versionAutorizacion');
    const cuando = this.form().get('control.autorizadoEn');

    if (version && !version.value) version.setValue(PasoLugarComponent.VERSION_AUTORIZACION);
    if (cuando && !cuando.value) cuando.setValue(new Date().toISOString());
  }

  /**
   * Version del texto que esta pantalla muestra.
   *
   * Vive en docs/cumplimiento/autorizacion.md. Cuando ese texto cambie, sube la
   * version aqui y los casos viejos siguen apuntando a la que les corresponde.
   */
  private static readonly VERSION_AUTORIZACION = '1.0.0-borrador';

  /** El contenedor escucha este evento, captura la coordenada y la persiste. */
  readonly capturarGps = output<void>();
}
