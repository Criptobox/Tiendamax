#!/usr/bin/env python3
"""
TiendaMax — build_js_bundle.py
Une los 11 módulos JS del núcleo (js/src/tm-*.js, ya minificados por
minify_js.py) en un solo archivo (js/tm-bundle.js) para bajar de 11
requests a 1 al cargar la tienda/admin.

El orden importa: es el mismo orden EXACTO en que se cargaban los
<script> individuales en index.html/admin.html (dependencias entre
módulos: config → data → state → ... → patches al final).
NO edites tm-bundle.js a mano — edita los .src.js y deja que la GitHub
Action lo regenere (minify_js.py primero, este script después).
"""
import os
import re
from datetime import datetime

SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "js", "src")
OUT = os.path.join(os.path.dirname(__file__), "..", "js", "tm-bundle.js")
SW_PATH = os.path.join(os.path.dirname(__file__), "..", "sw.js")

# Orden EXACTO en que se cargaban en el <head> de index.html/admin.html.
ORDEN = [
    "tm-config.js",
    "tm-data.js",
    "tm-state.js",
    "tm-admin.js",
    "tm-product.js",
    "tm-catalog.js",
    "tm-init.js",
    "tm-ui.js",
    "tm-toast.js",
    "tm-iife.js",
    "tm-patches.js",
    "tm-agent.js",
]


def main():
    partes = ["/* TiendaMax tm-bundle.js — generado por scripts/build_js_bundle.py. "
              "NO editar a mano; edita js/src/*.src.js. */\n"]
    faltantes = []
    for nombre in ORDEN:
        ruta = os.path.join(SRC_DIR, nombre)
        if not os.path.exists(ruta):
            faltantes.append(nombre)
            continue
        with open(ruta, encoding="utf-8") as f:
            code = f.read()
        partes.append(code)
        if not code.endswith("\n"):
            partes.append("\n")
        partes.append(";\n")  # separador defensivo entre módulos minificados (evita ASI)
    if faltantes:
        print(f"❌ Faltan módulos: {', '.join(faltantes)}. No genero el bundle.")
        raise SystemExit(1)
    bundle = "".join(partes)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(bundle)
    print(f"✅ tm-bundle.js generado: {round(len(bundle.encode()) / 1024)} KB "
          f"({len(ORDEN)} módulos)")


def bump_sw_cache():
    """Auto-bump the Service Worker CACHE_NAME with a timestamp."""
    if not os.path.exists(SW_PATH):
        print("⚠️  sw.js no encontrado, no se bumpea el cache.")
        return
    with open(SW_PATH, encoding="utf-8") as f:
        sw = f.read()
    m = re.search(r"const CACHE_NAME = 'tiendamax-([^']+)';", sw)
    if not m:
        print("⚠️  No se encontró CACHE_NAME en sw.js, no se bumpea.")
        return
    timestamp = datetime.now().strftime("%Y%m%d%H%M")
    new_cache_name = f"tiendamax-{timestamp}"
    if m.group(1) == timestamp:
        print(f"ℹ️  SW cache ya actualizado: {new_cache_name}")
        return
    new_text = sw[:m.start()] + f"const CACHE_NAME = '{new_cache_name}';" + sw[m.end():]
    with open(SW_PATH, "w", encoding="utf-8") as f:
        f.write(new_text)
    print(f"✅ SW cache bumped to {new_cache_name}")


if __name__ == "__main__":
    main()
    bump_sw_cache()
