import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
              [heredado]="heredado()"
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
                border-top:1px solid var(--rule);padding:.7rem 0;
                padding-bottom:calc(.7rem + env(safe-area-inset-bottom))">
      @if (aviso()) {
        <p class="contenedor aviso peligro" style="margin:0 0 .6rem">{{ aviso() }}</p>
      }

      @if (ofreciendoSiguiente()) {
        <div class="contenedor pila-sm">
          <strong>Guardado. Esta casa alojaba mas de una familia.</strong>
          <span class="tenue">
            Se copia el lugar y el estado de la casa. Los datos de la familia se piden
            de nuevo.
          </span>
          <button type="button" class="btn-primario btn-ancho btn-grande"
                  (click)="siguienteFamilia()">Registrar la siguiente familia</button>
          <button type="button" class="btn-secundario btn-ancho"
                  (click)="terminar()">Terminar por ahora</button>
        </div>
      } @else if (preguntandoAlSalir()) {
        <div class="contenedor pila-sm">
          <strong>Que hacemos con este registro?</strong>
          <span class="tenue">
            Guardarlo lo deja en el celular y se enviara cuando haya senal.
            Descartarlo lo borra de una vez.
          </span>
          <div class="fila" style="flex-wrap:nowrap">
            <button type="button" class="btn-peligro" style="flex:1"
                    (click)="descartar()">Descartar</button>
            <button type="button" class="btn-primario" style="flex:2"
                    (click)="guardarYSalir()">Guardar</button>
          </div>
          <button type="button" class="btn-secundario btn-ancho"
                  (click)="preguntandoAlSalir.set(false)">Seguir llenando</button>
        </div>
      } @else {
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
      }
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
  private readonly destruccion = inject(DestroyRef);

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

  /**
   * True cuando el caso ya existe en el dispositivo.
   *
   * Un caso recien creado vive solo en memoria hasta que haya algo que valga la pena
   * conservar. Ver {@link salir}.
   */
  private readonly yaEstaGuardado = signal(false);

  /** True mientras se le pregunta al voluntario si guarda o descarta. */
  readonly preguntandoAlSalir = signal(false);

  /** Mensaje para el voluntario cuando una accion no pudo hacer lo que prometia. */
  readonly aviso = signal<string>('');

  /** True si este caso nacio de otro de la misma casa. Lo avisa el paso 3. */
  readonly heredado = signal(false);

  /** Se ofrece registrar la siguiente familia cuando la casa alojaba mas de una. */
  readonly ofreciendoSiguiente = signal(false);

  /**
   * Se reacciona a los parametros, no se leen una sola vez.
   *
   * Registrar la siguiente familia de la misma casa navega de /nuevo a /nuevo?desde=X.
   * Angular reutiliza el componente cuando solo cambian los parametros, asi que con
   * `snapshot` el voluntario se quedaria mirando el caso que acaba de guardar.
   */
  ngOnInit(): void {
    this.ruta.queryParamMap
      .pipe(takeUntilDestroyed(this.destruccion))
      .subscribe(() => void this.inicializar());
  }

  private async inicializar(): Promise<void> {
    const id = this.ruta.snapshot.paramMap.get('id');
    const zonaParam = this.ruta.snapshot.queryParamMap.get('zona');
    // `desde` trae el caso de otra familia de la misma casa: se hereda el lugar y el
    // estado del inmueble, nunca nada del hogar. Ver crearEnMismaEstructura.
    const desde = this.ruta.snapshot.queryParamMap.get('desde');

    this.paso.set(1);
    this.aviso.set('');
    this.ofreciendoSiguiente.set(false);
    this.preguntandoAlSalir.set(false);

    const existente = id ? await this.almacen.obtener(id) : undefined;
    const base = desde ? await this.almacen.obtener(desde) : undefined;

    const caso =
      existente ??
      (base ? this.factory.crearEnMismaEstructura(base) : this.factory.crear(this.aZona(zonaParam)));

    this.yaEstaGuardado.set(existente !== undefined);
    this.heredado.set(existente === undefined && base !== undefined);

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

  /**
   * Salir del formulario.
   *
   * Si hay algo escrito, la decision es del voluntario y no de una heuristica mia:
   * guardar o descartar. Antes se guardaba en silencio, y despues no habia forma de
   * quitar un registro equivocado.
   *
   * Si no hay nada, no se pregunta: interrumpir a alguien para decirle que no escribio
   * nada es hacerle perder el tiempo dos veces.
   */
  async salir(): Promise<void> {
    if (this.yaEstaGuardado() || this.tieneAlgoDelHogar()) {
      this.preguntandoAlSalir.set(true);
      return;
    }
    void this.router.navigate(['/casos']);
  }

  async guardarYSalir(): Promise<void> {
    this.preguntandoAlSalir.set(false);
    await this.persistir();
    this.recordarPerfil();
    await this.sync.refrescarContadores();
    void this.router.navigate(['/casos']);
  }

  /** True si la casa alojaba mas de una familia y vale la pena ofrecer la siguiente. */
  private faltanFamilias(): boolean {
    return Number(this.form()?.get('vivienda.hogaresEnEstructura')?.value ?? 1) > 1;
  }

  /**
   * Abre un caso nuevo para otra familia de la misma casa.
   *
   * Se navega a la misma ruta con `desde`, de modo que la creacion siga estando en un
   * solo lugar (la fabrica) y no haya dos formas de nacer un caso.
   */
  siguienteFamilia(): void {
    const caso = this.caso();
    this.ofreciendoSiguiente.set(false);
    if (!caso) return;

    void this.router.navigate(['/nuevo'], {
      queryParams: { desde: caso.id },
      // Sin esto Angular reutiliza el componente y no vuelve a correr ngOnInit, asi
      // que el voluntario se quedaria mirando el caso que acaba de guardar.
      onSameUrlNavigation: 'reload'
    });
  }

  terminar(): void {
    this.ofreciendoSiguiente.set(false);
    void this.router.navigate(['/casos']);
  }

  /**
   * Recuerda el nombre y la organizacion del voluntario para el siguiente registro.
   *
   * En una jornada de veinte familias, volver a escribir el propio nombre veinte veces
   * es abandono.
   *
   * SOLO se llama cuando el voluntario DECIDE conservar el caso, nunca en el guardado
   * automatico. Antes se llamaba en cada guardado, y por eso lo que alguien escribia y
   * despues descartaba seguia apareciendo rellenado en el caso siguiente: la
   * aplicacion habia aprendido de un registro que su autor tiro a la basura.
   */
  private recordarPerfil(): void {
    const caso = this.caso();
    if (!caso || !caso.control.registradorNombre.trim()) return;

    this.factory.guardarPerfil({
      nombre: caso.control.registradorNombre,
      organizacion: caso.control.registradorOrg,
      telefono: caso.control.registradorTel
    });
  }

  /**
   * Descarta el registro y sale.
   *
   * Borra tambien lo que ya se hubiera escrito en el dispositivo en pasadas
   * anteriores: descartar tiene que dejar el celular como si el caso nunca se hubiera
   * abierto, o no es descartar.
   */
  async descartar(): Promise<void> {
    this.preguntandoAlSalir.set(false);

    const caso = this.caso();
    if (caso && this.yaEstaGuardado()) {
      await this.almacen.eliminar(caso.id);
      await this.sync.refrescarContadores();
    }

    void this.router.navigate(['/casos']);
  }

  /**
   * Si el voluntario alcanzo a registrar algo de ESTA familia.
   *
   * Deliberadamente no mira el nombre del registrador, la organizacion, el municipio,
   * el departamento ni la zona: todos vienen rellenados de antemano —del perfil
   * recordado o del boton que se toco— y darlos por dato del hogar convertiria de
   * nuevo cualquier caso abandonado en un registro fantasma.
   */
  private tieneAlgoDelHogar(): boolean {
    if (this.lat() !== null || this.fotos().length > 0) return true;

    const form = this.form();
    if (!form) return false;

    const conTexto = (ruta: string): boolean =>
      String(form.get(ruta)?.value ?? '').trim() !== '';

    return (
      conTexto('hogar.tel1') ||
      conTexto('hogar.jefeNombres') ||
      conTexto('hogar.jefeApellidos') ||
      conTexto('hogar.numDoc') ||
      conTexto('ubicacion.vereda') ||
      conTexto('ubicacion.barrio') ||
      conTexto('ubicacion.corregimiento') ||
      conTexto('ubicacion.direccionRef') ||
      Number(form.get('hogar.personasTotal')?.value ?? 0) > 0
    );
  }

  async finalizar(): Promise<void> {
    // Sin esto, tocar "Guardar caso" con el formulario en blanco no guardaba nada y
    // tampoco decia nada: el voluntario volvia a la lista creyendo que registro algo.
    // Un fallo silencioso en campo se descubre semanas despues, cuando falta la familia.
    if (!this.yaEstaGuardado() && !this.tieneAlgoDelHogar()) {
      this.aviso.set(
        'Todavia no hay nada que guardar. Escriba al menos el celular o la vereda, o tome la coordenada.'
      );
      return;
    }
    this.aviso.set('');

    await this.persistir();
    this.recordarPerfil();

    // Antes de mandarlo a la lista: si la casa alojaba mas de una familia, este es el
    // momento de registrar la siguiente. El voluntario todavia esta parado frente a
    // la casa; en la lista ya no lo esta.
    if (this.faltanFamilias()) {
      await this.sync.refrescarContadores();
      this.ofreciendoSiguiente.set(true);
      return;
    }
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

  /**
   * Vuelca el formulario al caso y lo escribe en IndexedDB.
   *
   * NO escribe un caso nuevo que todavia no tiene nada del hogar. Antes escribia
   * siempre, y por eso tocar "Nuevo caso" y arrepentirse —o tocar Continuar sin
   * llenar nada— dejaba un registro fantasma en la lista: "Sin identificar · Sin
   * ubicar · 0 personas · sin coordenada".
   *
   * No es cosmetico. Esos registros se cuentan como pendientes de envio, estorban en
   * la lista donde el voluntario busca el caso que si quiere completar, y el dia que
   * exista servidor viajan y ensucian el total consolidado, que es toda la palanca de
   * negociacion que tiene la comunidad.
   *
   * Un caso que ya existe se guarda siempre, aunque quede vacio: puede que el
   * voluntario haya entrado justamente a corregir o borrar un dato equivocado.
   */
  private async persistir(): Promise<void> {
    const caso = this.caso();
    const form = this.form();
    if (!caso || !form) return;
    if (!this.yaEstaGuardado() && !this.tieneAlgoDelHogar()) return;

    const actualizado = this.formService.aplicar(caso, form, this.leerSelecciones());
    actualizado.ubicacion.lat = this.lat();
    actualizado.ubicacion.lon = this.lon();
    actualizado.ubicacion.precisionM = this.precision();
    actualizado.ubicacion.gpsFuente =
      this.lat() === null ? FuenteCoordenada.NoDisponible : FuenteCoordenada.Sitio;
    actualizado.pasoCompletado = Math.max(caso.pasoCompletado, this.paso());

    await this.almacen.guardar(actualizado);
    this.yaEstaGuardado.set(true);
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
