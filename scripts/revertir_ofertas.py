#!/usr/bin/env python3
"""
TiendaMax — Reversión automática de ofertas con fecha de fin.

Corre por cron (GitHub Action). El admin marca una oferta con un precio de
descuento y una fecha/hora de fin (campo "ofertaFin", ISO 8601 UTC). Este
script revisa productos.json y, cuando ya pasó esa fecha, restaura el precio
original — sin que el dueño tenga que acordarse de hacerlo a mano.

No toca nada más: si "ofertaFin" no existe o todavía no vence, el producto
queda intacto.
"""
import json
import os
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "productos.json")


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)
    ps = data if isinstance(data, list) else data.get("productos", [])

    ahora = datetime.now(timezone.utc)
    revertidos = []
    for p in ps:
        fin = p.get("ofertaFin")
        if not fin:
            continue
        try:
            fin_dt = datetime.fromisoformat(str(fin).replace("Z", "+00:00"))
        except ValueError:
            continue
        if fin_dt > ahora:
            continue
        original = p.get("precioOriginal")
        if original and float(original) > 0:
            p["precioActual"] = original
        p.pop("precioOriginal", None)
        p.pop("ofertaFin", None)
        p["descuento"] = 0
        revertidos.append(p.get("nombre") or p.get("id"))

    if not revertidos:
        print("Sin ofertas vencidas.")
        return

    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Ofertas revertidas ({len(revertidos)}): " + ", ".join(str(x) for x in revertidos))


if __name__ == "__main__":
    main()
