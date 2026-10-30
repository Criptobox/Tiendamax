"""El precio de los productos digitales (categoría TARJETAS).

La regla la puso el dueño mirando a la competencia, que cobra «+30 % del monto
en tarjeta (valorado en USDT)»:

  precio en USDT = el mayor de  valor + 20 %  y  coste + 1 USDT,
                   nunca menos de 2 USDT, redondeado hacia arriba al entero.
  precio en USD  = precio en USDT × 1,05 (el USDT le cuesta ese 5 % de más),
                   redondeado hacia arriba al medio dólar.

El «valor» es lo que dice la tarjeta ($25). En las recargas (diamantes, UC)
no hay valor impreso: se usa lo que cuestan. El mínimo de coste + 1 existe por
las recargas pequeñas, donde el 20 % de 1 USDT no paga ni la comisión.

Se cobran solo en USDT (red BEP20) o en USD. Nunca en MN: el dueño paga en
USDT, que en Cuba está más caro que el dólar, y convertir a la tasa del dólar
lo haría perder dinero en cada venta.

La misma cuenta vive en js/src/tm-digital.src.js; tests/test_digital.py
comprueba que las dos dan lo mismo.
"""
from __future__ import annotations

import math

MARGEN = 0.20
GANANCIA_MIN = 1.0
PEDIDO_MIN = 2.0
USDT_A_USD = 1.05
COMISION_RED = 0.10   # enviar USDT por BEP20: céntimos


def _arriba(x: float) -> float:
    return math.ceil(x - 1e-9)


def precio_usdt(valor: float, coste: float, recarga: bool = False) -> int:
    base = coste if recarga else valor
    return int(max(PEDIDO_MIN, _arriba(max(base * (1 + MARGEN), coste + GANANCIA_MIN))))


def precio_usd(usdt: float) -> float:
    return math.ceil(usdt * USDT_A_USD * 2 - 1e-9) / 2


def ganancia(usdt: float, coste: float) -> float:
    return round(usdt - coste - COMISION_RED, 2)
