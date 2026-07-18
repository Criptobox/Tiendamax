#!/usr/bin/env python3
"""
TiendaMax — optimizador de imágenes.

Uso recomendado:
  python scripts/optimize_images.py --dry-run
  python scripts/optimize_images.py

Qué hace:
- Recorre imagenes/.
- Optimiza JPG/PNG en el lugar (con copia .bak opcional si usas --backup).
- Genera miniaturas WebP en imagenes/thumbs/ para uso futuro.
- No toca imágenes ya muy pequeñas si no mejora el peso.

Nota: el frontend actual sigue usando las imágenes originales. Las miniaturas
quedan listas para una siguiente fase donde las tarjetas usen thumbs WebP.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "imagenes"
THUMB_DIR = IMG_DIR / "thumbs"
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def fmt(n: int) -> str:
    return f"{n/1024:.1f} KB"


def save_optimized(img: Image.Image, src: Path, tmp: Path, quality: int) -> None:
    ext = src.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode in ("RGBA", "LA"):
            bg.paste(img, mask=img.getchannel("A"))
        else:
            bg = img.convert("RGB")
        bg.save(tmp, "JPEG", quality=quality, optimize=True, progressive=True)
    elif ext == ".png":
        img.save(tmp, "PNG", optimize=True)
    elif ext == ".webp":
        img.save(tmp, "WEBP", quality=quality, method=6)


def make_thumb(img: Image.Image, src: Path, dry_run: bool) -> tuple[Path, int]:
    THUMB_DIR.mkdir(exist_ok=True)
    thumb = ImageOps.contain(img.copy(), (420, 420), Image.LANCZOS)
    out = THUMB_DIR / (src.stem + ".webp")
    if not dry_run:
        thumb.save(out, "WEBP", quality=78, method=6)
    return out, out.stat().st_size if out.exists() else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Solo informa, no escribe cambios")
    ap.add_argument("--backup", action="store_true", help="Guarda copia .bak antes de reemplazar originales")
    ap.add_argument("--quality", type=int, default=82, help="Calidad JPG/WebP para originales")
    args = ap.parse_args()

    if not IMG_DIR.exists():
        raise SystemExit("No existe imagenes/")

    files = [p for p in IMG_DIR.iterdir() if p.is_file() and p.suffix.lower() in EXTS]
    total_before = total_after = saved = 0
    changed = 0
    thumbs = 0

    for src in files:
        before = src.stat().st_size
        total_before += before
        try:
            img = Image.open(src)
            img = ImageOps.exif_transpose(img).convert("RGBA")
        except Exception as e:
            print(f"SKIP {src.name}: {e}")
            total_after += before
            continue

        # Miniatura WebP lista para tarjetas futuras
        thumb_path, _ = make_thumb(img, src, args.dry_run)
        thumbs += 1

        tmp = src.with_suffix(src.suffix + ".opt")
        try:
            save_optimized(img, src, tmp, args.quality)
            after = tmp.stat().st_size
        except Exception as e:
            print(f"SKIP {src.name}: no se pudo optimizar ({e})")
            if tmp.exists(): tmp.unlink()
            total_after += before
            continue

        # Solo reemplazar si ahorra al menos 5% y 1KB
        if after < before * 0.95 and before - after > 1024:
            changed += 1
            saved += before - after
            total_after += after
            print(f"OK   {src.name}: {fmt(before)} → {fmt(after)} (-{fmt(before-after)}) thumb={thumb_path.name}")
            if not args.dry_run:
                if args.backup:
                    bak = src.with_suffix(src.suffix + ".bak")
                    if not bak.exists():
                        # Copia (no mueve): src queda intacto hasta el replace
                        # de abajo, así nunca hay una ventana sin backup Y sin
                        # original a la vez si el proceso se corta a mitad.
                        shutil.copy2(src, bak)
                # tmp.replace(src) es atómico (os.replace/rename): src nunca
                # deja de existir entre medio, a diferencia de unlink()+replace()
                # (que sí tenía una ventana real de pérdida si el proceso moría
                # justo ahí — SIGKILL, OOM, corte del runner de CI).
                tmp.replace(src)
            else:
                tmp.unlink(missing_ok=True)
        else:
            total_after += before
            print(f"KEEP {src.name}: {fmt(before)} (optimizado no mejora suficiente) thumb={thumb_path.name}")
            tmp.unlink(missing_ok=True)

    print("-" * 60)
    print(f"Imágenes revisadas: {len(files)}")
    print(f"Originales mejoradas: {changed}")
    print(f"Miniaturas WebP {'simuladas' if args.dry_run else 'generadas'}: {thumbs}")
    print(f"Ahorro estimado/aplicado: {fmt(saved)}")
    print(f"Total: {fmt(total_before)} → {fmt(total_after)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
