import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Caso, FotoLocal } from '../../core/domain/caso.model';
import { FuenteCoordenada, Zona } from '../../core/domain/enums';
import { CASO_STORAGE, FOTO_STORAGE } from '../../core/domain/ports';
import { CasoFactoryService } from '../../core/services/caso-factory.service';
import { CasoFormService, SeleccionMultiple } from '../../core/services/caso-form.service';
import { GeolocalizacionService } from '../../core/services/geolocalizacion.service';
import { SincronizacionService } from '../../core/services/sincronizacion.service';
import { PasoCierreComponent } from './paso-cierre.component';
import { PasoHogarComponent } from './paso-hogar.component';
import { PasoLugarComponent } from './paso-lugar.component';
import { PasoViviendaComponent } from './paso-vivienda.component';

/**
 * Contenedor del formulario por pasos.
 *
 * GUARDADO INCREMENTAL: cada avance de paso y cada foto persisten en IndexedDB de
 * inmediato. El voluntario puede quedarse sin bateria, cerrar el navegador o perder
 * la aplicacion en el paso 3 y al volver encuentra el caso donde lo dejo. En campo
 * esto no es una comodidad: es la diferencia entre tener el dato y no tenerlo.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-formulario-caso',
  imports: [PasoLugarComponent, PasoHogarComponent, PasoViviendaComponent, PasoCierreComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding-bottom:7rem">
      <header class="pila-sm" style="padding-top:1rem">
        <div class="fila" style="justify-content:space-between">
          <span class="mono">{{ caso()?.codigo ?? caso()?.codigoLocal }}</span>
          <span class="tenue">Paso {{ paso() }} de 4</span>
        </div>
        <h1>{{ titulos[paso() - 1] }}</h1>
        <div style="display:flex;gap:4px">
          @for (p of [1, 2, 3, 4]; track p) {
            <span [style.flex]="1" [style.height.px]="5"
                  [style.background]="p <= paso() ? 'var(--accent)' : 'var(--rule)'"></span>
          }
        </div>
        @if (guardadoEn()) {
          <span class="tenue">Guardado en el dispositivo a las {{ guardadoEn() }}</span>
        }
      </header>

      @if (form(); as f) {
        @switch (paso()) {
          @case (1) {
            <app-paso-lugar [form]="f" [lat]="lat()" [lon]="lon()" [precision]="precision()"
                            (capturarGps)="capturarUbicacion()" />
          }
          @case (2) {
            <app-paso-hogar [form]="f" [(afiliacion)]="seleccion.afiliacion" />
          }
          @case (3) {
            <app-paso-vivienda
              [form]="f"
              [(requiereVivienda)]="seleccion.requiereVivienda"
              [(serviciosAfectados)]="seleccion.serviciosAfectados"
              [(cultivos)]="seleccion.cultivos"
              [(infraProductiva)]="seleccion.infraProductiva"
              [(requiereAgro)]="seleccion.requiereAgro"
              [(requiereUrbano)]="seleccion.requiereUrbano" />
          }
          @case (4) {
            <app-paso-cierre
              [form]="f"
              [casoId]="caso()!.id"
              [fotos]="fotos()"
              [(convenioLinea)]="seleccion.convenioLinea"
              [(necesidades)]="seleccion.necesidades"
              (fotoLista)="agregarFoto($event)"
              (eliminarFoto)="quitarFoto($event)" />
          }
        }
      }
    </div>

    <nav style="position:fixed;left:0;right:0;bottom:0;background:var(--surface);
                border-top:1px solid var(--rule);padding:.7rem 1rem;">
      <div class="contenedor fila" style="gap:.6rem;flex-wrap:nowrap">
        <button type="button" class="btn-secundario" style="flex:1"
                (click)="paso() === 1 ? salir() : retroceder()">
          {{ paso() === 1 ? 'Salir' : 'Atras' }}
        </button>
        @if (paso() < 4) {
          <button type="button" class="btn-primario" style="flex:2" (click)="avanzar()">
            Continuar
          </button>
        } @else {
          <button type="button" class="btn-primario" style="flex:2" (click)="finalizar()">
            Guardar caso
          </button>
        }
      </div>
    </nav>
  `
})
export class FormularioCasoComponent implements OnInit {
  private readonly almacen = inject(CASO_STORAGE);
  private readonly almacenFotos = inject(FOTO_STORAGE);
  private readonly factory = inject(CasoFactoryService);
  private readonly formService = inject(CasoFormService);
  private readonly gps = inject(GeolocalizacionService);
  private readonly sync = inject(SincronizacionService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly titulos = [
    'Quien reporta y donde',
    'Quienes viven ahi',
    'La vivienda y el dano',
    'Fotos, prioridad y necesidad'
  ];

  readonly paso = signal(1);
  readonly caso = signal<Caso | null>(null);
  readonly form = signal<FormGroup | null>(null);
  readonly fotos = signal<FotoLocal[]>([]);
  readonly guardadoEn = signal<string>('');
  readonly lat = signal<number | null>(null);
  readonly lon = signal<number | null>(null);
  readonly precision = signal<number | null>(null);

  /** Selecciones multiples. Viven fuera del FormGroup porque se pintan como pastillas. */
  readonly seleccion: Record<keyof SeleccionMultiple, ReturnType<typeof signal<string[]>>> = {
    afiliacion: signal<string[]>([]),
    requiereVivienda: signal<string[]>([]),
    serviciosAfectados: signal<string[]>([]),
    cultivos: signal<string[]>([]),
    infraProductiva: signal<string[]>([]),
    requiereAgro: signal<string[]>([]),
    requiereUrbano: signal<string[]>([]),
    convenioLinea: signal<string[]>([]),
    necesidades: signal<string[]>([])
  };

  async ngOnInit(): Promise<void> {
    const id = this.ruta.snapshot.paramMap.get('id');
    const zonaParam = this.ruta.snapshot.queryParamMap.get('zona');

    const caso = id
      ? ((await this.almacen.obtener(id)) ?? this.factory.crear(this.aZona(zonaParam)))
      : this.factory.crear(this.aZona(zonaParam));

    this.caso.set(caso);
    this.form.set(this.formService.construir(caso));
    this.lat.set(caso.ubicacion.lat);
    this.lon.set(caso.ubicacion.lon);
    this.precision.set(caso.ubicacion.precisionM);
    this.paso.set(Math.min(4, Math.max(1, caso.pasoCompletado + 1)));
    this.restaurarSelecciones(caso);
    this.fotos.set(await this.almacenFotos.porCaso(caso.id));
  }

  async avanzar(): Promise<void> {
    await this.persistir();
    this.paso.update((p) => Math.min(4, p + 1));
    window.scrollTo({ top: 0 });
  }

  retroceder(): void {
    this.paso.update((p) => Math.max(1, p - 1));
    window.scrollTo({ top: 0 });
  }

  async salir(): Promise<void> {
    await this.persistir();
    void this.router.navigate(['/casos']);
  }

  async finalizar(): Promise<void> {
    await this.persistir();
    await this.sync.refrescarContadores();
    void this.router.navigate(['/casos']);
  }

  async capturarUbicacion(): Promise<void> {
    const coord = await this.gps.capturar();
    if (!coord) return;

    this.lat.set(coord.lat);
    this.lon.set(coord.lon);
    this.precision.set(coord.precisionM);
    await this.persistir();
  }

  async agregarFoto(foto: FotoLocal): Promise<void> {
    await this.almacenFotos.guardar(foto);
    this.fotos.update((lista) => [...lista, foto]);
    await this.sync.refrescarContadores();
  }

  async quitarFoto(fotoId: string): Promise<void> {
    await this.almacenFotos.eliminar(fotoId);
    this.fotos.update((lista) => lista.filter((f) => f.id !== fotoId));
    await this.sync.refrescarContadores();
  }

  /** Vuelca el formulario al caso y lo escribe en IndexedDB. */
  private async persistir(): Promise<void> {
    const caso = this.caso();
    const form = this.form();
    if (!caso || !form) return;

    const actualizado = this.formService.aplicar(caso, form, this.leerSelecciones());
    actualizado.ubicacion.lat = this.lat();
    actualizado.ubicacion.lon = this.lon();
    actualizado.ubicacion.precisionM = this.precision();
    actualizado.ubicacion.gpsFuente =
      this.lat() === null ? FuenteCoordenada.NoDisponible : FuenteCoordenada.Sitio;
    actualizado.pasoCompletado = Math.max(caso.pasoCompletado, this.paso());

    // El perfil del voluntario se recuerda para el siguiente registro: en una jornada
    // de veinte casos, volver a escribir el propio nombre veinte veces es abandono.
    this.factory.guardarPerfil({
      nombre: actualizado.control.registradorNombre,
      organizacion: actualizado.control.registradorOrg,
      telefono: actualizado.control.registradorTel
    });

    await this.almacen.guardar(actualizado);
    this.caso.set(actualizado);
    this.guardadoEn.set(new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit'
    }));
  }

  private leerSelecciones(): SeleccionMultiple {
    return {
      afiliacion: this.seleccion.afiliacion(),
      requiereVivienda: this.seleccion.requiereVivienda(),
      serviciosAfectados: this.seleccion.serviciosAfectados(),
      cultivos: this.seleccion.cultivos(),
      infraProductiva: this.seleccion.infraProductiva(),
      requiereAgro: this.seleccion.requiereAgro(),
      requiereUrbano: this.seleccion.requiereUrbano(),
      convenioLinea: this.seleccion.convenioLinea(),
      necesidades: this.seleccion.necesidades()
    };
  }

  private restaurarSelecciones(caso: Caso): void {
    this.seleccion.afiliacion.set(caso.hogar.afiliacion);
    this.seleccion.requiereVivienda.set(caso.vivienda?.requiereVivienda ?? []);
    this.seleccion.serviciosAfectados.set(caso.vivienda?.serviciosAfectados ?? []);
    this.seleccion.cultivos.set(caso.anexoRural?.cultivos ?? []);
    this.seleccion.infraProductiva.set(caso.anexoRural?.infraProductiva ?? []);
    this.seleccion.requiereAgro.set(caso.anexoRural?.requiereAgro ?? []);
    this.seleccion.requiereUrbano.set(caso.anexoUrbano?.requiereUrbano ?? []);
    this.seleccion.convenioLinea.set(caso.anexoConvenio?.convenioLinea ?? []);
    this.seleccion.necesidades.set(caso.triaje?.necesidadesInmediatas ?? []);
  }

  private aZona(valor: string | null): Zona {
    return valor === Zona.Urbana ? Zona.Urbana : Zona.Rural;
  }
}
