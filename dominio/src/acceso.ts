/**
 * La politica de claves, escrita una sola vez.
 *
 * POR QUE ESTO ES CONTRATO Y NO UN DETALLE DE CADA LADO
 *
 * Porque quien la aplica de verdad es el proveedor de identidad, y lo hace TARDE:
 * despues de haber creado la cuenta. Si la aplicacion sugiere una clave que el
 * proveedor va a rechazar, el alta muere a mitad de camino y deja una cuenta que
 * existe, no puede entrar y no tiene perfil.
 *
 * Paso exactamente eso el 15 de agosto de 2026: el boton «Sugerir» generaba
 * `abcd-2345-efgh`, sin mayuscula y con un guion que Cognito NO cuenta como simbolo.
 * La cuenta quedo creada en estado «forzar cambio de contrasena», sin perfil, y el
 * mensaje que vio el custodio fue «el servidor no pudo atender la peticion,
 * reintente» — un consejo falso, porque reintentar con la misma clave falla igual.
 *
 * Con la regla aqui, los dos lados comprueban lo mismo ANTES de tocar nada.
 *
 * @version 0.1.0
 */

/**
 * Simbolos que se usan al sugerir. Todos estan en la lista que acepta Cognito.
 *
 * El guion `-` NO esta en esa lista, aunque lo parezca. Tampoco se incluyen comillas
 * ni barras: esta clave se dicta por telefono a alguien que esta en una vereda, y
 * «comilla simple» es una instruccion que se malinterpreta.
 */
export const SIMBOLOS_CLAVE = '.$*#@%+=!?';

/**
 * Lo que se exige aqui. ES MAS ESTRICTO QUE EL POOL, a proposito.
 *
 * El pool pide 8 caracteres con mayuscula, minuscula y numero, y NO pide simbolo
 * (ver entorno/aws/desplegar-cognito.sh). Aqui se piden 10 y un simbolo.
 *
 * La diferencia no es capricho: validando por encima de lo que el proveedor exige,
 * el proveedor nunca llega a rechazar una clave, y por lo tanto nunca se queda una
 * cuenta a medias por ese motivo. Y las cuentas de las que hablamos leen el padron
 * de familias damnificadas — diez caracteres con un simbolo no es mucho pedir.
 */
export const POLITICA_CLAVE = {
  minimo: 10,
  exigeMayuscula: true,
  exigeMinuscula: true,
  exigeNumero: true,
  exigeSimbolo: true
} as const;

/**
 * Que le falta a esta clave. Vacio si cumple.
 *
 * Devuelve la lista y no un booleano porque el mensaje importa: «la clave no sirve»
 * manda a adivinar, y quien esta dando de alta a alguien no tiene por que saberse la
 * politica de AWS de memoria.
 */
export function faltantesDeClave(clave: string): string[] {
  const falta: string[] = [];

  if ((clave ?? '').length < POLITICA_CLAVE.minimo) {
    falta.push(`al menos ${POLITICA_CLAVE.minimo} caracteres`);
  }
  if (!/[A-ZÁÉÍÓÚÑ]/.test(clave)) falta.push('una mayuscula');
  if (!/[a-záéíóúñ]/.test(clave)) falta.push('una minuscula');
  if (!/[0-9]/.test(clave)) falta.push('un numero');
  if (![...SIMBOLOS_CLAVE].some((s) => clave.includes(s))) {
    falta.push(`un simbolo de estos: ${SIMBOLOS_CLAVE}`);
  }

  return falta;
}

/**
 * Una clave que cumple la politica y se puede dictar por telefono.
 *
 * Sin caracteres que se confundan al leerlos en voz alta —ni O ni 0, ni l ni 1— y en
 * bloques separados: la coordinacion se la va a dictar a alguien que esta en una
 * vereda, no la va a copiar y pegar.
 *
 * El sorteo se repite hasta cumplir en vez de armar la clave por posiciones fijas:
 * asi el dia que la politica cambie, esta funcion la sigue cumpliendo sin tocarla.
 */
export function sugerirClave(): string {
  const mayusculas = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const minusculas = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';

  const azar = (fuente: string) => fuente[Math.floor(Math.random() * fuente.length)];
  const bloque = (fuente: string, n: number) =>
    Array.from({ length: n }, () => azar(fuente)).join('');

  for (let intento = 0; intento < 20; intento++) {
    const clave =
      bloque(mayusculas, 1) +
      bloque(minusculas, 3) +
      '.' +
      bloque(numeros, 4) +
      '.' +
      bloque(minusculas, 3) +
      azar(SIMBOLOS_CLAVE);

    if (faltantesDeClave(clave).length === 0) return clave;
  }

  // Inalcanzable con los alfabetos de arriba, y por eso no se deja al azar: si algun
  // dia alguien los cambia y el bucle no encuentra una clave valida, es mejor fallar
  // aqui que devolver una que el proveedor va a rechazar despues de crear la cuenta.
  throw new Error('No se pudo generar una clave que cumpla la politica.');
}
