#!/usr/bin/env python3
"""Marca en Trello las historias que quedaron cerradas, y explica por que.

    ./marcar-hechas.py --simular    # primero en seco, sin tocar nada
    ./marcar-hechas.py

QUE HACE, Y SOBRE TODO QUE NO HACE

Solo AGREGA la etiqueta `hecha` y un comentario. No quita etiquetas, no mueve
tarjetas, no cambia descripciones y no toca ninguna historia que no este en la
lista de abajo.

Esa restriccion no es prudencia general: el repositorio ya tiene un commit
—"que el script no le borre a nadie lo que marco en Trello"— que existe porque una
version anterior de las herramientas de este directorio piso trabajo ajeno. Quince
personas usan este tablero y lo que marcan es suyo.

Es IDEMPOTENTE. Si la tarjeta ya esta marcada, se salta; si ya tiene un comentario
identico, no lo repite. Correrlo dos veces deja lo mismo que correrlo una.

CREDENCIALES

Ver la seccion de Trello en el CLAUDE.md de la raiz. En resumen: TRELLO_KEY y
TRELLO_TOKEN, y si sale `invalid key` el problema es la clave, no el token.
"""
import sys

from trello import pedir

TABLERO = "Raíz — Backlog"

# -----------------------------------------------------------------------------
# Lo que se cierra, con la razon que va al comentario.
#
# El texto no es un "listo": dice que se hizo, que quedo fuera y donde mirarlo.
# Una tarjeta marcada sin explicacion obliga a la siguiente persona a reconstruir
# la historia desde los commits.
# -----------------------------------------------------------------------------
HECHAS = {
    "HU 1.1.1": (
        "Infraestructura levantada en AWS con guiones idempotentes en `entorno/aws/`: "
        "VPC de dos zonas **sin puerta de enlace NAT**, RDS PostgreSQL 16.14 cifrada en "
        "subredes sin ruta a internet, bucket privado con los cuatro bloqueos, clúster "
        "de Fargate y balanceador.\n\n"
        "**Salvedad sobre un criterio de aceptación.** «Se levanta y se destruye completo "
        "desde cero» se cumple a medias a propósito: la instancia tiene protección contra "
        "borrado, así que destruirla exige apagarla antes con `--no-deletion-protection`. "
        "Ese paso extra *es* la protección, y se decidió sabiendo lo que cuesta: esto "
        "atiende una emergencia humanitaria y un borrado accidental no cuesta una tarde "
        "sino el padrón de familias ya caracterizadas.\n\n"
        "Detalle y orden de los guiones en `entorno/aws/README.md`."
    ),
    "HU 1.1.2": (
        "El pipeline se autentica por identidad federada: proveedor OIDC de GitHub y un "
        "rol por entorno. **Ningún secreto de AWS en la configuración del repositorio.**\n\n"
        "La confianza va acotada a `refs/heads/main` con `StringEquals`, no con comodín: "
        "con comodín entraría cualquier rama y cualquier propuesta de cambio, y abrir una "
        "propuesta puede hacerlo quien sea. Por eso el flujo de verificación tampoco pide "
        "`id-token`.\n\n"
        "También el rol `raiz-lectura-registros`, que es lo que se le da a quien depura en "
        "vez de consola — el tercer criterio de la historia.\n\n"
        "**Queda una llave de larga vida viva**: la de quien montó todo esto. Retirarla es "
        "el último paso y va después de comprobar que el pipeline despliega solo. Está "
        "registrado como deuda D3 en `docs/DEUDA-TECNICA.md`, y es la de mayor riesgo "
        "abierta."
    ),
    "HU 1.1.3": (
        "Migraciones numeradas con tabla de registro, aplicadas por una tarea efímera "
        "**dentro de la VPC** — la base no es alcanzable desde ninguna máquina, y abrirla "
        "«un rato» es la puerta que después nadie cierra.\n\n"
        "Cada archivo entra en su propia transacción y el registro se inserta en la misma: "
        "si el archivo falla, tampoco queda anotado como aplicado. El registro no es "
        "decoración, `supabase/schema.sql` no es idempotente y aplicarlo dos veces falla a "
        "media carga.\n\n"
        "Los catálogos **no** son migración, que es lo que pide el criterio: se reconcilian "
        "en cada corrida."
    ),
    "HU 1.1.4": (
        "Presupuesto de 50 USD/mes con cuatro avisos, creado **antes** del primer recurso "
        "que factura. No es formalismo: AWS evalúa un presupuesto desde que existe, así "
        "que una alerta puesta el martes no dice nada de lo que se gastó el lunes.\n\n"
        "Los dos números salen del ADR 002: 50 es el techo del rango estimado, y el aviso "
        "de 300 % son los 150 USD del gatillo de reversión del mismo ADR — si la factura "
        "pasa de ahí sin que haya crecido el uso, se reabre la decisión, no se sube el "
        "presupuesto.\n\n"
        "Gasto verificado al cerrar la jornada: 0,005 USD."
    ),
    "HU 1.2.2": (
        "La API corre igual en local y en la nube, y quedó desplegada en "
        "**https://api.apoyo-colombia.com** con TLS.\n\n"
        "Toda la configuración se lee de variables de entorno con los mismos nombres en "
        "los dos lados. Se corrigió de paso que `entorno/.env.example` dijera `PORT` "
        "cuando la API lee `PUERTO`.\n\n"
        "Verificado sobre HTTPS contra el dominio real: `/salud` responde con la base "
        "respondiendo, la sesión devuelve token de 12 horas, y el alta de voluntarios "
        "crea la cuenta con el rol menos privilegiado."
    ),
    "HU 1.5.2": (
        "La restricción `identidad_exige_consentimiento` está en la base y viajó a RDS con "
        "la migración `003-schema.sql`. Corresponde al hallazgo H9.\n\n"
        "Se aplicó **con la tabla vacía**, que era la ventana: con filas adentro deja de "
        "ser una línea y pasa a ser una migración que hay que negociar con datos de "
        "familias reales.\n\n"
        "Compara contra cadena vacía además de nulo, porque un cliente que «limpia» "
        "escribiendo `''` cumpliría la letra y no la regla. El teléfono sigue fuera: es la "
        "decisión HU 1.5.1 y no la toma quien programa."
    ),
}


def cargar(nombre_tablero):
    """Tablero, listas, etiquetas y tarjetas, en una pasada."""
    tableros = pedir("/members/me/boards", {"fields": "name,closed"})
    elegido = next(
        (t for t in tableros if not t.get("closed") and t["name"].strip() == nombre_tablero),
        None,
    )
    if not elegido:
        abiertos = [t["name"] for t in tableros if not t.get("closed")]
        raise SystemExit(f"No se encontro el tablero {nombre_tablero!r}. Hay: {abiertos}")

    etiquetas = pedir(f"/boards/{elegido['id']}/labels", {"fields": "name,color"})
    hecha = next((e for e in etiquetas if (e.get("name") or "").strip().lower() == "hecha"), None)
    if not hecha:
        raise SystemExit("El tablero no tiene la etiqueta 'hecha'. No se inventa: revisela a mano.")

    tarjetas = pedir(f"/boards/{elegido['id']}/cards", {"fields": "name,idLabels"})
    return elegido, hecha, tarjetas


def main():
    simular = "--simular" in sys.argv

    tablero, hecha, tarjetas = cargar(TABLERO)
    print(f"==> tablero {tablero['name']}  ({len(tarjetas)} tarjetas)")
    print(f"    etiqueta 'hecha': {hecha['id']} ({hecha.get('color')})")
    if simular:
        print("    MODO SIMULACION: no se escribe nada\n")
    else:
        print()

    for identificador, razon in HECHAS.items():
        # Las tarjetas se llaman "HU 1.1.1 · Titulo". Se busca por el numeral, que
        # es estable: el README dice que un numeral retirado no se reutiliza.
        tarjeta = next((c for c in tarjetas if c["name"].startswith(identificador)), None)
        if not tarjeta:
            print(f"  AUSENTE  {identificador}: no hay tarjeta con ese numeral")
            continue

        ya = hecha["id"] in tarjeta.get("idLabels", [])
        if ya:
            print(f"  ya estaba  {tarjeta['name']}")
            continue

        print(f"  MARCAR     {tarjeta['name']}")
        if simular:
            continue

        pedir(f"/cards/{tarjeta['id']}/idLabels", {"value": hecha["id"]}, metodo="POST")
        pedir(f"/cards/{tarjeta['id']}/actions/comments", {"text": razon}, metodo="POST")
        print("             etiquetada y comentada")

    print("\n==> listo")
    if simular:
        print("    Vuelva a correrlo sin --simular para aplicarlo.")


if __name__ == "__main__":
    main()
