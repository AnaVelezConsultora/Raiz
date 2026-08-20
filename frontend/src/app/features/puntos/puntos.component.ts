import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { PuntoEnTablero, PuntoServicio } from '@raiz/dominio';
import {
  EstadoServicio,
  NOMBRE_ESTADO_SERVICIO,
  NOMBRE_TIPO_PUNTO,
  OrigenDato,
  TipoPunto,
  Zona
} from '../../core/domain/enums';
import { TABLERO, TableroPort } from '../../core/domain/ports';
import { SesionService } from '../../core/services/sesion.service';
import { environment } from '../../../environments/environment';

/** Como se pinta cada estado. El rojo se reserva para lo que no presta servicio. */
const CLASE_ESTADO: Readonly<Record<EstadoServicio, string>> = {
  [EstadoServicio.Operativo]: 'e-bien',
  [EstadoServicio.Intermitente]: 'e-medio',
  [EstadoServicio.FueraServicio]: 'e-mal',
  [EstadoServicio.Destruido]: 'e-peor'
};

/**
 * Infraestructura afectada.
 *
 * -----------------------------------------------------------------------------------
 * LA OTRA UNIDAD DE RAIZ
 * -----------------------------------------------------------------------------------
 *
 * El censo ordena por familia, y ahi cada familia compite con las demas por la misma
 * ayuda. Esta pantalla ordena por INFRAESTRUCTURA, y ahi una sola reparacion resuelve
 * doscientos casos a la vez. Es la unidad en la que piensa el CMGRD, y es la unica en
 * la que una obra se prioriza.
 *
 * -----------------------------------------------------------------------------------
 * LAS DOS CIFRAS SE MUESTRAN SEPARADAS, SIEMPRE
 * -----------------------------------------------------------------------------------
 *
 * «Segun el lider» es lo que alguien declaro y se consigue hoy por telefono.
 * «Registrados en Raiz» sale de cruzar las veredas que el punto sirve con el censo, y
 * empieza bajo porque el censo apenas va.
 *
 * Fundirlas —promediarlas, o quedarse con la mas alta— destruye las dos. Se muestran
 * lado a lado y rotuladas, porque una entidad que ve las dos entiende de inmediato que
 * le estan mostrando: la primera es el tamano del problema, la segunda es cuanto de ese
 * tamano Raiz puede sostener con registros. Esa transparencia es justamente lo que hace
 * creible la cifra grande.
 *
 * Es la misma logica de la franja de verificacion del tablero.
 *
 * -----------------------------------------------------------------------------------
 * ESTA PANTALLA NECESITA SENAL
 * -----------------------------------------------------------------------------------
 *
 * Y lo dice en vez de disimularlo. La captura de casos funciona sin red porque el
 * trabajo de vereda no puede depender de ella; esto se llena una sola vez por punto,
 * casi siempre desde el pueblo. Construir una segunda cola de sincronizacion costaria
 * hoy mas de lo que resuelve. El dia que haga falta en terreno, se revisa.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-puntos',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:1rem 1rem 3rem">
      <header class="pila-sm">
        <a routerLink="/tablero" class="pastilla" style="align-self:flex-start">← Tablero</a>
        <h1>Infraestructura afectada</h1>
        <p class="tenue">
          Lo que se dañó y le sirve a muchos hogares: acueductos, vías, puentes,
          escuelas.
        </p>
      </header>

      @if (error()) {
        <p class="aviso peligro">{{ error() }}</p>
      }
      @if (confirmacion()) {
        <p class="aviso">{{ confirmacion() }}</p>
      }

      @if (!abierto()) {
        <button type="button" class="boton" style="align-self:flex-start"
                (click)="abrir()">
          Registrar un punto
        </button>
      }

      @if (abierto()) {
        <form class="pila tarjeta" [formGroup]="form" (ngSubmit)="guardar()">
          <h3>Registrar un punto de servicio</h3>

          <div class="campo">
            <label for="tipo">Qué es</label>
            <select id="tipo" formControlName="tipo">
              @for (t of tipos; track t.v) {
                <option [value]="t.v">{{ t.t }}</option>
              }
            </select>
          </div>

          <div class="campo">
            <label for="nombre">Cómo lo llama la gente</label>
            <input id="nombre" type="text" formControlName="nombre"
                   placeholder="Acueducto La Cumbre" />
            <span class="pista">
              El nombre de uso, no un código. Es como lo va a buscar quien lea el informe.
            </span>
          </div>

          <div class="fila" style="gap:.6rem;flex-wrap:wrap">
            <div class="campo" style="flex:1;min-width:9rem">
              <label for="zona">Zona</label>
              <select id="zona" formControlName="zona">
                <option [value]="zonaRural">Rural</option>
                <option [value]="zonaUrbana">Urbana</option>
              </select>
            </div>
            <div class="campo" style="flex:2;min-width:11rem">
              <label for="vereda">Vereda o barrio donde está</label>
              <input id="vereda" type="text" formControlName="vereda" />
            </div>
          </div>

          <div class="campo">
            <label for="estado">Cómo está prestando el servicio</label>
            <select id="estado" formControlName="estadoServicio">
              @for (e of estados; track e.v) {
                <option [value]="e.v">{{ e.t }}</option>
              }
            </select>
          </div>

          <div class="campo">
            <label for="afectacion">Qué le pasó</label>
            <textarea id="afectacion" rows="2" formControlName="descripcionAfectacion"
                      placeholder="Bocatoma colapsada por el deslizamiento"></textarea>
          </div>

          <div class="campo">
            <label for="requiere">Qué hace falta para que vuelva a funcionar</label>
            <textarea id="requiere" rows="2" formControlName="requiere"
                      placeholder="Reposición de 300 metros de tubería"></textarea>
            <span class="pista">
              Es lo que lee la entidad para dimensionar la obra. Entre más concreto, mejor.
            </span>
          </div>

          <div class="campo">
            <label for="hogares">Cuántos hogares dependen de esto</label>
            <input id="hogares" type="number" inputmode="numeric" min="0"
                   formControlName="hogaresEstimados" placeholder="180" />
            <!-- Se dice aqui, en el momento de escribirlo, que este numero es una
                 declaracion. Explicarlo despues en la ficha ya no evita que alguien lo
                 haya escrito creyendo que tenia que ser exacto. -->
            <span class="pista">
              Un aproximado sirve. Queda marcado como estimado, aparte de los hogares
              que Raíz ya tiene registrados en esas veredas.
            </span>
          </div>

          <div class="campo">
            <label for="veredas">A qué veredas les sirve</label>
            <input id="veredas" type="text" formControlName="veredasServidas"
                   placeholder="La Cumbre, El Diamante, Alto Bonito" />
            <span class="pista">
              Separadas por coma. De aquí sale el cruce con el censo. La vereda donde
              está el punto se agrega sola.
            </span>
          </div>

          <div class="campo">
            <label for="origen">¿Cómo sabe usted esto?</label>
            <select id="origen" formControlName="origenDato">
              <option [value]="null">Seleccione</option>
              @for (o of origenes; track o.v) {
                <option [value]="o.v">{{ o.t }}</option>
              }
            </select>
            <span class="pista">{{ explicacionOrigen() }}</span>
          </div>

          <div class="fila" style="gap:.5rem">
            <button type="submit" class="boton" [disabled]="guardando()">
              {{ guardando() ? 'Guardando...' : 'Guardar punto' }}
            </button>
            <button type="button" class="pastilla" (click)="abierto.set(false)">Cancelar</button>
          </div>
        </form>
      }

      <section class="pila-sm">
        <div class="fila" style="justify-content:space-between">
          <h3>
            {{ cargando() ? 'Consultando...' : puntos().length + ' punto(s) registrado(s)' }}
          </h3>
          @if (puntos().length > 0) {
            <span class="mono tenue" style="font-size:.7rem">
              {{ sinServicio() }} sin servicio
            </span>
          }
        </div>

        @if (!cargando() && puntos().length === 0) {
          <p class="pista">
            Todavía no hay ninguno. El primero que conviene registrar es el que deje sin
            servicio a más hogares: casi siempre un acueducto o una vía.
          </p>
        }

        @for (p of puntos(); track p.id) {
          <article class="tarjeta pila-sm">
            <div class="fila" style="justify-content:space-between;gap:.5rem">
              <strong>{{ nombreTipo(p.tipo) }} · {{ p.nombre }}</strong>
              <span [class]="'chip ' + claseEstado(p.estadoServicio)">
                {{ nombreEstado(p.estadoServicio) }}
              </span>
            </div>

            <span class="tenue" style="font-size:.8rem">
              {{ p.codigo }} · {{ p.vereda ?? p.municipio }}
            </span>

            <!-- LAS DOS CIFRAS, lado a lado y rotuladas. Ver el encabezado del
                 componente: fundirlas destruye las dos. -->
            <div class="dos-cifras">
              <div class="mitad">
                <strong>{{ p.hogaresEstimados ?? '—' }}</strong>
                <span>hogares según quien lo reportó</span>
              </div>
              <div class="mitad">
                <strong>{{ p.hogaresRegistrados }}</strong>
                <span>ya registrados en Raíz</span>
              </div>
            </div>

            @if (p.descripcionAfectacion) {
              <p style="margin:0">{{ p.descripcionAfectacion }}</p>
            }
            @if (p.requiere) {
              <p class="requiere">Requiere: {{ p.requiere }}</p>
            }
            @if (p.veredasServidas.length > 0) {
              <span class="pista">Sirve a: {{ p.veredasServidas.join(', ') }}</span>
            }
          </article>
        }
      </section>

      <p class="pista">
        Esta pantalla necesita conexión. Se llena una vez por punto, casi siempre desde
        el pueblo; el censo casa por casa sí funciona sin señal.
      </p>
    </div>
  `,
  styles: [
    `
      .tarjeta {
        padding: 0.9rem;
        border: 1px solid var(--rule);
        border-radius: 12px;
        background: var(--surface);
      }
      /* Dos columnas iguales y una linea entre ellas: la simetria es lo que impide
         leerlas como una sola cifra con su aclaracion al lado. */
      .dos-cifras {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.6rem;
      }
      .mitad {
        display: flex;
        flex-direction: column;
        padding: 0.5rem 0.6rem;
        border-radius: 10px;
        background: var(--surface-2);
      }
      .mitad + .mitad {
        box-shadow: inset 2px 0 0 var(--rule);
      }
      .mitad strong {
        font-size: 1.5rem;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }
      .mitad span {
        font-size: 0.72rem;
        color: var(--ink-soft);
      }
      .requiere {
        margin: 0;
        font-size: 0.85rem;
        color: var(--ink-soft);
      }
      .chip {
        font-size: 0.72rem;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        white-space: nowrap;
      }
      .e-bien { background: #e3ece1; color: #2b3a2e; }
      .e-medio { background: #f4ead0; color: #6b4e12; }
      .e-mal { background: #f5ded9; color: #7c261c; }
      .e-peor { background: #7c261c; color: #fff; }
    `
  ]
})
export class PuntosComponent implements OnInit {
  private readonly tablero = inject(TABLERO) as TableroPort;
  private readonly fb = inject(FormBuilder);
  readonly sesion = inject(SesionService);

  readonly puntos = signal<PuntoEnTablero[]>([]);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly abierto = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmacion = signal<string | null>(null);

  readonly zonaRural = Zona.Rural;
  readonly zonaUrbana = Zona.Urbana;

  readonly tipos = Object.values(TipoPunto).map((v) => ({ v, t: NOMBRE_TIPO_PUNTO[v] }));
  readonly estados = Object.values(EstadoServicio).map((v) => ({
    v,
    t: NOMBRE_ESTADO_SERVICIO[v]
  }));
  readonly origenes = [
    { v: OrigenDato.Observado, t: 'Lo vi yo' },
    { v: OrigenDato.Tercero, t: 'Me lo contaron' },
    { v: OrigenDato.ListadoEntidad, t: 'Viene de un listado de otra entidad' }
  ];

  readonly form = this.fb.nonNullable.group({
    tipo: [TipoPunto.Acueducto, Validators.required],
    nombre: ['', Validators.required],
    zona: [Zona.Rural, Validators.required],
    vereda: [''],
    estadoServicio: [EstadoServicio.FueraServicio, Validators.required],
    descripcionAfectacion: [''],
    requiere: [''],
    hogaresEstimados: [null as number | null],
    veredasServidas: [''],
    origenDato: [null as OrigenDato | null]
  });

  /** Cuantos no están prestando servicio. Es el número con el que se prioriza. */
  readonly sinServicio = computed(
    () =>
      this.puntos().filter(
        (p) =>
          p.estadoServicio === EstadoServicio.FueraServicio ||
          p.estadoServicio === EstadoServicio.Destruido
      ).length
  );

  ngOnInit(): void {
    void this.cargar();
  }

  abrir(): void {
    this.confirmacion.set(null);
    this.abierto.set(true);
  }

  nombreTipo(t: TipoPunto): string {
    return NOMBRE_TIPO_PUNTO[t];
  }

  nombreEstado(e: EstadoServicio): string {
    return NOMBRE_ESTADO_SERVICIO[e];
  }

  claseEstado(e: EstadoServicio): string {
    return CLASE_ESTADO[e];
  }

  /**
   * Que significa, en palabras, el origen elegido.
   *
   * Se explica el EFECTO y no la escala: nadie tiene por qué saber qué es un R2. Lo
   * que sí conviene que sepa quien registra es que decir «lo vi yo» compromete más que
   * decir «me lo contaron», porque de ahí sale con qué fuerza Raíz va a sostener ese
   * dato ante una entidad.
   */
  explicacionOrigen(): string {
    switch (this.form.controls.origenDato.value) {
      case OrigenDato.Observado:
        return 'Queda como visto en terreno. Es lo que Raíz puede sostener ante una entidad.';
      case OrigenDato.Tercero:
        return 'Queda como reportado por un tercero, hasta que alguien vaya y lo vea.';
      case OrigenDato.ListadoEntidad:
        return 'Queda con respaldo documental de la entidad que lo reportó.';
      default:
        return 'Sin responder queda como autodeclarado, que es el nivel más bajo.';
    }
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Falta el nombre del punto.');
      return;
    }

    this.guardando.set(true);
    this.error.set(null);

    try {
      const resultado = await this.tablero.registrarPunto(this.armar());
      this.confirmacion.set(
        `${resultado.codigo} ${resultado.yaExistia ? 'actualizado' : 'registrado'}.`
      );
      this.form.reset({
        tipo: TipoPunto.Acueducto,
        zona: Zona.Rural,
        estadoServicio: EstadoServicio.FueraServicio
      });
      this.abierto.set(false);
      await this.cargar();
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : 'No se pudo guardar. Revise la conexión.'
      );
    } finally {
      this.guardando.set(false);
    }
  }

  private armar(): PuntoServicio {
    const v = this.form.getRawValue();

    return {
      // El identificador lo genera el dispositivo, igual que en los casos: es lo que
      // hace que un reenvío por corte de señal no produzca un segundo tubo roto.
      id: crypto.randomUUID(),
      codigo: null,
      tipo: v.tipo,
      nombre: v.nombre.trim(),
      ubicacion: {
        departamento: environment.departamentoPorDefecto,
        municipio: environment.municipioPorDefecto,
        zona: v.zona,
        vereda: v.vereda.trim() || null,
        direccionRef: null,
        lat: null,
        lon: null
      },
      estadoServicio: v.estadoServicio,
      descripcionAfectacion: v.descripcionAfectacion.trim() || null,
      requiere: v.requiere.trim() || null,
      hogaresEstimados: v.hogaresEstimados === null ? null : Number(v.hogaresEstimados),
      veredasServidas: v.veredasServidas
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      origenDato: v.origenDato,
      registradorNombre: this.sesion.nombre() ?? 'Sin nombre',
      fechaRegistro: new Date().toISOString().slice(0, 10)
    };
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.puntos.set(await this.tablero.listarPuntos());
      this.error.set(null);
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : 'No se pudo consultar. Revise la conexión.'
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
