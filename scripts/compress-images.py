#!/usr/bin/env python3
"""
TiendaMax — Pipeline de compresión de imágenes.
Convierte todas las imágenes de public/imagenes/ a .webp con resize automático.
También genera versiones optimizadas (max 800px de ancho para productos, 1200px para banners).

Uso: python3 scripts/compress-images.py
"""
import os, sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow no instalado. Ejecuta: pip install Pillow")
    sys.exit(1)

IMAGES_DIR = Path("public/imagenes")
MAX_PRODUCT_WIDTH = 800    # px máximo para imágenes de producto
MAX_BANNER_WIDTH = 1200    # px máximo para banners
QUALITY = 82               # calidad webp (75-85 es óptimo para fotos)

def compress_image(filepath):
    """Convierte una imagen a .webp con resize."""
    ext = filepath.suffix.lower()
    if ext == '.webp':
        # Ya es webp, solo re-comprimir si es muy grande
        return None
    if ext not in ('.jpg', '.jpeg', '.png', '.bmp', '.tiff'):
        return None

    webp_path = filepath.with_suffix('.webp')
    if webp_path.exists():
        # Ya existe webp, skip
        return None

    try:
        img = Image.open(filepath)
        # Convertir a RGB si tiene alpha (webp soporta alpha pero para fotos es mejor RGB)
        if img.mode in ('RGBA', 'LA', 'P'):
            # Mantener alpha si la tiene (PNG con transparencia)
            pass
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Resize si es muy grande
        max_w = MAX_BANNER_WIDTH if 'banner' in filepath.name.lower() else MAX_PRODUCT_WIDTH
        if img.width > max_w:
            ratio = max_w / img.width
            new_size = (max_w, int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # Guardar como webp
        img.save(webp_path, 'WEBP', quality=QUALITY, method=6)

        # Comparar tamaños
        orig_size = filepath.stat().st_size
        webp_size = webp_path.stat().st_size
        savings = (1 - webp_size / orig_size) * 100 if orig_size > 0 else 0

        return {
            'original': filepath.name,
            'webp': webp_path.name,
            'orig_size': orig_size,
            'webp_size': webp_size,
            'savings': savings,
        }
    except Exception as e:
        return {'error': str(e), 'file': filepath.name}


def main():
    if not IMAGES_DIR.exists():
        print(f"ERROR: {IMAGES_DIR} no existe")
        sys.exit(1)

    images = list(IMAGES_DIR.glob('*'))
    converted = []
    errors = []
    skipped = 0

    for img_path in images:
        if img_path.suffix.lower() == '.webp':
            skipped += 1
            continue
        result = compress_image(img_path)
        if result is None:
            skipped += 1
        elif 'error' in result:
            errors.append(result)
        else:
            converted.append(result)

    print(f"\n{'='*50}")
    print(f"Pipeline de compresión de imágenes")
    print(f"{'='*50}")
    print(f"  Ya eran webp (skip): {skipped}")
    print(f"  Convertidas: {len(converted)}")
    print(f"  Errores: {len(errors)}")

    if converted:
        total_orig = sum(r['orig_size'] for r in converted)
        total_webp = sum(r['webp_size'] for r in converted)
        total_savings = (1 - total_webp / total_orig) * 100 if total_orig > 0 else 0
        print(f"\n  Ahorro total: {total_orig/1024:.0f}KB → {total_webp/1024:.0f}KB ({total_savings:.0f}% menos)")
        for r in converted[:10]:
            print(f"    ✅ {r['original']} → {r['webp']} ({r['orig_size']/1024:.0f}KB → {r['webp_size']/1024:.0f}KB, -{r['savings']:.0f}%)")
        if len(converted) > 10:
            print(f"    ... y {len(converted) - 10} más")

    if errors:
        print(f"\n  Errores:")
        for e in errors:
            print(f"    ❌ {e['file']}: {e['error']}")

    print(f"\n{'='*50}")
    print("✅ Done. Recuerda actualizar productos.json si cambiaron extensiones.")


if __name__ == "__main__":
    main()
