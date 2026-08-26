import { Injectable, computed, signal } from '@angular/core';

/**
 * Que clase de conexion tiene el celular ahora mismo.
 *
 * `desconocida` NO es un error: es el caso de iOS y de Firefox, que no exponen esta
 * informacion. Es una respuesta legitima y frecuente, y hay que tratarla como tal.
 */
export type TipoRed = 'wifi' | 'movil' | 'desconocida';

/** Lo que el navegador expone de la conexion. No existe en todos. */
interface InfoRed {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (evento: string, oyente: () => void) => void;
  removeEventListener?: (evento: string, oyente: () => void) => void;
}

/**
 * Que tipo de red hay, para informar el costo probable del envio.
 *
 * POR QUE ESTO IMPORTA EN ESTE PROYECTO
 *
 * El voluntario pone su propio celular y su propio plan de datos. Nadie le paga los
 * megas. Veinte fotografias son unos 4 MB y eso se le puede notar en la factura. La
 * aplicacion informa la red y el peso antes de enviarlas; la unica valvula que detiene
 * el envio automatico es el ahorro de datos solicitado por la propia persona.
 *
 * LO QUE ESTA API NO GARANTIZA
 *
 * `navigator.connection` solo existe en navegadores basados en Chromium. En iOS y en
 * Firefox no hay nada, y el tipo queda en `desconocida`. Tampoco distingue un wifi
 * domestico con tope de uno libre. Ninguna de esas incertidumbres bloquea la evidencia:
 * la red se describe sin inventar certeza y las fotografias salen igual.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class RedService {
  private readonly _tipo = signal<TipoRed>('desconocida');
  private readonly _ahorroDeDatos = signal(false);

  readonly tipo = this._tipo.asReadonly();

  /**
   * El usuario pidio ahorrar datos en los ajustes del navegador o del sistema.
   *
   * Es una peticion explicita de alguien que esta cuidando su plan, y se respeta
   * incluso para los casos: con esto activo no sale nada sin que lo pida.
   */
  readonly ahorroDeDatos = this._ahorroDeDatos.asReadonly();

  /** True cuando casos y fotografias pueden salir automaticamente. */
  readonly permiteEnvioAutomatico = computed(() => !this._ahorroDeDatos());

  constructor() {
    this.leer();

    const info = this.info();
    // El tipo de red cambia sin recargar la pagina: el voluntario entra a la casa y
    // el celular salta de datos a wifi. Si no se escucha, la interfaz miente.
    info?.addEventListener?.('change', () => this.leer());
  }

  /** Texto corto para la interfaz. No se inventa certeza donde no la hay. */
  descripcion(): string {
    if (this._ahorroDeDatos()) return 'ahorro de datos activo';
    switch (this._tipo()) {
      case 'wifi':
        return 'esta en wifi';
      case 'movil':
        return 'esta en datos moviles';
      default:
        return 'no se sabe que red es';
    }
  }

  private info(): InfoRed | undefined {
    const nav = navigator as Navigator & {
      connection?: InfoRed;
      mozConnection?: InfoRed;
      webkitConnection?: InfoRed;
    };
    return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  }

  private leer(): void {
    const info = this.info();
    if (!info) {
      this._tipo.set('desconocida');
      this._ahorroDeDatos.set(false);
      return;
    }

    this._ahorroDeDatos.set(info.saveData === true);

    if (info.type === 'wifi' || info.type === 'ethernet') {
      this._tipo.set('wifi');
      return;
    }
    if (info.type === 'cellular') {
      this._tipo.set('movil');
      return;
    }

    // Sin `type` queda `effectiveType`, que describe la VELOCIDAD y no la clase de
    // red: un wifi malo se reporta como 2g. Sirve para saber que la conexion es
    // pobre, no para saber quien paga, asi que no se usa para decidir gasto.
    this._tipo.set('desconocida');
  }
}
