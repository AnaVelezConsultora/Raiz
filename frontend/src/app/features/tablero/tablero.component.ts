import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResumenTablero } from '../../core/domain/caso.model';
import { NivelVerificacion, Prioridad, Zona } from '../../core/domain/enums';
import { TABLERO, TableroPort } from '../../core/domain/ports';
import { SesionService } from '../../core/services/sesion.service';

/** Color por prioridad. Los mismos del resto de la aplicacion. */
const COLOR: Record<string, string> = {
  p0: '#b3261e',
  p1: '#c77700',
  p2: '#3f6212',
  p3: '#4a5568'
};

/**
 * Tablero de administración.
 *
 * -----------------------------------------------------------------------------------
 * ES EL CONTENEDOR, NO UNA PANTALLA SUELTA
 * -----------------------------------------------------------------------------------
 *
 * Aquí se cuelgan las vistas de gestión que vengan —seguimiento de remisiones, mora
 * por entidad, duplicados—. Se pide así para que no nazcan cada una con su ruta, su
 * guarda y su propia idea de quién es quién: en tres meses serían cuatro criterios de
 * permiso distintos y ninguno auditable.
 *
 * LA PUERTA ES UN PERMISO, NO UNA LISTA DE ROLES. `verTodosLosCasos`, que es la misma
 * frontera que `es_mesa()` usa en las políticas de PostgreSQL. El líder y el digitador
 * quedan fuera por definición, porque su permiso es `verSoloLoPropio` — y lo que ellos
 * necesitan es otra pantalla.
 *
 * Y la guarda no protege nada: si alguien llega aquí sin permiso, el servidor le
 * responde con lo que su rol alcanza. Un líder que forzara la ruta vería sus propios
 * casos, no los del municipio.
 *
 * -----------------------------------------------------------------------------------
 * SIN CONEXIÓN NO HAY TABLERO, Y ESO ES DELIBERADO
 * -----------------------------------------------------------------------------------
 *
 * La captura funciona sin señal porque el trabajo del voluntario no puede depender de
 * la red. Esto es lo contrario: se mira en el pueblo, para decidir a dónde van los
 * recursos. Mostrar cifras guardadas de ayer sin decirlo, en una reunión con una
 * entidad, es peor que no mostrar nada.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-tablero',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:1rem 1rem 3rem">
      <header class="pila-sm">
        <div class="fila" style="gap:.4rem">
          <a routerLink="/casos" class="pastilla">← Casos</a>
          <!-- La otra unidad: el censo ordena por familia, esto por infraestructura, y
               es en la segunda donde una obra se prioriza. -->
          <a routerLink="/puntos" class="pastilla">Infraestructura</a>
        </div>
        <h1>Tablero</h1>
        <p class="tenue">
          {{ sesion.nombre() }} · {{ sesion.rol() }} ·
          {{ cargando() ? 'consultando...' : filtrados().length + ' caso(s)' }}
        </p>
      </header>

      @if (error()) {
        <p class="aviso peligro">{{ error() }}</p>
      }

      <!-- Las cifras van arriba porque son la respuesta a la pregunta con la que se
           llega: cuántas familias y cuántas personas. El mapa dice dónde. -->
      <section class="rejilla-cifras">
        <div class="cifra"><strong>{{ cifras().familias }}</strong><span>familias</span></div>
        <div class="cifra"><strong>{{ cifras().personas }}</strong><span>personas</span></div>
        <div class="cifra"><strong>{{ cifras().menores }}</strong><span>menores</span></div>
        <div class="cifra"><strong>{{ cifras().mayores }}</strong><span>60 o más</span></div>
        <div class="cifra" [class.urgente]="cifras().urgentes > 0">
          <strong>{{ cifras().urgentes }}</strong><span>riesgo de vida</span>
        </div>
        <div class="cifra"><strong>{{ cifras().sinCoordenada }}</strong><span>sin ubicar</span></div>
      </section>

      <!-- CUÁNTO DE ESTO ESTÁ COMPROBADO.
           Es la franja que convierte un listado en una fuente. Un tablero que
           presenta junto lo observado y lo referido, sin distinguirlos, pierde en un
           minuto la confiabilidad que costó meses construir — y es lo primero que
           una entidad pregunta cuando ve una cifra que no levantó ella.
           Ver docs/ESTANDAR-PROBATORIO.md, recomendación G9. -->
      <section class="pila-sm" style="margin-top:.4rem">
        <div class="fila" style="justify-content:space-between;gap:.5rem">
          <h3 style="font-size:.95rem">De esas {{ cifras().familias }}, cuántas están comprobadas</h3>
          <span class="mono tenue" style="font-size:.7rem">
            {{ verificacion().comprobadas }} de {{ cifras().familias }}
          </span>
        </div>

        <!-- Una barra y no una torta: lo que hay que leer de un vistazo es la
             proporción, no seis números. -->
        <div class="barra-verificacion" role="img"
             [attr.aria-label]="'Verificación: ' + verificacion().resumen">
          @for (n of verificacion().tramos; track n.nivel) {
            @if (n.total > 0) {
              <span [style.flex]="n.total" [class]="'tramo ' + n.clase"
                    [title]="n.etiqueta + ': ' + n.total"></span>
            }
          }
        </div>

        <div class="fila" style="gap:.5rem;flex-wrap:wrap">
          @for (n of verificacion().tramos; track n.nivel) {
            @if (n.total > 0) {
              <span class="leyenda">
                <span [class]="'punto ' + n.clase"></span>
                {{ n.total }} {{ n.etiqueta }}
              </span>
            }
          }
        </div>

        @if (verificacion().sinOrigen > 0) {
          <span class="pista">
            {{ verificacion().sinOrigen }} registro(s) de antes del 19 de agosto, cuando
            todavía no se preguntaba de dónde salía el dato. Cuentan como autodeclarados
            hasta que alguien los revise.
          </span>
        }
      </section>

      <section class="fila" style="gap:.4rem;flex-wrap:wrap">
        <button type="button" class="pastilla" [class.activa]="zona() === null"
                (click)="zona.set(null)">Todas</button>
        <button type="button" class="pastilla" [class.activa]="zona() === zonaRural"
                (click)="zona.set(zonaRural)">Rural</button>
        <button type="button" class="pastilla" [class.activa]="zona() === zonaUrbana"
                (click)="zona.set(zonaUrbana)">Urbana</button>
        <span style="flex:1"></span>
        <button type="button" class="pastilla" [class.activa]="soloUrgentes()"
                (click)="soloUrgentes.set(!soloUrgentes())">Solo riesgo de vida</button>
      </section>

      <!-- El mapa se pinta sobre este div desde Leaflet. Lleva alto fijo porque un
           contenedor sin alto deja el mapa en cero pixeles y no da ningún error. -->
      <div id="mapa" style="height:60vh;min-height:320px;border-radius:12px;
                            border:1px solid var(--rule);background:var(--surface-2)"></div>

      @if (sinCoordenadaFiltrados() > 0) {
        <p class="pista">
          {{ sinCoordenadaFiltrados() }} caso(s) no aparecen en el mapa porque no tienen
          coordenada. Están contados arriba: el mapa ubica, no cuenta.
        </p>
      }

      <p class="pista">
        El mapa ubica la afectación, no la vivienda. Esta pantalla no muestra nombres ni
        teléfonos: sirve para contar, ubicar y priorizar.
      </p>
    </div>
  `,
  styles: [
    `
      /* La barra de verificacion. Los seis tramos van del papel al verde del sello:
         mas oscuro es mas comprobado, que es la lectura que la gente hace sola sin
         que nadie le explique la leyenda. */
      .barra-verificacion {
        display: flex;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--surface-2);
      }
      .tramo { display: block; min-width: 3px; }
      .leyenda {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.8rem;
        color: var(--ink-soft);
      }
      .punto { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
      .n0, .tramo.n0 { background: #d8cfb8; }
      .n1, .tramo.n1 { background: #bda98a; }
      .n2, .tramo.n2 { background: #7f9a80; }
      .n3, .tramo.n3 { background: #5c7f61; }
      .n4, .tramo.n4 { background: #3f6444; }
      .n5, .tramo.n5 { background: #2b3a2e; }

      .rejilla-cifras {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
        gap: 0.6rem;
      }
      .cifra {
        display: flex;
        flex-direction: column;
        padding: 0.7rem 0.8rem;
        border: 1px solid var(--rule);
        border-radius: 10px;
        background: var(--surface);
      }
      .cifra strong {
        font-size: 1.6rem;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }
      .cifra span {
        font-size: 0.78rem;
        color: var(--ink-soft);
      }
      .cifra.urgente strong {
        color: var(--p0);
      }
      .pastilla.activa {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
      }
    `
  ]
})
export class TableroComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly tablero = inject(TABLERO) as TableroPort;
  readonly sesion = inject(SesionService);

  readonly casos = signal<ResumenTablero[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  readonly zona = signal<Zona | null>(null);
  readonly soloUrgentes = signal(false);
  readonly zonaRural = Zona.Rural;
  readonly zonaUrbana = Zona.Urbana;

  readonly filtrados = computed(() =>
    this.casos().filter((c) => {
      if (this.zona() !== null && c.zona !== this.zona()) return false;
      if (this.soloUrgentes() && c.prioridad !== Prioridad.P0) return false;
      return true;
    })
  );

  readonly cifras = computed(() => {
    const filas = this.filtrados();
    return {
      familias: filas.length,
      personas: filas.reduce((n, c) => n + (c.personasTotal ?? 0), 0),
      menores: filas.reduce((n, c) => n + (c.menores ?? 0), 0),
      mayores: filas.reduce((n, c) => n + (c.adultosMayores ?? 0), 0),
      urgentes: filas.filter((c) => c.prioridad === Prioridad.P0).length,
      sinCoordenada: filas.filter((c) => c.lat === null || c.lon === null).length
    };
  });

  readonly sinCoordenadaFiltrados = computed(() => this.cifras().sinCoordenada);

  /**
   * Los seis niveles, de menos a mas comprobado, con su etiqueta en castellano.
   *
   * Las etiquetas no dicen «R2»: dicen lo que significa. El codigo sirve para hablar
   * con un funcionario que ya conoce la escala; la palabra sirve para todos los demas,
   * que son casi todos.
   */
  private static readonly NIVELES: readonly { nivel: NivelVerificacion; etiqueta: string; clase: string }[] = [
    { nivel: NivelVerificacion.Autodeclarado, etiqueta: 'autodeclaradas', clase: 'n0' },
    { nivel: NivelVerificacion.ReportadoTercero, etiqueta: 'por terceros', clase: 'n1' },
    { nivel: NivelVerificacion.VerificadoPresencial, etiqueta: 'vistas en terreno', clase: 'n2' },
    { nivel: NivelVerificacion.VerificadoDocumental, etiqueta: 'con documento', clase: 'n3' },
    { nivel: NivelVerificacion.VerificadoTecnico, etiqueta: 'con visita técnica', clase: 'n4' },
    { nivel: NivelVerificacion.ValidadoInstitucional, etiqueta: 'validadas por una entidad', clase: 'n5' }
  ];

  /**
   * Cuanto de lo que se esta mostrando esta comprobado, y hasta donde.
   *
   * `comprobadas` cuenta de R2 para arriba: alguien fue y lo vio. Lo declarado y lo
   * referido no entran, y esa es justamente la distincion que hace defendible una
   * cifra ante una entidad.
   */
  readonly verificacion = computed(() => {
    const filas = this.filtrados();

    const tramos = TableroComponent.NIVELES.map((n) => ({
      ...n,
      total: filas.filter((c) => c.nivelVerificacion === n.nivel).length
    }));

    const comprobadas = filas.filter(
      (c) =>
        c.nivelVerificacion !== NivelVerificacion.Autodeclarado &&
        c.nivelVerificacion !== NivelVerificacion.ReportadoTercero
    ).length;

    return {
      tramos,
      comprobadas,
      sinOrigen: filas.filter((c) => c.origenDato === null).length,
      resumen: tramos
        .filter((n) => n.total > 0)
        .map((n) => `${n.total} ${n.etiqueta}`)
        .join(', ')
    };
  });

  /** Instancia de Leaflet y su capa de puntos. Fuera de las señales: no es estado. */
  private mapa: import('leaflet').Map | null = null;
  private capa: import('leaflet').LayerGroup | null = null;

  /**
   * Leaflet, venga como venga.
   *
   * Leaflet se publica al estilo viejo —CommonJS—, y quien lo empaqueta decide dónde
   * queda lo que exporta: el servidor de desarrollo lo desenvuelve y entrega las
   * funciones arriba; la compilación de producción las deja colgando de `default`.
   *
   * Sin esta línea, `L.map` es `undefined` SOLO en lo publicado. Costó un despliegue:
   * las cifras salían bien y el mapa quedaba en blanco con `t.map is not a function` en
   * la consola, un fallo que ninguna prueba contra el servidor de desarrollo puede ver
   * porque ahí el paquete es otro.
   */
  private async leaflet(): Promise<typeof import('leaflet')> {
    const modulo = await import('leaflet');
    return ((modulo as { default?: typeof import('leaflet') }).default ??
      modulo) as typeof import('leaflet');
  }

  constructor() {
    // Repinta cuando cambian los datos o los filtros, sin que cada uno tenga que
    // acordarse de llamar al mapa.
    effect(() => {
      const filas = this.filtrados();
      if (this.capa) this.pintar(filas);
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.casos.set(await this.tablero.listarCasos());
    } catch (e) {
      this.error.set(
        e instanceof Error
          ? `No se pudo consultar: ${e.message}`
          : 'No se pudo consultar el tablero.'
      );
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * Leaflet se carga aquí y no arriba, y no es un detalle.
   *
   * Son unos 150 KB que sólo necesita esta pantalla: importándolo de forma perezosa,
   * el paquete inicial —el que descarga un líder en la vereda con su plan de datos—
   * no crece ni un byte.
   */
  async ngAfterViewInit(): Promise<void> {
    this.asegurarEstilos();
    const L = await this.leaflet();

    // Sevilla, Valle del Cauca. Es el encuadre inicial; en cuanto haya puntos, el
    // mapa se ajusta a ellos.
    this.mapa = L.map('mapa', { attributionControl: true }).setView([4.2708, -75.9403], 12);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(this.mapa);

    this.capa = L.layerGroup().addTo(this.mapa);
    this.pintar(this.filtrados());
  }

  /**
   * Pide la hoja de estilos de Leaflet, una sola vez y solo aqui.
   *
   * No va en los estilos globales a proposito: son unos 15 KB que un lider en la
   * vereda descargaria para capturar una ficha, sin abrir jamas esta pantalla. Se
   * compila aparte —`inject: false` en angular.json— y se sirve desde nuestro propio
   * origen, que es lo que la politica de seguridad permite.
   */
  private asegurarEstilos(): void {
    if (document.getElementById('estilos-leaflet')) return;

    const enlace = document.createElement('link');
    enlace.id = 'estilos-leaflet';
    enlace.rel = 'stylesheet';
    enlace.href = 'leaflet.css';
    document.head.appendChild(enlace);
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
    this.mapa = null;
  }

  /**
   * Un círculo por caso, del color de su prioridad.
   *
   * Círculos y no marcadores con icono: un marcador clásico apunta a un punto exacto y
   * eso aquí sería mentir, porque la coordenada tiene la precisión que tuvo el GPS del
   * celular ese día. Un círculo se lee como «por aquí», que es lo cierto.
   */
  private async pintar(filas: ResumenTablero[]): Promise<void> {
    if (!this.capa || !this.mapa) return;
    const L = await this.leaflet();

    this.capa.clearLayers();
    const puntos: [number, number][] = [];

    for (const c of filas) {
      if (c.lat === null || c.lon === null) continue;
      puntos.push([c.lat, c.lon]);

      L.circleMarker([c.lat, c.lon], {
        radius: 6 + Math.min(8, (c.personasTotal ?? 0) / 2),
        color: COLOR[c.prioridad ?? 'p3'],
        fillColor: COLOR[c.prioridad ?? 'p3'],
        fillOpacity: 0.55,
        weight: 2
      })
        .bindPopup(
          `<strong>${c.codigo}</strong><br>` +
            `${c.lugar ?? 'Sin ubicar'} · ${c.zona}<br>` +
            `${c.personasTotal} persona(s), ${c.menores} menor(es)<br>` +
            `${c.afectacion ?? 'afectación sin registrar'}` +
            (c.habitable === false ? ' · no habitable' : '') +
            `<br>${c.nFotos} fotografía(s)`
        )
        .addTo(this.capa);
    }

    if (puntos.length > 0) {
      this.mapa.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 15 });
    }
  }
}
