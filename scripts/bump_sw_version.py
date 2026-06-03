#!/usr/bin/env python3
"""
TiendaMax — bump automático del Service Worker.

Uso:
  python scripts/bump_sw_version.py
  python scripts/bump_sw_version.py --note "Galería y dashboard"

Qué hace:
- Busca CACHE_NAME = 'tiendamax-vNNN' en sw.js.
- Sube NNN + 1.
- Actualiza/inyecta una línea de comentario vNNN para dejar trazabilidad.

Esto evita olvidar actualizar el SW cuando cambian HTML/CSS/JS.
"""
from __future__ import annotations

import argparse
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SW_PATH = ROOT / "sw.js"

CACHE_RE = re.compile(r"const\s+CACHE_NAME\s*=\s*['\"]tiendamax-v(\d+)['\"]\s*;")
TITLE_RE = re.compile(r"//\s*TiendaMax\s+—\s+Service Worker v\d+.*")


def main() -> int:
    parser = argparse.ArgumentParser(description="Incrementa la versión del Service Worker de TiendaMax")
    parser.add_argument("--note", default="actualización de assets", help="Nota breve para el comentario del SW")
    args = parser.parse_args()

    text = SW_PATH.read_text(encoding="utf-8")
    m = CACHE_RE.search(text)
    if not m:
        raise SystemExit("No encontré CACHE_NAME = 'tiendamax-vNNN' en sw.js")

    old = int(m.group(1))
    new = old + 1
    note = args.note.strip() or "actualización de assets"

    text = CACHE_RE.sub(f"const CACHE_NAME = 'tiendamax-v{new}';", text, count=1)

    # Actualizar título si existe
    title = f"// TiendaMax — Service Worker v{new} ({note})"
    if TITLE_RE.search(text):
        text = TITLE_RE.sub(title, text, count=1)
    else:
        text = title + "\n" + text

    # Insertar una línea de historial debajo del título si no está
    history = f"// v{new}: {note}."
    lines = text.splitlines()
    if len(lines) >= 2 and history not in text:
        lines.insert(2, history)
        text = "\n".join(lines) + "\n"

    SW_PATH.write_text(text, encoding="utf-8")
    print(f"sw.js: tiendamax-v{old} → tiendamax-v{new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
