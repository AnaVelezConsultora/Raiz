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
import { Prioridad, Zona } from '../../core/domain/enums';
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
        <a routerLink="/casos" class="pastilla" style="align-self:flex-start">← Casos</a>
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

  /** Instancia de Leaflet y su capa de puntos. Fuera de las señales: no es estado. */
  private mapa: import('leaflet').Map | null = null;
  private capa: import('leaflet').LayerGroup | null = null;

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
    const L = await import('leaflet');

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
    const L = await import('leaflet');

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
