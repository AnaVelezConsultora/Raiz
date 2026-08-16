import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { VERSION } from '../environments/version';
import { Rol } from './core/domain/enums';
import { ActualizacionService } from './core/services/actualizacion.service';
import { AlmacenamientoService } from './core/services/almacenamiento.service';
import { MunicipioService } from './core/services/municipio.service';
import { SesionService } from './core/services/sesion.service';
import { SincronizacionService } from './core/services/sincronizacion.service';

/**
 * Cascaron de la aplicacion.
 *
 * La barra superior muestra permanentemente cuatro cosas que el voluntario necesita
 * ver sin buscarlas: donde esta, quien esta usando el celular, si hay conexion y
 * cuantos elementos faltan por enviar.
 *
 * Que aparezca el nombre no es un adorno: un mismo celular puede rotar entre
 * voluntarios, y cada caso queda firmado con quien lo reporto.
 *
 * El municipio decia "Sevilla", escrito a mano. Ahora lo resuelve el GPS contra una
 * tabla que viaja en la aplicacion, y dice "Colombia" cuando no logra ubicar. Es
 * orientacion, NO el dato del caso: el municipio que se guarda lo escribe el
 * voluntario en el formulario. Ver core/domain/municipios.ts.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header style="background:var(--accent);color:#fff;padding:.5rem 1rem">
      <div class="contenedor fila" style="justify-content:space-between;padding:0;gap:.5rem">
        <!-- Solo el nombre, en la serif del sello. Se intento reducir el arbol del logo
             a un trazo de 26 px y a ese tamano dejaba de leerse como arbol: lo que
             funciona impreso no siempre funciona en la barra de un celular. El sello
             completo va en la pantalla de entrada, que es donde hay espacio. -->
        <strong style="font-family:var(--serif);font-size:1.05rem">Raíz · {{ municipio.nombre() }}</strong>
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
          @if (puedeAdministrar()) {
            <a routerLink="/voluntarios"
               style="color:#fff;font-size:.75rem;text-decoration:underline;
                      text-underline-offset:.2rem">Voluntarios</a>
          }
          <button type="button" (click)="salir()"
                  style="background:transparent;border:1px solid rgba(255,255,255,.5);
                         color:#fff;min-height:30px;padding:.1rem .6rem;font-size:.75rem">
            Salir
          </button>
        </div>
      }
    </header>

    @if (actualizacion.hayVersionNueva()) {
      <div class="contenedor" style="padding:.6rem 1rem 0">
        <p class="aviso fila" style="margin:0;justify-content:space-between;gap:.5rem">
          <span>Hay una versión nueva de la aplicación.</span>
          <button type="button" (click)="actualizar()"
                  style="min-height:32px;padding:.1rem .7rem;font-size:.8rem">
            Actualizar
          </button>
        </p>
      </div>
    }

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

    <!--
      El numero de version, discreto y siempre visible.

      No es adorno: cuando alguien reporta desde la vereda que "no guarda", lo
      primero que hay que saber es que version tiene en la mano. Un service worker
      puede tener a dos voluntarios en versiones distintas el mismo dia, y sin este
      numero eso se descubre despues de una hora de preguntas.
    -->
    <footer class="contenedor" style="padding:1.5rem 1rem 2rem">
      <p class="mono tenue" style="margin:0;font-size:.68rem">
        Raíz v{{ version }}
      </p>
    </footer>
  `
})
export class App implements OnInit {
  /** Se estampa desde frontend/package.json. Ver tools/estampar-version.mjs. */
  readonly version = VERSION;

  private readonly router = inject(Router);

  readonly sync = inject(SincronizacionService);
  readonly sesion = inject(SesionService);
  readonly municipio = inject(MunicipioService);
  readonly actualizacion = inject(ActualizacionService);
  private readonly almacenamiento = inject(AlmacenamientoService);

  ngOnInit(): void {
    // Revalidar no bloquea el arranque: si no hay red, la sesion local se conserva.
    void this.sesion.revalidar();

    // Sin esto, el navegador puede desalojar los casos sin sincronizar cuando el
    // dispositivo se queda sin espacio, en silencio y sin pedir permiso.
    void this.almacenamiento.asegurarPersistencia();
    void this.almacenamiento.medirUso();

    // Ubicar es lo ultimo y no bloquea nada: si el permiso esta denegado o el
    // receptor no fija satelites, la cabecera se queda en "Colombia" y la
    // aplicacion funciona igual.
    void this.municipio.resolver();

    // Sin esto, una correccion publicada hoy no llega al celular que quedo abierto
    // en la vereda. Ver actualizacion.service.ts.
    this.actualizacion.vigilar();
  }

  /**
   * Muestra el enlace de administracion solo a quien puede usarlo.
   *
   * Es comodidad, no proteccion: quien llegue a esa ruta sin permiso recibira un no
   * del servidor, que es donde de verdad se decide.
   */
  readonly puedeAdministrar = computed(() => {
    const rol = this.sesion.rol();
    return rol === Rol.Custodio || rol === Rol.Coordinador;
  });

  /** Aplica la version nueva. Lo decide la persona, no la aplicacion. */
  async actualizar(): Promise<void> {
    await this.actualizacion.aplicar();
  }

  async salir(): Promise<void> {
    await this.sesion.cerrarSesion();
    void this.router.navigate(['/acceso']);
  }
}
