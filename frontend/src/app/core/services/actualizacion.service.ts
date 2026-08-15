import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * Traer al dispositivo la version nueva de la aplicacion.
 *
 * -----------------------------------------------------------------------------
 * POR QUE ESTO NO PODIA FALTAR
 * -----------------------------------------------------------------------------
 *
 * El service worker estaba registrado y nadie escuchaba sus avisos. La consecuencia
 * es la que se vio el 15 de agosto de 2026: se publico una correccion, el servidor
 * la servia, y el navegador seguia mostrando la version anterior — sin ningun error,
 * sin nada que mirar.
 *
 * En un escritorio eso se arregla cerrando la pestana. En campo no: el voluntario
 * deja la aplicacion abierta toda la jornada, y una correccion urgente —un
 * formulario que no guarda, un campo que valida mal— no le llegaria en todo el dia.
 * Poder corregir a distancia es la diferencia entre un error y una jornada perdida.
 *
 * -----------------------------------------------------------------------------
 * DOS SITUACIONES, DOS RESPUESTAS OPUESTAS
 * -----------------------------------------------------------------------------
 *
 * HAY VERSION NUEVA. Se avisa y NO se recarga solo. Recargar por sorpresa a alguien
 * que esta escribiendo el nombre de una familia, de pie y bajo el sol, es hostil
 * aunque el formulario guarde a cada paso. Se ofrece el boton y decide la persona.
 *
 * LA VERSION EN EL DISPOSITIVO SE ROMPIO. Aqui si se recarga sola, porque no hay
 * nada que preservar: la aplicacion ya no funciona. Pasa cuando el navegador
 * descarto parte de lo guardado, o cuando falta un archivo que la version en cache
 * necesita. Preguntar seria ofrecerle una decision a alguien que solo ve una
 * pantalla rota.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class ActualizacionService {
  private readonly sw = inject(SwUpdate);

  /** Hay una version nueva lista y esperando a que la persona acepte. */
  readonly hayVersionNueva = signal(false);

  /**
   * Empieza a escuchar. Se llama una vez, al arrancar.
   *
   * Si el service worker no esta habilitado —en desarrollo lo esta apagado a
   * proposito— esto no hace nada y no estorba.
   */
  vigilar(): void {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates.subscribe((evento) => {
      if (evento.type === 'VERSION_READY') {
        this.hayVersionNueva.set(true);
      }
    });

    // Estado irrecuperable: la version instalada necesita algo que ya no esta.
    // Recargar es lo unico que puede arreglarlo, y se hace sin preguntar.
    this.sw.unrecoverable.subscribe(() => {
      document.location.reload();
    });

    // Comprobar cada media hora. No es para gastar datos: la comprobacion es un
    // archivo de unos pocos kilobytes y solo ocurre con senal. Sin esto, una
    // aplicacion abierta toda la jornada no se enteraria nunca de una correccion.
    setInterval(() => void this.sw.checkForUpdate().catch(() => undefined), 30 * 60 * 1000);
  }

  /** Aplica la version nueva. La decide la persona, no la aplicacion. */
  async aplicar(): Promise<void> {
    if (!this.sw.isEnabled) return;
    await this.sw.activateUpdate();
    document.location.reload();
  }
}
