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
JS_DIR = os.path.join(os.path.dirname(__file__), "..", "js")
OUT = os.path.join(JS_DIR, "tm-bundle.js")
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
]

# Módulos que se minifican como el resto (js/src/) pero NO van en el bundle:
# se sirven como <script> aparte para bajar el peso del bundle crítico. El
# agente de chat (62 KB min) no hace falta para el primer render del catálogo
# —es un widget que el cliente abre a demanda— así que se separa a js/<nombre>
# y se carga con su propio <script defer> después del bundle. Sacarlo de aquí
# recorta ~62 KB de parseo del hilo principal en la carga inicial.
STANDALONE = {
    "tm-agent.js": os.path.join(JS_DIR, "tm-agent.js"),
}


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
    copiar_standalone()


def copiar_standalone():
    """Copia los módulos STANDALONE (minificados en js/src/) a js/<nombre> para
    servirlos como <script> aparte del bundle. Falla si falta la fuente: mejor
    romper el build que dejar el widget desplegado con una versión vieja."""
    for nombre, destino in STANDALONE.items():
        origen = os.path.join(SRC_DIR, nombre)
        if not os.path.exists(origen):
            print(f"❌ Falta el módulo standalone {nombre}. No lo copio.")
            raise SystemExit(1)
        with open(origen, encoding="utf-8") as f:
            code = f.read()
        with open(destino, "w", encoding="utf-8") as f:
            f.write(code)
        print(f"✅ standalone copiado: js/src/{nombre} → js/{nombre} "
              f"({round(len(code.encode()) / 1024)} KB)")


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
