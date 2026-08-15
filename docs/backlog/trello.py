#!/usr/bin/env python3
"""Acceso de solo lectura al tablero de Trello.

Se usa para saber que hay antes de cambiar nada. Escribir es otro archivo, a
proposito: leer no puede romperle el tablero a nadie y conviene que la diferencia
sea evidente al mirar la lista de archivos.

CREDENCIAL

`TRELLO_API_KEY` trae un token de API de Atlassian —empieza por `ATATT`—, que no
es el par clave+token clasico que espera `crear-tablero.py`. Con ese formato,
Trello autentica por Basic con el correo de la cuenta.

Se resuelven varios modos y se usa el primero que responda, porque el formato de
credencial de Trello ha cambiado y no conviene que este archivo asuma uno.

Uso:
    ./trello.py tableros
    ./trello.py listas <id_tablero>
    ./trello.py tarjetas <id_tablero>
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.trello.com/1"
CORREO = os.environ.get("TRELLO_CORREO", "jhony2473@gmail.com")


def _credenciales():
    """Modos de autenticacion a probar, en orden."""
    tok = os.environ.get("TRELLO_API_KEY", "")
    clave = os.environ.get("TRELLO_KEY", "")
    token = os.environ.get("TRELLO_TOKEN", "")

    modos = []
    if clave and token:
        # El par clasico, si alguien lo exporto. Es el que documenta el README.
        modos.append(("clave+token", {}, {"key": clave, "token": token}))
    if tok:
        b64 = base64.b64encode(f"{CORREO}:{tok}".encode()).decode()
        modos.append(("basic", {"Authorization": f"Basic {b64}"}, {}))
        modos.append(("bearer", {"Authorization": f"Bearer {tok}"}, {}))
        modos.append(("query", {}, {"token": tok}))
    return modos


_ELEGIDO = None


def pedir(ruta, params=None, metodo="GET", cuerpo=None):
    """Una peticion a la API, resolviendo el modo de autenticacion la primera vez."""
    global _ELEGIDO
    modos = [_ELEGIDO] if _ELEGIDO else _credenciales()
    if not modos:
        raise SystemExit("No hay credencial: exporte TRELLO_API_KEY (o TRELLO_KEY y TRELLO_TOKEN).")

    ultimo = None
    for modo in modos:
        nombre, cabeceras, extra = modo
        consulta = dict(params or {})
        consulta.update(extra)
        url = f"{API}{ruta}"
        if consulta:
            url += "?" + urllib.parse.urlencode(consulta)

        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        cab = dict(cabeceras)
        if datos:
            cab["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=datos, headers=cab, method=metodo)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                _ELEGIDO = modo
                texto = r.read().decode()
                return json.loads(texto) if texto else None
        except urllib.error.HTTPError as e:
            ultimo = f"{nombre}: {e.code} {e.read()[:120].decode(errors='ignore')}"
        except Exception as e:  # noqa: BLE001
            ultimo = f"{nombre}: {e}"

    raise SystemExit(f"Ningun modo de autenticacion sirvio. Ultimo: {ultimo}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    orden = sys.argv[1]

    if orden == "yo":
        yo = pedir("/members/me", {"fields": "username,fullName"})
        print(f"  autenticado como {yo.get('username')} ({yo.get('fullName')})")
        print(f"  modo: {_ELEGIDO[0]}")

    elif orden == "tableros":
        for t in pedir("/members/me/boards", {"fields": "name,closed,url"}):
            if not t.get("closed"):
                print(f"  {t['id']}  {t['name']}")

    elif orden == "listas":
        for l in pedir(f"/boards/{sys.argv[2]}/lists", {"fields": "name"}):
            print(f"  {l['id']}  {l['name']}")

    elif orden == "tarjetas":
        listas = {l["id"]: l["name"] for l in pedir(f"/boards/{sys.argv[2]}/lists", {"fields": "name"})}
        tarjetas = pedir(
            f"/boards/{sys.argv[2]}/cards",
            {"fields": "name,idList,labels,due,dueComplete,desc"},
        )
        for c in tarjetas:
            etiquetas = ",".join(e.get("name") or e.get("color", "") for e in c.get("labels", []))
            print(f"  {c['id']}  [{listas.get(c['idList'], '?')}]  {c['name']}  <{etiquetas}>")

    elif orden == "etiquetas":
        for e in pedir(f"/boards/{sys.argv[2]}/labels", {"fields": "name,color"}):
            print(f"  {e['id']}  {e.get('color')}  {e.get('name')}")

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
