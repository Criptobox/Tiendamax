#!/usr/bin/env python3
"""
TiendaMax — build_css.py
Une los CSS fuente en uno solo (css/bundle.css) en el ORDEN del <head>.
El orden importa: define la cascada. NO edites bundle.css a mano —
edita los archivos fuente de abajo y deja que la GitHub Action lo regenere
y lo minifique (con csso).
"""
import os
import re
from datetime import datetime

CSS_DIR = os.path.join(os.path.dirname(__file__), "..", "css")
SW_PATH = os.path.join(os.path.dirname(__file__), "..", "sw.js")

# Orden EXACTO en que se cargaban en el <head>. No cambiar sin querer.
ORDEN = [
    "styles.css",
    "animations.css",
    "styles.banner.fix.css",
    "nuevo-diseno.css",    # diseño principal v2 — antes de fixes para que puedan sobreescribirlo
    "styles.fixes.css",
    "premium-theme.css",   # tema oscuro — va casi al final
    "light-mode.css",      # overrides modo claro — DESPUÉS del premium
    "tienda-plus.css",
    "hero-efectos.css",
    "rediseno-cards.css",  # tarjetas póster + cantidad en modal — al final para ganar la cascada
    "modal-v4.css",        # rediseño premium v4 del modal de detalle — el ÚLTIMO, gana todo
]

def main():
    partes = ["/* TiendaMax bundle.css — generado por scripts/build_css.py. "
              "NO editar a mano; edita los CSS fuente. */\n"]
    for nombre in ORDEN:
        ruta = os.path.join(CSS_DIR, nombre)
        if not os.path.exists(ruta):
            print(f"⚠️  No existe {nombre}, lo salto.")
            continue
        with open(ruta, encoding="utf-8") as f:
            css = f.read()
        partes.append(f"\n/* ===== {nombre} ===== */\n")
        partes.append(css)
        if not css.endswith("\n"):
            partes.append("\n")
    bundle = "".join(partes)
    salida = os.path.join(CSS_DIR, "bundle.css")
    with open(salida, "w", encoding="utf-8") as f:
        f.write(bundle)
    print(f"✅ bundle.css generado: {round(len(bundle.encode())/1024)} KB (sin minificar)")

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
