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


def _atomic_write_json(path, data):
    """Escribe JSON de forma atómica (temp file + os.replace) para que un
    corte a mitad de escritura (timeout de CI, OOM) nunca deje productos.json
    truncado/corrupto."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


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
        try:
            original_val = float(original) if original else 0
        except (TypeError, ValueError):
            original_val = 0
        if original_val <= 0:
            # Sin precioOriginal válido no hay a qué revertir el precio — se
            # deja precioActual como está, pero SÍ se limpian descuento/ofertaFin
            # (si no, el producto queda con el badge "-X%" pegado para siempre).
            # A diferencia de antes, esto ahora queda registrado explícitamente
            # en vez de pasar como una reversión normal sin ningún rastro.
            print(f"⚠️ Oferta vencida sin precioOriginal válido (precio NO revertido, solo se limpian flags): {p.get('nombre') or p.get('id')}")
        else:
            p["precioActual"] = original_val
        p.pop("precioOriginal", None)
        p.pop("ofertaFin", None)
        p["descuento"] = 0
        revertidos.append(p.get("nombre") or p.get("id"))

    if not revertidos:
        print("Sin ofertas vencidas.")
        return

    _atomic_write_json(SRC, data)
    print(f"Ofertas revertidas ({len(revertidos)}): " + ", ".join(str(x) for x in revertidos))


if __name__ == "__main__":
    main()
