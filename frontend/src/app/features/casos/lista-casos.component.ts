import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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

      <ul class="pila-sm" style="list-style:none;padding:0;margin:0">
        @for (c of casos(); track c.id) {
          <li class="tarjeta pila-sm">
            <div class="fila" style="justify-content:space-between">
              <span class="mono">{{ c.codigo }}</span>
              <span>
                @if (c.prioridad) {
                  <span class="chip" [class]="'chip ' + c.prioridad">
                    {{ c.prioridad.toUpperCase() }}
                  </span>
                }
                <span class="chip" [class]="'chip ' + claseSync(c.estadoSync)">
                  {{ textoSync(c.estadoSync) }}
                </span>
              </span>
            </div>
            <strong>{{ c.responsable }}</strong>
            <span class="tenue">
              {{ c.lugar }} · {{ c.zona === zonaRural ? 'Rural' : 'Urbana' }} ·
              {{ c.personasTotal }} persona(s)
              @if (!c.tieneCoordenada) { · sin coordenada }
              @if (c.nFotos > 0) { · {{ c.nFotos }} foto(s) }
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

    <nav style="position:fixed;left:0;right:0;bottom:0;background:var(--surface);
                border-top:1px solid var(--rule);padding:.7rem 1rem">
      <div class="contenedor fila" style="gap:.6rem;flex-wrap:nowrap">
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

  readonly casos = signal<ResumenCaso[]>([]);
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
  }

  async sincronizar(): Promise<void> {
    this.mensaje.set('');
    const r = await this.sync.sincronizar();
    await this.recargar();

    if (r.casosEnviados === 0 && r.fotosEnviadas === 0) return;
    this.mensaje.set(
      `Enviados ${r.casosEnviados} caso(s) y ${r.fotosEnviadas} foto(s).` +
        (r.interrumpida ? ' El envio quedo incompleto: vuelva a intentar con mejor senal.' : '')
    );
  }

  claseSync(estado: EstadoSync): string {
    if (estado === EstadoSync.Sincronizado) return 'sincronizado';
    if (estado === EstadoSync.Error) return 'error';
    return 'pendiente';
  }

  textoSync(estado: EstadoSync): string {
    switch (estado) {
      case EstadoSync.Sincronizado:
        return 'ENVIADO';
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