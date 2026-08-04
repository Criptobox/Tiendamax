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
    # tm-iconos va primero: declara `const TM_ICONOS`, que tm-data consulta
    # desde obtenerIconoCategoriaSVG. Con `const` hay zona muerta temporal,
    # así que el módulo que lo declara tiene que ejecutarse antes.
    "tm-iconos.js",
    "tm-config.js",
    "tm-data.js",
    "tm-state.js",
    "tm-admin.js",
    # Seguimiento post-venta (funciones puras). Va junto a tm-admin porque solo
    # lo usa el panel; no colisiona con nada, así que el sitio no lo nota.
    "tm-crm.js",
    "tm-product.js",
    "tm-catalog.js",
    # Va después de tm-catalog porque copiarParaFacebook/Revolico llaman a
    # tmRegistrarPublicacion; como son funciones (se elevan), el orden no es
    # crítico, pero mantenerlo aquí deja el módulo junto a quien lo usa.
    "tm-publicar.js",
    "tm-init.js",
    "tm-ui.js",
    "tm-toast.js",
    "tm-iife.js",
    "tm-patches.js",
]

# Módulos que se minifican como el resto (js/src/) pero NO van en el bundle:
# se sirven como <script> aparte para bajar el peso del bundle crítico. Un
# widget que el cliente abre a demanda no hace falta para el primer render del
# catálogo, así que se separa a js/<nombre> y se carga con su propio
# <script defer> después del bundle.
STANDALONE = {
    # Bot "Max": la cáscara (burbuja + panel) va como <script defer> en
    # index.html, y el cerebro NI SIQUIERA eso — la cáscara lo inyecta la
    # primera vez que alguien abre el chat. Son ~90 KB de base de
    # conocimiento que no tiene sentido bajarle a quien solo mira el
    # catálogo desde un móvil en 3G.
    "tm-bot.js": os.path.join(JS_DIR, "tm-bot.js"),
    "tm-bot-cerebro.js": os.path.join(JS_DIR, "tm-bot-cerebro.js"),
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
