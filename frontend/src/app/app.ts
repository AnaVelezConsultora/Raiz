import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AlmacenamientoService } from './core/services/almacenamiento.service';
import { SesionService } from './core/services/sesion.service';
import { SincronizacionService } from './core/services/sincronizacion.service';

/**
 * Cascaron de la aplicacion.
 *
 * La barra superior muestra permanentemente tres cosas que el voluntario necesita
 * ver sin buscarlas: quien esta usando el celular, si hay conexion y cuantos
 * elementos faltan por enviar.
 *
 * Que aparezca el nombre no es un adorno: un mismo celular puede rotar entre
 * voluntarios, y cada caso queda firmado con quien lo reporto.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header style="background:var(--accent);color:#fff;padding:.5rem 1rem">
      <div class="contenedor fila" style="justify-content:space-between;padding:0;gap:.5rem">
        <strong style="font-family:var(--serif);font-size:1.05rem">Raíz · Sevilla</strong>
        <span class="mono" style="font-size:.72rem;opacity:.92">
          {{ sync.enLinea() ? 'EN LINEA' : 'SIN CONEXION' }}
          @if (sync.totalPendientes() > 0) {
            · {{ sync.totalPendientes() }} POR ENVIAR
          }
        </span>
      </div>

      @if (sesion.autenticado()) {
        <div class="contenedor fila"
             style="justify-content:space-between;padding:0;gap:.5rem;margin-top:.2rem">
          <span style="font-size:.78rem;opacity:.9">
            {{ sesion.nombre() }} · {{ sesion.rol() }}
          </span>
          <button type="button" (click)="salir()"
                  style="background:transparent;border:1px solid rgba(255,255,255,.5);
                         color:#fff;min-height:30px;padding:.1rem .6rem;font-size:.75rem">
            Salir
          </button>
        </div>
      }
    </header>

    @if (sesion.tokenExpirado() && sync.enLinea()) {
      <div class="contenedor" style="padding:.6rem 1rem 0">
        <p class="aviso peligro" style="margin:0">
          Su sesión venció. Puede seguir registrando, pero para enviar los casos
          necesita volver a entrar.
        </p>
      </div>
    }

    <main>
      <router-outlet />
    </main>
  `
})
export class App implements OnInit {
  private readonly router = inject(Router);

  readonly sync = inject(SincronizacionService);
  readonly sesion = inject(SesionService);
  private readonly almacenamiento = inject(AlmacenamientoService);

  ngOnInit(): void {
    // Revalidar no bloquea el arranque: si no hay red, la sesion local se conserva.
    void this.sesion.revalidar();

    // Sin esto, el navegador puede desalojar los casos sin sincronizar cuando el
    // dispositivo se queda sin espacio, en silencio y sin pedir permiso.
    void this.almacenamiento.asegurarPersistencia();
    void this.almacenamiento.medirUso();
  }

  async salir(): Promise<void> {
    await this.sesion.cerrarSesion();
    void this.router.navigate(['/acceso']);
  }
}
