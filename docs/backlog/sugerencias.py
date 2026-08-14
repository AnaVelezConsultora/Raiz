# Responsables sugeridos por capacidad. NO es asignacion: es punto de partida.
# Criterios aplicados:
#  - La plataforma va primero (ADR 004), asi que 2 personas quedan dedicadas a
#    Infra y fuera del reparto de la API, para que no se la absorba el backend.
#  - Nadie arranca con mas de dos historias en paralelo: dos a medias valen menos
#    que una terminada (ROLES-Y-ESFUERZO.md).
#  - Solo se sugiere el hito 1. Los hitos 2 a 4 se toman cuando el 1 avance.
#  - Las decisiones y bloqueadas no se sugieren: son de la coordinacion, no de
#    quien programa.
SUGERIDOS = {
    # --- Plataforma: dedicada, no entra a la API ---------------------------
    "HU 1.1.1": ["pkill2913", "Frank-Apotheosis"],   # unico solo-infra + infra/be
    "HU 1.1.2": ["Inmemorialake"],
    "HU 1.1.3": ["EdwarMontano"],
    "HU 1.1.4": ["pkill2913"],
    "HU 1.4.2": ["kvinstuard"],
    # --- API: el bloque mas grande, y donde esta la mayor capacidad --------
    "HU 1.2.1": ["davidf9265"],                       # esta en las tres capas
    "HU 1.2.2": ["diegof59"],
    "HU 1.2.3": ["Clavijo110"],
    "HU 1.2.4": ["oramirez1512-CO"],
    "HU 1.2.5": ["lDavidSantiago"],
    "HU 1.2.6": ["DdeDiegoA"],
    "HU 1.2.7": ["EdwarMontano"],
    "HU 1.5.2": ["Clavijo110"],
    # --- Cliente -----------------------------------------------------------
    "HU 1.3.1": ["HKevinH"],
    "HU 1.3.2": ["skLuan"],
    "HU 1.3.3": ["johan1113"],
    "HU 1.3.4": ["Herreran903"],
    "HU 1.3.5": ["johan1113"],
    "HU 1.5.3": ["Herreran903"],
    # --- Prueba en campo: abierta a cualquiera con un Android --------------
    "HU 1.4.1": ["HKevinH", "skLuan", "DdeDiegoA"],
    # --- Documentacion -----------------------------------------------------
    "HU 1.6.2": ["davidf9265"],
}
