import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Zona } from '../../core/domain/enums';
import { environment } from '../../../environments/environment';
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

        <!-- QUIEN OBSERVO, que no es lo mismo que por qué canal llegó. Presencial y
             «lo dijo la familia» es una combinación legítima: el voluntario estuvo
             ahí, pero lo de las grietas del muro trasero se lo contaron.

             De aquí sale el nivel de verificación con el que nace el caso, y por eso
             no se pregunta ese nivel: sería pedir lo mismo dos veces con palabras de
             abogado. -->
        <div class="campo">
          <label for="origen">
            ¿Cómo sabe usted esto?
            <span class="obligatorio">obligatorio</span>
          </label>
          <select id="origen" formControlName="origenDato">
            <option [value]="null">Seleccione</option>
            @for (o of origenes; track o.v) {
              <option [value]="o.v">{{ o.t }}</option>
            }
          </select>
          <span class="pista">{{ explicacionOrigen() }}</span>
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
            <!-- QUE ES RAIZ Y QUE NO ES, antes de pedir nada. La persona tiene que
                 saber que esta haciendo antes de autorizarlo, y decirlo aqui evita la
                 expectativa de que quedar en esta lista da un reconocimiento oficial
                 —que no lo da y no depende de nosotros. -->
            <p style="margin:0 0 .6rem">
              <strong>Raíz es una iniciativa comunitaria</strong> de caracterización y
              documentación temprana de afectaciones. Estamos documentando lo que le pasó
              a las personas, las familias y el territorio con el sismo, para entregarlo a
              las autoridades competentes y a organismos de cooperación.
            </p>
            <p style="margin:0 0 .6rem">
              Esta caracterización <strong>no sustituye</strong> los censos, registros,
              evaluaciones técnicas ni certificaciones oficiales de las autoridades. Quedar
              aquí no lo declara damnificado: eso lo decide una entidad.
            </p>
            <!-- FINALIDAD, en los terminos que exige la Ley 1581: expresa y concreta,
                 no «solo para eso». -->
            <p style="margin:0 0 .6rem">
              Su información se usará para caracterizar afectaciones y necesidades,
              orientar la atención humanitaria, apoyar la gestión del riesgo y entregar
              información a las autoridades y organismos que intervengan en la respuesta y
              la recuperación.
            </p>
            <!-- LOS DERECHOS, COMPLETOS Y SIN PROMETER DE MAS. Antes decia «puede pedir
                 que los eliminemos», que suena mejor y es falso: la supresion tiene
                 condiciones y excepciones legales, y prometer un borrado incondicional
                 es una promesa que no se puede cumplir. -->
            <p style="margin:0 0 .6rem">
              Usted puede conocer, actualizar y rectificar su información, revocar esta
              autorización o solicitar que se suprima, conforme a las condiciones que
              establece la ley colombiana.
              @if (hayResponsable()) {
                Para eso escriba a <strong>{{ responsable.canalDerechos }}</strong>.
              }
            </p>

            @if (hayResponsable()) {
              <p style="margin:0 0 .6rem">
                <strong>Responsable de la información:</strong> {{ responsable.nombre }}
                @if (responsable.contacto) {
                  · {{ responsable.contacto }}
                }
              </p>
            } @else {
              <!-- Incomodo a proposito. Un aviso incomodo se resuelve en un dia; un
                   nombre inventado se descubre el dia que alguien reclama. -->
              <p class="aviso peligro" style="margin:0 0 .6rem">
                <strong>Falta definir quién responde por estos datos.</strong>
                La ley exige decirle a la familia quién los recoge y a dónde escribir
                para ejercer sus derechos. Avísele a la mesa antes de seguir
                registrando con identidad.
              </p>
            }
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
          <!-- QUIEN AUTORIZA ES LA PERSONA, NO «LA FAMILIA». Los datos personales son
               de personas naturales determinadas, y una familia no es titular de nada.
               La pregunta se le hace a quien esta ahi respondiendo, y por eso va en
               primera persona: «autorizo», no «la familia autoriza».

               Falta todavia distinguir a los titulares dentro del hogar —ninos, ninas y
               adolescentes, personas heridas, personas con discapacidad—, que es un
               cambio del modelo de datos y no de esta pantalla. Anotado en la deuda. -->
          <label>
            1 · ¿Autoriza usted el tratamiento de sus datos personales para lo que le acabo de leer?
            <span class="obligatorio">obligatorio</span>
          </label>
          <span class="pista">Nombre, documento y teléfono. Sin esto el caso se guarda sin identidad.</span>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="consentimiento === true"
                    (click)="fijarConsentimiento(true)">Sí, autorizo</button>
            <button type="button" class="pastilla" [class.activa]="consentimiento === false"
                    (click)="fijarConsentimiento(false)">No autorizo</button>
          </div>
        </div>

        <div class="campo">
          <label>2 · ¿Autoriza que registremos datos de salud de las personas del hogar?</label>
          <!-- El Decreto 1377 obliga a decir DOS cosas al pedir datos sensibles: cuales
               lo son, y que nadie esta obligado a entregarlos. Va aqui, en el momento de
               preguntarlo, y no en el texto largo que casi nadie termina de leer. -->
          <span class="pista">
            Gestantes, discapacidad, enfermedad crónica, personas heridas o fallecidas.
            Son datos sensibles y <strong>nadie está obligado a entregarlos</strong>:
            responder que no aquí no la deja por fuera del registro.
          </span>
          <div class="pastillas">
            <button type="button" class="pastilla" [class.activa]="sensibles === true"
                    (click)="fijarSensibles(true)">Sí, autorizo</button>
            <button type="button" class="pastilla" [class.activa]="sensibles === false"
                    (click)="fijarSensibles(false)">No autorizo</button>
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
                    (click)="fijarRemision(true)">Sí, autorizo</button>
            <button type="button" class="pastilla" [class.activa]="remision === false"
                    (click)="fijarRemision(false)">No autorizo</button>
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
              Sin autorización no se registra nada que identifique a la familia: ni
              nombre, ni documento, ni teléfono, ni fotos. El caso se guarda con el
              número de personas, el tipo de daño y <strong>la vereda, sin el punto
              exacto</strong>, para que cuente en el total sin señalar una casa.
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
        <!-- LA ZONA YA SE ELIGIO, EN LA PANTALLA ANTERIOR.
             Volver a mostrarla como lista desplegable con las dos opciones invita a
             cambiarla sin querer —el enlace institucional entro por «rural» y aqui
             seguia viendo «urbana» a un dedo de distancia— y, peor, no se nota: cambiar
             la zona cambia el anexo entero del formulario, asi que un roce deja media
             ficha con las preguntas equivocadas.

             Se muestra como decidida, con la salida explicita para corregir el error de
             haber entrado por el boton que no era. Es la diferencia entre poder cambiar
             algo y tropezarse con ello. -->
        <div class="campo">
          <label>Zona</label>
          @if (cambiandoZona()) {
            <select id="zona" formControlName="zona" (change)="cambiandoZona.set(false)">
              <option [value]="zonaRural">Rural: vereda, corregimiento o finca</option>
              <option [value]="zonaUrbana">Urbana: barrio o casco urbano</option>
            </select>
            <span class="pista">
              Cambiarla cambia las preguntas del resto de esta pantalla.
            </span>
          } @else {
            <div class="fila" style="justify-content:space-between;align-items:center;gap:.5rem">
              <strong>{{ esRural() ? 'Rural: vereda, corregimiento o finca' : 'Urbana: barrio o casco urbano' }}</strong>
              <button type="button" class="pastilla" (click)="cambiandoZona.set(true)">
                Cambiar
              </button>
            </div>
            <span class="pista">Se eligió al empezar el registro.</span>
          }
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
  readonly origenes = OPCIONES.origenDato;

  /**
   * Lo que significa cada opcion, en una linea y sin jerga.
   *
   * Se muestra debajo del campo en vez de en una ayuda aparte: un voluntario de pie
   * bajo el sol no abre una ayuda, y esta eleccion decide con que nivel de
   * verificacion nace el caso.
   */
  explicacionOrigen(): string {
    switch (this.form().get('control.origenDato')?.value) {
      case 'observado':
        return 'Usted estuvo ahí y lo vio. El caso queda como verificado en terreno.';
      case 'familia':
        return 'Se lo contó la propia familia. El caso queda como declarado por ella.';
      case 'tercero':
        return 'Se lo contó un vecino o un líder. Queda como reportado por un tercero.';
      case 'listado_entidad':
        return 'Viene de un listado de otra organización o entidad.';
      default:
        return 'De esto depende con qué nivel de verificación queda el caso.';
    }
  }
  /**
   * Si la zona se esta editando. Nace cerrada a proposito: la eleccion ya se hizo.
   */
  readonly cambiandoZona = signal(false);

  /** Quien responde por los datos. Decision juridica, no configuracion. */
  readonly responsable = environment.responsableTratamiento;

  /** False mientras nadie haya aceptado responder. Ver ResponsableTratamiento. */
  hayResponsable(): boolean {
    return this.responsable.nombre.trim().length > 0;
  }

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
