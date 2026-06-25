#!/usr/bin/env python3
"""
TiendaMax — genera productos-lite.json (campos esenciales para catálogo público).
El admin sigue usando productos.json completo; el sitio público carga lite.json
para ahorrar ~80KB en 3G (148KB → ~39KB).
"""
import json, os, sys

SRC = "public/productos.json"
OUT = "public/productos-lite.json"

ESSENTIAL = [
    "id", "nombre", "precioActual", "precioOriginal", "imagen",
    "categoria", "subcategoria", "stock", "masVendido", "usado",
    "garantia", "devolucion", "descuento", "specs", "slug", "comision", "comisionMoneda"
]

def main():
    if not os.path.exists(SRC):
        print(f"ERROR: {SRC} no existe", file=sys.stderr)
        sys.exit(1)
    with open(SRC, encoding="utf-8") as f:
        full = json.load(f)
    lite = []
    for p in full:
        item = {}
        for k in ESSENTIAL:
            if k in p:
                item[k] = p[k]
        lite.append(item)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(lite, f, ensure_ascii=False, separators=(",", ":"))
    src_size = os.path.getsize(SRC)
    out_size = os.path.getsize(OUT)
    ratio = (out_size / src_size) * 100 if src_size else 0
    print(f"productos-lite.json: {src_size}B → {out_size}B ({ratio:.0f}%) — {len(lite)} productos")

if __name__ == "__main__":
    main()
