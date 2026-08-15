import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ResumenCaso } from '../../core/domain/caso.model';
import { EstadoSync, Prioridad, Zona } from '../../core/domain/enums';
import { CASO_STORAGE } from '../../core/domain/ports';
import { AlmacenamientoService } from '../../core/services/almacenamiento.service';
import { RedService } from '../../core/services/red.service';
import { SincronizacionService } from '../../core/services/sincronizacion.service';

/**
 * Listado de casos del dispositivo y control de sincronizacion.
 *
 * Es la pantalla que el voluntario mira cuando llega a donde hay senal. Debe
 * responder tres preguntas sin scroll: cuantos casos tengo, cuantos faltan por
 * enviar, y que boton toco.
 *
 * @version 0.1.0
 */
@Component({
  selector: 'app-lista-casos',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contenedor pila" style="padding:1rem 1rem 8rem">
      <header class="pila-sm">
        <h1>Casos en este celular</h1>
        <p class="tenue">
          {{ casos().length }} registrado(s) · {{ sync.totalPendientes() }} sin enviar
        </p>
      </header>

      @if (!sync.enLinea()) {
        <p class="aviso">
          Sin conexion. Puede seguir registrando: todo queda guardado en el celular y
          se envia cuando haya senal.
        </p>
      }

      @if (almacenamiento.enRiesgoDeDesalojo() && sync.totalPendientes() > 0) {
        <p class="aviso peligro">
          El celular no garantiza conservar los casos sin enviar si se queda sin
          espacio. Libere espacio y envie las fotografias apenas tenga senal.
        </p>
      }


      @if (sync.estado() === 'en_curso') {
        <p class="aviso">Enviando los casos...</p>
      }

      <!-- Con ahorro de datos no sale nada solo, ni siquiera los casos: quien lo
           activo esta cuidando su plan y esa peticion pesa mas que nuestros 3 KB. -->
      @if (red.ahorroDeDatos() && sync.totalPendientes() > 0 && sync.enLinea()) {
        <div class="tarjeta pila-sm">
          <strong>{{ sync.totalPendientes() }} elemento(s) sin enviar</strong>
          <span class="tenue">
            Tiene el ahorro de datos activo, asi que no se envia nada sin que usted lo
            pida.
          </span>
          <button type="button" class="btn-primario btn-ancho btn-grande"
                  [disabled]="sync.estado() === 'en_curso'"
                  (click)="sincronizar()">
            {{ sync.estado() === 'en_curso' ? 'Enviando...' : 'Enviar de todos modos' }}
          </button>
        </div>
      }

      <!-- Los casos salen solos al haber senal. Aqui solo se pide decision para las
           fotografias, que son lo unico que pesa en el plan de datos del voluntario. -->
      @if (!red.ahorroDeDatos() && sync.fotosPendientes() > 0 && sync.enLinea()) {
        <div class="tarjeta pila-sm">
          <strong>
            {{ sync.fotosPendientes() }} fotografia(s) por enviar
            @if (sync.pesoFotosPendientes()) { · {{ sync.pesoFotosPendientes() }} }
          </strong>

          <!-- Una fotografia que agoto sus reintentos ya no la envia nadie, y hasta
               ahora se seguia contando como pendiente: el contador decia dos y solo
               se intentaba una. -->
          @if (sync.fotosDetenidas() > 0) {
            <span class="error">
              {{ sync.fotosDetenidas() }} de ellas se detuvieron tras varios intentos
              fallidos. Al tocar enviar se vuelven a intentar.
            </span>
          }

          @if (sync.buenMomentoParaFotos()) {
            <span class="tenue">
              Buen momento: {{ red.descripcion() }}. Los casos ya se enviaron solos.
            </span>
          } @else {
            <span class="tenue">
              Los casos ya se enviaron solos. Las fotos esperan porque pesan.
            </span>
          }

          <button type="button" class="btn-primario btn-ancho btn-grande"
                  [disabled]="sync.estado() === 'en_curso'"
                  (click)="sincronizar()">
            {{ sync.estado() === 'en_curso' ? 'Enviando...' : 'Enviar las fotografias' }}
          </button>

          <!-- El avance, mientras sube. Sin esto, en una red que falla rapido el
               boton parpadea «Enviando...» y vuelve, y el voluntario no tiene como
               saber si paso algo. Con esto ve que bloque va y cuanto lleva. -->
          @if (sync.estado() === 'en_curso' && sync.avanceFotoTexto()) {
            <div class="pila-sm">
              <span class="tenue">Enviando · {{ sync.avanceFotoTexto() }}</span>
              <div style="height:6px;background:var(--rule);border-radius:999px;overflow:hidden">
                <div [style.width.%]="sync.avanceFotoPorcentaje()"
                     style="height:100%;background:var(--accent);transition:width .2s"></div>
              </div>
            </div>
          }

          @if (!sync.buenMomentoParaFotos()) {
            <span class="pista">
              {{ red.tipo() === 'movil'
                  ? 'Va a gastar de sus datos moviles. Si puede, espere al wifi.'
                  : 'Si esta en datos moviles, esto le gasta del plan.' }}
            </span>
          }
        </div>
      }

      @if (mensaje()) {
        <p class="aviso exito">{{ mensaje() }}</p>
      }
      @if (sync.ultimoError()) {
        <p class="aviso peligro">{{ sync.ultimoError() }}</p>
      }

      @if (casos().length === 0) {
        <p class="aviso">
          Todavia no hay casos en este celular. Toque Nuevo caso para registrar la
          primera familia.
        </p>
      }

      <!-- Un caso ENTREGADO —texto y fotografias en el servidor— sale del feed.
           No se borra: el borrado tiene su propio plazo y su propia regla. Lo que
           cambia es que la pantalla deje de pedir atencion sobre algo que ya no la
           necesita, y que lo que queda arriba sea, sin excepcion, lo que todavia
           depende de que alguien haga algo. -->
      @if (entregados().length > 0) {
        <button type="button" class="btn-secundario btn-ancho"
                (click)="verEntregados.set(!verEntregados())">
          {{ verEntregados()
              ? 'Ocultar los ' + entregados().length + ' ya entregados'
              : entregados().length + ' caso(s) ya entregados · ver' }}
        </button>
      }

      <ul class="pila-sm" style="list-style:none;padding:0;margin:0">
        @for (c of visibles(); track c.id) {
          <li class="tarjeta pila-sm">
            <div class="fila" style="justify-content:space-between">
              <span class="mono">{{ c.codigo }}</span>
              <span>
                @if (c.prioridad) {
                  <span class="chip" [class]="'chip ' + c.prioridad">
                    {{ c.prioridad.toUpperCase() }}
                  </span>
                }
                <span class="chip" [class]="'chip ' + claseSync(c)">
                  {{ textoSync(c) }}
                </span>
              </span>
            </div>
            <strong>{{ c.responsable }}</strong>
            <span class="tenue">
              {{ c.lugar }} · {{ c.zona === zonaRural ? 'Rural' : 'Urbana' }} ·
              {{ c.personasTotal }} persona(s)
              @if (!c.tieneCoordenada) { · sin coordenada }
              @if (c.nFotos > 0) {
                · {{ c.nFotos }} foto(s)
                @if (c.fotosPendientes > 0) {
                  <span class="error"> · {{ c.fotosPendientes }} sin enviar</span>
                }
              }
            </span>
            @if (porBorrar() === c.id) {
              <!-- Confirmacion en la misma tarjeta, no en un dialogo del navegador:
                   un dialogo tapa la pantalla y no deja ver CUAL caso se va a borrar. -->
              <div class="pila-sm">
                <span class="error">Se borrara del celular y no se podra recuperar.</span>
                <div class="fila">
                  <button type="button" class="btn-peligro" (click)="borrar(c.id)">
                    Si, borrar
                  </button>
                  <button type="button" class="btn-secundario" (click)="porBorrar.set(null)">
                    Conservarlo
                  </button>
                </div>
              </div>
            } @else {
              <div class="fila">
                <a [routerLink]="['/caso', c.id]" class="pastilla">Abrir y completar</a>
                <!-- Solo lo que no ha viajado. Un caso ya sincronizado existe en el
                     servidor y borrarlo aqui no lo borra alla. -->
                @if (c.estadoSync !== estadoSincronizado) {
                  <button type="button" class="pastilla" style="color:var(--p0)"
                          [attr.aria-label]="'Borrar el caso ' + c.codigo"
                          (click)="porBorrar.set(c.id)">
                    Borrar
                  </button>
                }
              </div>
            }
          </li>
        }
      </ul>
    </div>

    <!-- El padding va SOLO en el contenedor interno. Tenerlo aqui y ahi sumaba 64 px
         en un celular de 440, y con los dos botones sin poder encogerse la barra se
         salia de la pantalla. -->
    <nav style="position:fixed;left:0;right:0;bottom:0;background:var(--surface);
                border-top:1px solid var(--rule);padding:.7rem 0;
                padding-bottom:calc(.7rem + env(safe-area-inset-bottom))">
      <div class="contenedor fila" style="gap:.6rem">
        <a routerLink="/nuevo" [queryParams]="{ zona: zonaRural }"
           class="btn-primario btn-grande"
           style="flex:1;text-align:center;text-decoration:none;display:flex;
                  align-items:center;justify-content:center;border-radius:4px">
          Nuevo caso rural
        </a>
        <a routerLink="/nuevo" [queryParams]="{ zona: zonaUrbana }"
           class="btn-secundario btn-grande"
           style="flex:1;text-align:center;text-decoration:none;display:flex;
                  align-items:center;justify-content:center;border-radius:4px;
                  border:1.5px solid var(--rule)">
          Nuevo caso urbano
        </a>
      </div>
    </nav>
  `
})
export class ListaCasosComponent implements OnInit {
  private readonly almacen = inject(CASO_STORAGE);
  readonly sync = inject(SincronizacionService);
  readonly almacenamiento = inject(AlmacenamientoService);
  readonly red = inject(RedService);
  private readonly rutaActual = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly casos = signal<ResumenCaso[]>([]);
  /** Si se despliegan los casos que ya estan completos en el servidor. */
  readonly verEntregados = signal(false);

  /**
   * ENTREGADO es el caso completo: su texto llego y ninguna fotografia le falta.
   *
   * Con el texto arriba y las fotos pendientes NO cuenta, y esa es la definicion que
   * importa: la imagen del dano es parte del registro, no un adjunto.
   */
  private readonly estaEntregado = (c: ResumenCaso): boolean =>
    c.estadoSync === EstadoSync.Sincronizado && c.fotosPendientes === 0;

  readonly pendientes = computed(() => this.casos().filter((c) => !this.estaEntregado(c)));
  readonly entregados = computed(() => this.casos().filter((c) => this.estaEntregado(c)));
  readonly visibles = computed(() =>
    this.verEntregados() ? this.casos() : this.pendientes()
  );
  readonly mensaje = signal<string>('');
  /** Caso con la confirmacion de borrado abierta. Null si no hay ninguna. */
  readonly porBorrar = signal<string | null>(null);
  readonly zonaRural = Zona.Rural;
  readonly zonaUrbana = Zona.Urbana;
  readonly prioridades = Prioridad;
  readonly estadoSincronizado = EstadoSync.Sincronizado;

  /** Borra el caso y sus fotos del dispositivo. Ya paso por confirmacion. */
  async borrar(casoId: string): Promise<void> {
    await this.almacen.eliminar(casoId);
    this.porBorrar.set(null);
    await this.recargar();
    await this.sync.refrescarContadores();
    this.mensaje.set('Caso borrado de este celular.');
  }

  async ngOnInit(): Promise<void> {
    await this.recargar();
    await this.sync.refrescarContadores();
    this.confirmarGuardado();
  }

  /**
   * Dice, al llegar del formulario, que el caso quedo guardado.
   *
   * Sin esto la aplicacion volvia a la lista en silencio y quien acababa de guardar
   * no tenia como saber si su registro entro: lo abria otra vez y lo guardaba de
   * nuevo por si acaso. Nunca se duplico nada —el caso conserva su identificador—
   * pero la duda cuesta minutos frente a una familia que espera, y en campo eso es
   * lo caro.
   *
   * Se nombra ademas lo que TODAVIA falta. Un caso con fotografias pendientes no
   * esta entregado, y el boton que las manda es una decision del voluntario porque
   * gastan su plan de datos: si nadie se lo dice, no lo toca.
   */
  private confirmarGuardado(): void {
    const codigo = this.rutaActual.snapshot.queryParamMap.get('guardado');
    if (!codigo) return;

    const caso = this.casos().find((c) => c.codigo === codigo);
    const pendientes = caso?.fotosPendientes ?? 0;

    this.mensaje.set(
      `Caso ${codigo} guardado en este celular.` +
        (pendientes > 0
          ? ` Sus ${pendientes} fotografia(s) esperan a que toque «Enviar las fotografias».`
          : ' Se envia solo cuando haya senal.')
    );

    // Se limpia la direccion para que el mensaje no reaparezca al recargar la
    // pantalla horas despues, cuando ya no significa nada.
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  async sincronizar(): Promise<void> {
    this.mensaje.set('');
    const r = await this.sync.sincronizar();
    await this.recargar();

    if (r.casosEnviados === 0 && r.fotosEnviadas === 0) return;

    // Se dice que TERMINO y que ya no depende del celular. Antes el mensaje contaba
    // cuantos elementos salieron, que es cierto y no es lo que la persona pregunta:
    // lo que quiere saber es si puede dejar de preocuparse.
    const partes: string[] = [];
    if (r.casosEnviados > 0) partes.push(`${r.casosEnviados} caso(s)`);
    if (r.fotosEnviadas > 0) partes.push(`${r.fotosEnviadas} fotografia(s)`);

    this.mensaje.set(
      r.interrumpida
        ? `Se enviaron ${partes.join(' y ')}, pero el envio quedo incompleto. ` +
            'Vuelva a intentar con mejor senal: lo que ya viajo no se repite.'
        : `Listo: ${partes.join(' y ')} ya estan en el servidor. ` +
            (this.sync.totalPendientes() === 0
              ? 'No queda nada por enviar en este celular.'
              : `Faltan ${this.sync.totalPendientes()} elemento(s).`)
    );
  }

  /**
   * El estado se mira sobre el CASO COMPLETO, fotografias incluidas.
   *
   * Un caso cuyo texto viajo pero cuyas fotos siguen en el celular NO esta enviado. La
   * imagen del dano es parte del registro —es la prueba con la que se sustenta la
   * peticion ante la entidad—, y pintarlo en verde le diria al voluntario que puede
   * dejar de preocuparse por algo que todavia depende de que vuelva a haber senal.
   */
  claseSync(caso: ResumenCaso): string {
    if (caso.estadoSync === EstadoSync.Sincronizado) {
      return caso.fotosPendientes > 0 ? 'pendiente' : 'sincronizado';
    }
    if (caso.estadoSync === EstadoSync.Error) return 'error';
    return 'pendiente';
  }

  textoSync(caso: ResumenCaso): string {
    switch (caso.estadoSync) {
      case EstadoSync.Sincronizado:
        return caso.fotosPendientes > 0 ? 'FALTAN FOTOS' : 'ENVIADO';
      case EstadoSync.Error:
        return 'FALLO';
      case EstadoSync.EnProceso:
        return 'ENVIANDO';
      default:
        return 'SIN ENVIAR';
    }
  }

  private async recargar(): Promise<void> {
    this.casos.set(await this.almacen.listar());
  }
}