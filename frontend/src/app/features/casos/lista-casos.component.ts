import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResumenCaso } from '../../core/domain/caso.model';
import { EstadoSync, Prioridad, Zona } from '../../core/domain/enums';
import { CASO_STORAGE } from '../../core/domain/ports';
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

      @if (sync.totalPendientes() > 0 && sync.enLinea()) {
        <div class="tarjeta pila-sm">
          <strong>{{ sync.totalPendientes() }} elemento(s) pendiente(s)</strong>
          <span class="tenue">
            {{ sync.casosPendientes() }} caso(s) y {{ sync.fotosPendientes() }} foto(s)
          </span>
          <button type="button" class="btn-primario btn-ancho btn-grande"
                  [disabled]="sync.estado() === 'en_curso'"
                  (click)="sincronizar()">
            {{ sync.estado() === 'en_curso' ? 'Enviando...' : 'Sincronizar ahora' }}
          </button>
          <span class="pista">
            Se envian primero los casos P0. Consume datos moviles.
          </span>
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
            <a [routerLink]="['/caso', c.id]" class="pastilla" style="align-self:flex-start">
              Abrir y completar
            </a>
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

  readonly casos = signal<ResumenCaso[]>([]);
  readonly mensaje = signal<string>('');
  readonly zonaRural = Zona.Rural;
  readonly zonaUrbana = Zona.Urbana;
  readonly prioridades = Prioridad;

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
