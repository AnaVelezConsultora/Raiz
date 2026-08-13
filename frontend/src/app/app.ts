import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SincronizacionService } from './core/services/sincronizacion.service';

/**
 * Cascaron de la aplicacion.
 *
 * La barra superior muestra permanentemente el estado de conexion y cuantos
 * elementos faltan por enviar. Es el dato que el voluntario necesita ver sin
 * buscarlo.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header style="background:var(--accent);color:#fff;padding:.55rem 1rem">
      <div class="contenedor fila" style="justify-content:space-between;padding:0">
        <strong style="font-family:var(--serif);font-size:1.05rem">Raíz · Sevilla</strong>
        <span class="mono" style="font-size:.75rem;opacity:.92">
          {{ sync.enLinea() ? 'EN LINEA' : 'SIN CONEXION' }}
          @if (sync.totalPendientes() > 0) {
            · {{ sync.totalPendientes() }} POR ENVIAR
          }
        </span>
      </div>
    </header>

    <main>
      <router-outlet />
    </main>
  `
})
export class App {
  readonly sync = inject(SincronizacionService);
}
