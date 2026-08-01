#!/usr/bin/env python3
"""Borra de imagenes/ las fotos que ya no referencia nadie.

Cada vez que se reemplaza la foto de un producto, la anterior se queda en el
repo. El admin ya borra las que quita al guardar (borrarImagenDeGitHub en
js/src/tm-data.src.js), pero eso solo cubre lo que se haga de ahora en
adelante: lo acumulado antes hay que barrerlo de una vez.

Por defecto NO borra nada — solo informa. Hay que pasar --borrar a propósito.

    python3 scripts/limpiar_imagenes.py            # informe (no toca nada)
    python3 scripts/limpiar_imagenes.py --borrar   # borra de verdad

Qué cuenta como "en uso": cualquier mención del nombre del fichero en
productos.json, productos-lite.json, combos.json, banners.json, las páginas
estáticas de p/, el HTML de la tienda o el service worker. Se busca por nombre
de fichero, no por ruta, así que una referencia escrita de otra forma
(distinto dominio, ruta relativa) también cuenta — a propósito: es preferible
conservar de más que romper una imagen viva.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
IMG_DIR = RAIZ / "imagenes"
THUMB_DIR = IMG_DIR / "thumbs"

# Ficheros donde puede aparecer una referencia a una imagen.
FUENTES_FIJAS = [
    "productos.json", "productos-lite.json", "combos.json", "banners.json",
    "categorias.json", "index.html", "admin.html", "404.html", "sw.js",
    "manifest.json", "resenas-cache.json",
]
# c/ son las landings de categoría: también referencian imágenes, y se
# publican. Faltaban aquí, y por eso el dedupe reescribió un nombre en todas
# partes menos ahí y dejó la imagen rota en c/motos.html.
GLOBS = ["p/*.html", "c/*.html", "js/*.js", "js/src/*.src.js", "css/*.css"]

PATRON = re.compile(r"[\w.\-]+\.(?:webp|jpg|jpeg|png)", re.I)


def _rastrear(texto: str) -> set[str]:
    return set(PATRON.findall(texto))


def referencias() -> set[str]:
    """Todos los nombres de fichero de imagen mencionados en el repo."""
    usadas: set[str] = set()
    for nombre in FUENTES_FIJAS:
        f = RAIZ / nombre
        if f.exists():
            usadas |= _rastrear(f.read_text(encoding="utf-8", errors="ignore"))
    for patron in GLOBS:
        for f in RAIZ.glob(patron):
            usadas |= _rastrear(f.read_text(encoding="utf-8", errors="ignore"))
    return usadas


def imagenes_en_disco() -> list[Path]:
    if not IMG_DIR.is_dir():
        return []
    return sorted(p for p in IMG_DIR.iterdir()
                  if p.is_file() and p.suffix.lower() in {".webp", ".jpg", ".jpeg", ".png"})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--borrar", action="store_true",
                    help="borra de verdad (por defecto solo informa)")
    args = ap.parse_args()

    usadas = referencias()
    todas = imagenes_en_disco()
    if not todas:
        print("No hay imágenes en imagenes/ — nada que revisar.")
        return 0

    huerfanas = [p for p in todas if p.name not in usadas]
    bytes_muertos = 0
    for p in huerfanas:
        bytes_muertos += p.stat().st_size
        th = THUMB_DIR / p.name
        if th.exists():
            bytes_muertos += th.stat().st_size

    print(f"imágenes en imagenes/: {len(todas)}")
    print(f"referenciadas:         {len(todas) - len(huerfanas)}")
    print(f"sin usar:              {len(huerfanas)}  ({bytes_muertos // 1024} KB con sus miniaturas)")

    if not huerfanas:
        return 0

    if not args.borrar:
        print("\nPrimeras sin usar:")
        for p in huerfanas[:15]:
            print("   ", p.name)
        if len(huerfanas) > 15:
            print(f"    …y {len(huerfanas) - 15} más")
        print("\nNo se ha borrado nada. Para borrarlas de verdad:")
        print("    python3 scripts/limpiar_imagenes.py --borrar")
        return 0

    borradas = 0
    for p in huerfanas:
        for f in (p, THUMB_DIR / p.name):
            if f.exists():
                f.unlink()
                borradas += 1
    print(f"\n🧹 {borradas} fichero(s) borrados (originales + miniaturas).")
    print("   Siguen en el historial de git; el commit es lo que los saca del sitio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
