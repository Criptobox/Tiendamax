#!/usr/bin/env python3
"""Sincroniza el cache-busting (?v=...) de los HTML con el contenido real de cada asset.

Problema que resuelve: las versiones ?v= estaban a mano y se desincronizaban entre
index.html y admin.html (p. ej. admin servía script.js?v=66 mientras index usaba ?v=67),
sirviendo JS/CSS viejo desde caché.

Solución: para cada referencia  href/src="ruta?v=ALGO"  a un archivo .js/.css que exista
en el repo, se reemplaza ALGO por los primeros 8 caracteres del hash SHA-256 del archivo.
Así, si el contenido no cambia, la versión no cambia (caché estable); si cambia, el ?v=
cambia automáticamente en TODOS los HTML a la vez.

Uso:
    python scripts/bump_versions.py            # aplica cambios
    python scripts/bump_versions.py --check    # solo verifica (exit 1 si hay desfase)
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = ["index.html", "admin.html", "404.html"]

# Captura: (atributo)="(ruta .js o .css)?v=(version)"
PATTERN = re.compile(r'(href|src)="([^"?]+\.(?:js|css))\?v=([^"]*)"')


def asset_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def process(html_path: Path, check: bool) -> int:
    text = html_path.read_text(encoding="utf-8")
    changes = 0

    def repl(m: re.Match) -> str:
        nonlocal changes
        attr, rel, old = m.group(1), m.group(2), m.group(3)
        asset = (ROOT / rel).resolve()
        if not asset.exists():
            return m.group(0)  # no tocar rutas externas o inexistentes
        new = asset_hash(asset)
        if new != old:
            changes += 1
        return f'{attr}="{rel}?v={new}"'

    new_text = PATTERN.sub(repl, text)
    if changes and not check:
        html_path.write_text(new_text, encoding="utf-8")
    return changes


def main() -> int:
    check = "--check" in sys.argv
    total = 0
    for name in HTML_FILES:
        p = ROOT / name
        if not p.exists():
            continue
        n = process(p, check)
        total += n
        if n:
            estado = "desfasadas" if check else "actualizadas"
            print(f"{name}: {n} versión(es) {estado}")
        else:
            print(f"{name}: ya sincronizado")
    if check and total:
        print(f"\n❌ {total} referencia(s) ?v= desfasadas. Ejecuta: python scripts/bump_versions.py")
        return 1
    if not check:
        print(f"\n✅ Listo. {total} referencia(s) actualizada(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
