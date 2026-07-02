#!/usr/bin/env python3
"""
TiendaMax — genera productos-lite.json a partir de productos.json.

El admin sigue usando productos.json completo; el sitio público carga lite
para ahorrar peso en 3G. lite = productos.json SIN el campo 'descripcion'
(la descripción se carga on-demand al abrir el modal de detalle).

Se ejecuta en CI (regenerate-artifacts.yml) cada vez que cambia productos.json,
para que el lite NUNCA quede desfasado del full (evita que un producto recién
agregado no aparezca en la tienda).
"""
import json, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "productos.json")
OUT = os.path.join(BASE, "productos-lite.json")

# Único campo que se omite en la versión lite.
OMIT = {"descripcion"}


def main():
    if not os.path.exists(SRC):
        print(f"ERROR: {SRC} no existe", file=sys.stderr)
        sys.exit(1)
    with open(SRC, encoding="utf-8") as f:
        full = json.load(f)
    if not isinstance(full, list):
        full = full.get("productos", [])
    lite = [{k: v for k, v in p.items() if k not in OMIT} for p in full]
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(lite, f, ensure_ascii=False, separators=(",", ":"))
    src_size = os.path.getsize(SRC)
    out_size = os.path.getsize(OUT)
    ratio = (out_size / src_size) * 100 if src_size else 0
    print(f"productos-lite.json: {src_size}B -> {out_size}B ({ratio:.0f}%) - {len(lite)} productos")


if __name__ == "__main__":
    main()
