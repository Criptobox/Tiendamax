"""Cuándo se avisa de la tasa, y con qué número. Una sola regla para la push
(scripts/send_notifications.py) y para el canal de Telegram
(bot/canal_tasa.py): con una copia en cada sitio, cada canal acaba diciendo
una cosa distinta.

Lo que pidió el dueño: avisar solo en múltiplos de 5, redondeando "de 3 para
arriba" (723 → 725, 722 → 720).

Antes se avisaba con cada cambio: elTOQUE mueve la tasa de medio en medio
peso varias veces al día y en 30 días hubo 166 avisos. Solo con redondear
quedaban 52, pero la mayoría eran rebotes: el 24 de agosto la tasa bailó
entre 687 y 688 toda la tarde, justo en la frontera, y habría avisado once
veces 685 → 690 → 685… Por eso, además, el valor nuevo tiene que estar a
MARGEN pesos o más del último avisado. Con el historial real: 16 avisos en
30 días, casi todos un paso de 5 en una sola dirección.

El número es la tasa del CLIENTE (tasaMN + margenMN), la misma que usa la
tienda para los precios en MN. La push decía la de elTOQUE sin margen (720)
mientras la tienda cobraba a 730 y Telegram decía 730.
"""
from __future__ import annotations

import math

PASO = 5
MARGEN = 4
MARGEN_MN_POR_DEFECTO = 10.0


def _entero(x: float) -> int:
    # round() de Python redondea 722.5 a 722 (al par); aquí .5 sube siempre.
    return int(math.floor(float(x) + 0.5))


def redondear(tasa: float) -> int:
    """Al múltiplo de 5: de 3 para arriba sube (723 → 725, 722 → 720)."""
    n = _entero(tasa)
    base, resto = divmod(n, PASO)
    return base * PASO + (PASO if resto >= 3 else 0)


def tasa_cliente(cfg) -> float | None:
    """tasaMN + margenMN de config.json; None si no hay tasa."""
    if not isinstance(cfg, dict):
        return None
    try:
        base = float(cfg.get("tasaMN") or 0)
    except (TypeError, ValueError):
        return None
    if base <= 0:
        return None
    margen = cfg.get("margenMN")
    try:
        margen = float(margen) if margen is not None else MARGEN_MN_POR_DEFECTO
    except (TypeError, ValueError):
        margen = MARGEN_MN_POR_DEFECTO
    return base + margen


def toca_avisar(tasa: float, ultima_avisada) -> int | None:
    """El valor a avisar, o None si no toca.

    Sin un último valor avisado no se avisa (la primera pasada solo lo
    apunta): si no, cada canal estrenaría la regla mandando la tasa de hoy.
    """
    if tasa is None or ultima_avisada is None:
        return None
    nueva = redondear(tasa)
    try:
        ultima = float(ultima_avisada)
    except (TypeError, ValueError):
        return None
    if nueva != ultima and abs(_entero(tasa) - ultima) >= MARGEN:
        return nueva
    return None
