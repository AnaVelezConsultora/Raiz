#!/usr/bin/env python3
"""
Crea el tablero de Raiz en Trello a partir de tablero-raiz.json.

Estructura: cada HITO es una lista de Trello; los APARTADOS ordenan las tarjetas
dentro de la lista mediante el numeral; cada HU es una tarjeta.

Las credenciales se leen del entorno y NUNCA se escriben en ningun archivo:

    export TRELLO_KEY=...      # trello.com/power-ups/admin -> Clave de API
    export TRELLO_TOKEN=...    # el enlace "Token" al lado de la clave
    ./crear-tablero.py

    ./crear-tablero.py --simular    # muestra que haria, sin tocar Trello

Solo usa la biblioteca estandar: no hay que instalar nada.

Es re-ejecutable: si el tablero ya existe reutiliza sus listas y etiquetas y solo
agrega las HU que falten, comparando por identificador. Asi se puede volver a
correr cuando el backlog cambie, sin duplicar lo que ya esta.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.trello.com/1"
AQUI = os.path.dirname(os.path.abspath(__file__))
SIMULAR = "--simular" in sys.argv


def credenciales():
    # Se aceptan los dos nombres porque el panel de Trello rotula el valor como
    # "Clave de API" y mucha gente lo exporta como TRELLO_API_KEY.
    clave = os.environ.get("TRELLO_KEY") or os.environ.get("TRELLO_API_KEY")
    token = os.environ.get("TRELLO_TOKEN")

    if not SIMULAR and (not clave or not token):
        falta_token = bool(clave) and not token
        sys.exit(
            "Faltan credenciales.\n\n"
            "  export TRELLO_KEY=...      la Clave de API (trello.com/power-ups/admin)\n"
            "  export TRELLO_TOKEN=...    el token de usuario\n\n"
            + (
                "Tienes la clave pero falta el TOKEN, que es otra cosa.\n"
                "OJO: el 'secreto de API' NO es el token; ese es para OAuth y aqui\n"
                "no se usa. El token se genera abriendo esta URL con tu sesion de\n"
                "Trello y aprobando:\n\n"
                "  https://trello.com/1/authorize?expiration=1day"
                "&name=Raiz%20backlog&scope=read,write&response_type=token&key=$TRELLO_KEY\n\n"
                "Con expiration=1day caduca solo, que es lo que conviene para una\n"
                "corrida puntual.\n\n"
                if falta_token else ""
            )
            + "O corre con --simular para ver que haria, sin credenciales."
        )

    return {"key": clave or "SIMULADA", "token": token or "SIMULADO"}


AUTH = credenciales()


def pedir(metodo, ruta, **parametros):
    if SIMULAR:
        print(f"    [simulado] {metodo} {ruta} {str(parametros.get('name', ''))[:60]}")
        return {"id": f"sim-{abs(hash(str(parametros))) % 10**8}"}

    parametros.update(AUTH)
    datos = urllib.parse.urlencode(parametros).encode()

    for intento in range(5):
        try:
            peticion = urllib.request.Request(f"{API}{ruta}", data=datos, method=metodo)
            with urllib.request.urlopen(peticion, timeout=30) as respuesta:
                return json.loads(respuesta.read() or "{}")
        except urllib.error.HTTPError as e:
            # 429: Trello limita a unas 100 peticiones cada 10 segundos por token.
            if e.code == 429 and intento < 4:
                time.sleep(2 ** intento)
                continue
            sys.exit(f"Error {e.code} en {metodo} {ruta}: {e.read().decode()[:300]}")
        except urllib.error.URLError as e:
            if intento < 4:
                time.sleep(2 ** intento)
                continue
            sys.exit(f"No se pudo alcanzar Trello: {e}")


def consultar(ruta, **parametros):
    if SIMULAR:
        return []
    parametros.update(AUTH)
    url = f"{API}{ruta}?{urllib.parse.urlencode(parametros)}"
    with urllib.request.urlopen(url, timeout=30) as respuesta:
        return json.loads(respuesta.read() or "[]")


def nombre_lista(hito):
    return f"Hito {hito['numero']} · {hito['nombre']}"


def orden(hu_id):
    """'HU 1.2.3' -> 10203, para ordenar las tarjetas dentro de la lista."""
    hito, apartado, historia = (int(n) for n in hu_id.split()[1].split("."))
    return hito * 10000 + apartado * 100 + historia


def rotular(handle, personas):
    """'davidf9265' -> 'David Franco (@davidf9265)'. Sin ficha, deja el handle solo."""
    ficha = personas.get(handle)
    if not isinstance(ficha, dict) or not ficha.get("nombre"):
        return f"@{handle}"
    return f"{ficha['nombre']} (@{handle})"


def descripcion(hu, apartado, personas):
    partes = [
        f"**Apartado {apartado['numero']} · {apartado['nombre']}**",
        f"**Como** {hu['como']}\n**quiero** {hu['quiero']}\n**para** {hu['para']}.",
    ]

    if hu.get("criterios"):
        partes.append(
            "**Criterios de aceptación**\n"
            + "\n".join(f"- {c}" for c in hu["criterios"])
        )

    bloque = []
    if hu.get("asignado"):
        bloque.append(f"**Responsable:** {hu['asignado']}")
    if hu.get("sugerido"):
        gente = ", ".join(rotular(p, personas) for p in hu["sugerido"])
        etiqueta = "Apoyan" if hu.get("asignado") else "Responsable sugerido"
        # Quien ya tiene cuenta en el tablero queda ademas en el campo de miembros de la
        # tarjeta; el texto se conserva para los demas y para que el handle de GitHub
        # siga visible, que es como el equipo se nombra en el repositorio.
        bloque.append(
            f"**{etiqueta}:** {gente}\n"
            "Punto de partida, no asignación cerrada: se confirma en el grupo."
        )
    if bloque:
        partes.append("\n\n".join(bloque))

    referencias = [
        (etiqueta, hu[campo])
        for campo, etiqueta in (
            ("origen", "Origen"),
            ("depende_de", "Depende de"),
            ("desbloquea", "Desbloquea"),
            ("bloquea", "Bloquea"),
        )
        if hu.get(campo)
    ]
    if referencias:
        partes.append("\n".join(f"**{e}:** {v}" for e, v in referencias))

    return "\n\n---\n\n".join(partes)


def historias(modelo):
    """Aplana hitos -> apartados -> HU, conservando el contexto de cada una."""
    for hito in modelo["hitos"]:
        for apartado in hito["apartados"]:
            for hu in apartado["hus"]:
                yield hito, apartado, hu


def main():
    with open(os.path.join(AQUI, "tablero-raiz.json"), encoding="utf-8") as f:
        modelo = json.load(f)

    todas = list(historias(modelo))
    print(f"\nTablero: {modelo['tablero']}")
    print(f"Hitos: {len(modelo['hitos'])} · Historias: {len(todas)}")
    if SIMULAR:
        print("MODO SIMULACION: no se toca Trello\n")

    # --- tablero -------------------------------------------------------------
    existentes = {t["name"]: t for t in consultar("/members/me/boards", fields="name")}
    if modelo["tablero"] in existentes:
        tablero = existentes[modelo["tablero"]]
        print(f"\nReutilizando tablero existente: {tablero['id']}")
    else:
        print("\nCreando tablero")
        tablero = pedir(
            "POST", "/boards/",
            name=modelo["tablero"],
            desc=modelo["descripcion"],
            defaultLists="false",          # las listas las define el modelo, no Trello
            prefs_permissionLevel="private",
        )

    id_tablero = tablero["id"]

    # --- listas: una por hito ------------------------------------------------
    print("\nListas (una por hito)")
    listas = {l["name"]: l["id"] for l in consultar(f"/boards/{id_tablero}/lists")}
    for posicion, hito in enumerate(modelo["hitos"], start=1):
        nombre = nombre_lista(hito)
        if nombre in listas:
            print(f"  = {nombre}")
            continue
        creada = pedir("POST", f"/boards/{id_tablero}/lists",
                       name=nombre, pos=posicion * 1000)
        listas[nombre] = creada["id"]
        print(f"  + {nombre}")

    # --- etiquetas -----------------------------------------------------------
    print("\nEtiquetas")
    etiquetas = {e["name"]: e["id"]
                 for e in consultar(f"/boards/{id_tablero}/labels") if e["name"]}
    for etiqueta in modelo["etiquetas"]:
        if etiqueta["nombre"] in etiquetas:
            print(f"  = {etiqueta['nombre']}")
            continue
        creada = pedir("POST", f"/boards/{id_tablero}/labels",
                       name=etiqueta["nombre"], color=etiqueta["color"])
        etiquetas[etiqueta["nombre"]] = creada["id"]
        print(f"  + {etiqueta['nombre']} ({etiqueta['color']})")

    # --- miembros ------------------------------------------------------------
    # Trello asigna por cuenta de Trello, no por handle de GitHub. El bloque `personas`
    # del modelo hace ese cruce; quien todavia no tiene cuenta en el tablero se queda en
    # el texto de la tarjeta y entra sola la proxima vez que se corra esto, sin tocar
    # el backlog.
    print("\nMiembros")
    miembros = {m["username"]: m["id"]
                for m in consultar(f"/boards/{id_tablero}/members", fields="username")}
    personas = modelo.get("personas", {})

    cuentas = {}          # handle de GitHub -> id de miembro de Trello
    sin_cuenta = []
    for handle, ficha in personas.items():
        if handle.startswith("_") or not isinstance(ficha, dict):
            continue
        usuario = ficha.get("trello")
        if usuario and usuario in miembros:
            cuentas[handle] = miembros[usuario]
        elif usuario:
            print(f"  ! @{handle} -> {usuario} no esta en el tablero")
            sin_cuenta.append(handle)
        else:
            sin_cuenta.append(handle)
    print(f"  {len(cuentas)} de {len(cuentas) + len(sin_cuenta)} personas con cuenta en el tablero")
    if sin_cuenta:
        print(f"  pendientes de invitacion: {', '.join('@' + h for h in sin_cuenta)}")

    def ids_de(hu):
        """Responsable + apoyos que ya tengan cuenta. Devuelve ids sin repetir."""
        ids = []
        usuario = hu.get("asignado")
        if usuario:
            if usuario in miembros:
                ids.append(miembros[usuario])
            else:
                print(f"  ! {hu['id']}: {usuario} no esta en el tablero, no se asigna")
        for handle in hu.get("sugerido", []):
            if handle in cuentas:
                ids.append(cuentas[handle])
        return list(dict.fromkeys(ids))

    # --- historias -----------------------------------------------------------
    print("\nHistorias")
    ya_estan = {}
    for id_lista in listas.values():
        for tarjeta in consultar(f"/lists/{id_lista}/cards", fields="name,desc,idMembers"):
            ya_estan[tarjeta["name"].split(" · ")[0]] = tarjeta

    creadas = actualizadas = iguales = 0
    for hito, apartado, hu in sorted(todas, key=lambda t: orden(t[2]["id"])):
        texto = descripcion(hu, apartado, personas)
        quienes = ids_de(hu)

        if hu["id"] in ya_estan:
            existente = ya_estan[hu["id"]]
            actuales = existente.get("idMembers", [])
            # Union, no reemplazo: si alguien se asigno a mano en Trello, no se le quita.
            faltan = [i for i in quienes if i not in actuales]
            if existente.get("desc") == texto and not faltan:
                iguales += 1
            else:
                cambios = {"desc": texto}
                if faltan:
                    cambios["idMembers"] = ",".join(actuales + faltan)
                pedir("PUT", f"/cards/{existente['id']}", **cambios)
                actualizadas += 1
                detalle = f"  → +{len(faltan)} miembro(s)" if faltan else "  descripción"
                print(f"  ~ {hu['id']}{detalle}")
            continue

        pedir("POST", "/cards",
              idList=listas[nombre_lista(hito)],
              name=f"{hu['id']} · {hu['titulo']}",
              desc=texto,
              idLabels=",".join(etiquetas[e] for e in hu["etiquetas"]),
              idMembers=",".join(quienes),
              pos=orden(hu["id"]))
        creadas += 1
        print(f"  + {hu['id']} · {hu['titulo'][:58]}")

    print(f"\nListo. Creadas: {creadas}. Actualizadas: {actualizadas}. Sin cambios: {iguales}.")
    if not SIMULAR:
        print(f"https://trello.com/b/{tablero.get('shortLink', id_tablero)}")
        print(
            "\nRevoca el token cuando termines:\n"
            "  https://trello.com/my/account -> Tokens permitidos"
        )


if __name__ == "__main__":
    main()
