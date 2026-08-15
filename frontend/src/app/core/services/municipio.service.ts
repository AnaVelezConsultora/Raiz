import { Injectable, inject, signal } from '@angular/core';
import { SIN_UBICAR, municipioEn } from '../domain/municipios';
import { GeolocalizacionService } from './geolocalizacion.service';

/** Donde se recuerda el ultimo municipio resuelto, entre aperturas de la aplicacion. */
const CLAVE_RECORDADO = 'raiz.municipio';

/**
 * Que municipio se muestra en la barra superior.
 *
 * POR QUE SE RESUELVE EN EL DISPOSITIVO Y NO SE LE PREGUNTA A NADIE
 *
 * Un servicio de geocodificacion inversa resolveria cualquier punto del pais, y no
 * se usa por tres razones, cada una suficiente:
 *
 *   1. Necesita internet. En la vereda no hay, y ahi es donde el voluntario abre la
 *      aplicacion. Un dato que solo aparece con senal no sirve para orientar a quien
 *      trabaja sin ella.
 *   2. Manda la ubicacion del voluntario a un tercero. Lo que se esta haciendo con
 *      ese celular es levantar un padron de familias damnificadas.
 *   3. La politica de seguridad de contenido solo permite hablar con la API propia.
 *      Habria que abrirla, y esa politica es lo que impide que un script inyectado
 *      mande los casos a un servidor ajeno.
 *
 * El GPS, en cambio, es satelital y funciona sin senal. La tabla de municipios viaja
 * dentro de la aplicacion. Nada sale del dispositivo.
 *
 * ESTO NO DECIDE EL MUNICIPIO DE NINGUN CASO
 *
 * Es orientacion para quien mira la pantalla. El municipio que se GUARDA lo escribe
 * el voluntario en el formulario. Ver `municipios.ts`.
 *
 * @version 0.1.0
 */
@Injectable({ providedIn: 'root' })
export class MunicipioService {
  private readonly gps = inject(GeolocalizacionService);

  /**
   * Lo que debe mostrar la cabecera. Nunca es cadena vacia.
   *
   * Arranca con lo ultimo que se supo —si se supo algo— y no con `SIN_UBICAR`, para
   * que quien abre la aplicacion en la misma vereda de ayer no vea "Colombia"
   * durante los segundos que tarda el receptor en fijar satelites. Es el mismo
   * criterio de la captura de casos: lo que ya se sabe no se olvida por estar sin
   * senal.
   */
  readonly nombre = signal<string>(this.recordado() ?? SIN_UBICAR);

  /** True mientras se intenta ubicar. La cabecera lo usa para no prometer de mas. */
  readonly ubicando = signal(false);

  /**
   * Intenta ubicar al voluntario. Silencioso: nunca lanza ni molesta.
   *
   * Se llama al arrancar. Si el permiso esta denegado, si el dispositivo no tiene
   * receptor o si no fija satelites a tiempo, no pasa nada: se queda lo que hubiera.
   */
  async resolver(): Promise<void> {
    if (!this.gps.soportado) return;

    this.ubicando.set(true);
    try {
      // Precision de un kilometro y espera corta, a proposito. Un municipio mide
      // decenas de kilometros: pedir veinte metros —lo que exige la captura de un
      // caso— gastaria bateria y hasta 45 segundos para decidir una palabra de la
      // cabecera. Con esto suele bastar la primera lectura por triangulacion.
      const posicion = await this.gps.capturar({
        precisionObjetivoM: 1000,
        timeoutMs: 12_000
      });

      if (!posicion) return;

      const municipio = municipioEn(posicion.lat, posicion.lon);
      if (!municipio) {
        // Se ubico al voluntario y no cae cerca de ningun municipio conocido. Se
        // dice "Colombia" y se OLVIDA lo recordado: seguir mostrando el municipio
        // de ayer cuando ya se sabe que no es ese seria mentir con mas confianza.
        this.nombre.set(SIN_UBICAR);
        this.olvidar();
        return;
      }

      this.nombre.set(municipio.nombre);
      this.recordar(municipio.nombre);
    } finally {
      this.ubicando.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // El almacenamiento se envuelve porque en navegacion privada de algunos
  // navegadores `localStorage` existe y lanza al escribir. No es un caso raro: es
  // como abre un enlace mucha gente. Que la cabecera falle por eso seria absurdo.

  private recordado(): string | null {
    try {
      return localStorage.getItem(CLAVE_RECORDADO);
    } catch {
      return null;
    }
  }

  private recordar(nombre: string): void {
    try {
      localStorage.setItem(CLAVE_RECORDADO, nombre);
    } catch {
      // Sin memoria entre aperturas. La aplicacion sigue funcionando igual.
    }
  }

  private olvidar(): void {
    try {
      localStorage.removeItem(CLAVE_RECORDADO);
    } catch {
      // Igual.
    }
  }
}
