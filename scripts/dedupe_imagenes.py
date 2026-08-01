#!/usr/bin/env python3
"""Unifica las imágenes que son byte a byte idénticas.

Subir la misma foto a varios productos (o volver a subirla al reemplazarla)
crea un fichero nuevo cada vez, porque el nombre sale de Date.now(). El
contenido es el mismo pero ocupa sitio en cada clon del repo y en Pages.

Esto NO es lo mismo que scripts/limpiar_imagenes.py, que borra las que no
referencia nadie. Aquí las copias sobrantes SÍ están en uso: por eso hay que
reescribir las referencias a la copia que se conserva ANTES de borrarlas.

Por defecto no toca nada — hay que pasar --aplicar a propósito.

    python3 scripts/dedupe_imagenes.py            # informe
    python3 scripts/dedupe_imagenes.py --aplicar  # reescribe y borra

Cuál se conserva: la copia más referenciada del grupo (así se reescriben los
menos ficheros posibles); a igualdad, la de nombre menor, que al venir de
Date.now() es la más antigua — la original.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
IMG_DIR = RAIZ / "imagenes"
THUMB_DIR = IMG_DIR / "thumbs"

# Mismo conjunto que limpiar_imagenes.py: donde puede haber una referencia.
FUENTES_FIJAS = [
    "productos.json", "productos-lite.json", "combos.json", "banners.json",
    "categorias.json", "index.html", "admin.html", "404.html", "sw.js",
    "manifest.json", "resenas-cache.json",
]
GLOBS = ["p/*.html", "js/*.js", "js/src/*.src.js", "css/*.css"]

EXTS = {".webp", ".jpg", ".jpeg", ".png"}


def ficheros_texto() -> list[Path]:
    out = [RAIZ / n for n in FUENTES_FIJAS]
    for patron in GLOBS:
        out.extend(RAIZ.glob(patron))
    return [f for f in out if f.is_file()]


def imagenes_en_disco() -> list[Path]:
    if not IMG_DIR.is_dir():
        return []
    return sorted(p for p in IMG_DIR.iterdir()
                  if p.is_file() and p.suffix.lower() in EXTS)


def grupos_por_contenido(imgs: list[Path]) -> list[list[Path]]:
    por_hash: dict[str, list[Path]] = defaultdict(list)
    for p in imgs:
        por_hash[hashlib.md5(p.read_bytes()).hexdigest()].append(p)
    return [sorted(g, key=lambda x: x.name)
            for g in por_hash.values() if len(g) > 1]


def contar_referencias(nombres: set[str]) -> dict[str, int]:
    """Cuántas veces se menciona cada nombre de fichero en el repo."""
    cuenta = dict.fromkeys(nombres, 0)
    for f in ficheros_texto():
        texto = f.read_text(encoding="utf-8", errors="ignore")
        for n in nombres:
            if n in texto:
                cuenta[n] += texto.count(n)
    return cuenta


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true",
                    help="reescribe referencias y borra (por defecto solo informa)")
    args = ap.parse_args()

    imgs = imagenes_en_disco()
    if not imgs:
        print("No hay imágenes en imagenes/ — nada que revisar.")
        return 0

    grupos = grupos_por_contenido(imgs)
    if not grupos:
        print(f"{len(imgs)} imágenes, ninguna duplicada. Nada que hacer.")
        return 0

    todos = {p.name for g in grupos for p in g}
    refs = contar_referencias(todos)

    # nombre sobrante -> nombre que se conserva
    renombres: dict[str, str] = {}
    bytes_liberados = 0
    for g in grupos:
        canon = max(g, key=lambda p: (refs[p.name], [-ord(c) for c in p.name]))
        for p in g:
            if p is canon:
                continue
            renombres[p.name] = canon.name
            bytes_liberados += p.stat().st_size
            th = THUMB_DIR / p.name
            if th.exists():
                bytes_liberados += th.stat().st_size

    print(f"imágenes en imagenes/:   {len(imgs)}")
    print(f"grupos duplicados:       {len(grupos)}")
    print(f"copias sobrantes:        {len(renombres)}  "
          f"({bytes_liberados // 1024} KB con sus miniaturas)")

    if not args.aplicar:
        print("\nEjemplos (sobrante → se conserva):")
        for viejo, nuevo in list(renombres.items())[:12]:
            print(f"    {viejo} → {nuevo}  ({refs[viejo]} referencia(s))")
        if len(renombres) > 12:
            print(f"    …y {len(renombres) - 12} más")
        print("\nNo se ha tocado nada. Para aplicarlo de verdad:")
        print("    python3 scripts/dedupe_imagenes.py --aplicar")
        return 0

    # 1) Reescribir referencias ANTES de borrar: si se borrara primero y algo
    # fallara aquí, quedarían productos apuntando a una imagen inexistente.
    patron = re.compile("|".join(re.escape(k) for k in sorted(renombres, key=len, reverse=True)))
    tocados = 0
    for f in ficheros_texto():
        texto = f.read_text(encoding="utf-8", errors="ignore")
        nuevo = patron.sub(lambda m: renombres[m.group(0)], texto)
        if nuevo != texto:
            f.write_text(nuevo, encoding="utf-8")
            tocados += 1

    # 2) Ahora sí, borrar las copias sobrantes y sus miniaturas.
    borrados = 0
    for viejo in renombres:
        for f in (IMG_DIR / viejo, THUMB_DIR / viejo):
            if f.exists():
                f.unlink()
                borrados += 1

    print(f"\n✏️  {tocados} fichero(s) de texto actualizados.")
    print(f"🧹 {borrados} fichero(s) de imagen borrados (copias + miniaturas).")
    print("   Siguen en el historial de git; el commit es lo que los saca del sitio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
