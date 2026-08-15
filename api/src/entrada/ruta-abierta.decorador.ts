import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Identidad } from '../dominio/puertos';

/**
 * Rotulo con el que NestJS marca una ruta en sus metadatos.
 *
 * NO ES UNA LLAVE NI UN SECRETO, aunque el prefijo lo parezca: es una cadena constante
 * que solo sirve para que la guarda pregunte "esta ruta esta marcada como abierta?".
 * Se llama asi y no `CLAVE_ALGO` a proposito. En un proyecto que maneja datos de
 * familias, una constante que se lee como "clave" obliga a quien revisa a detenerse a
 * comprobar que no lo es, y esa comprobacion se paga en cada lectura.
 */
export const METADATO_RUTA_ABIERTA = 'raiz.ruta.abierta';

/**
 * Marca una ruta como accesible sin token.
 *
 * POR QUE SE MARCA LO ABIERTO Y NO LO PROTEGIDO
 *
 * Porque el olvido tiene que fallar del lado seguro. Si hubiera que marcar lo
 * protegido, la ruta que alguien agregue con prisa quedaria abierta y nadie lo notaria
 * hasta que se note de la peor forma. Marcando lo abierto, ese mismo olvido produce una
 * ruta que pide token: estorba, y se arregla en un minuto.
 *
 * Cuales estan abiertas no se enumera aqui: se lee en el codigo de cada ruta, que es
 * donde no puede quedar desactualizado.
 */
export const RutaAbierta = () => SetMetadata(METADATO_RUTA_ABIERTA, true);

/**
 * Inyecta la identidad que la guarda ya verifico.
 *
 * El controlador la recibe como parametro y no vuelve a mirar la cabecera. Que exista
 * un solo lugar donde un token se convierte en identidad es lo que impide que dos
 * rutas interpreten distinto la misma cabecera.
 */
export const Quien = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): Identidad =>
    contexto.switchToHttp().getRequest().identidad
);
