#!/usr/bin/env python3
"""
Regenera artefactos derivados de productos.json:
  1) /p/producto-<id>.html  (páginas estáticas para previews ricas en WhatsApp/Facebook)
  2) sitemap.xml            (con todas las URLs actuales)
  3) subcategorias.json     (fusiona el manual con las subcategorías reales en productos)
  4) comisiones.json        (elimina IDs huérfanos)

Idempotente: se puede ejecutar siempre y solo escribe si hay cambios reales.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROD = ROOT / "productos.json"
CONF = ROOT / "config.json"
COMM = ROOT / "comisiones.json"
SUBS = ROOT / "subcategorias.json"
CATS = ROOT / "categorias.json"
P_DIR = ROOT / "p"
SITEMAP = ROOT / "sitemap.xml"

SITE = "https://tiendamax.org"

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{og_desc}">
<meta name="keywords" content="{keywords}">
<meta name="robots" content="index, follow">

<!-- ═══ Open Graph (WhatsApp, Facebook, Instagram) ═══ -->
<meta property="og:type" content="product">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{og_desc}">
<meta property="og:image" content="{image}">
<meta property="og:image:secure_url" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="{og_title}">
<meta property="og:url" content="{page_url}">
<meta property="og:site_name" content="TiendaMax">
<meta property="product:price:amount" content="{price}">
<meta property="product:price:currency" content="USD">
<meta property="og:locale" content="es_CU">

<!-- ═══ Twitter Card ═══ -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{og_title}">
<meta name="twitter:description" content="{og_desc}">
<meta name="twitter:image" content="{image}">
<meta name="twitter:image:alt" content="{og_title}">

<!-- ═══ Redireccionar al usuario a la app (1s da tiempo al crawler) ═══ -->
<meta http-equiv="refresh" content="1;url={app_url}">
<link rel="canonical" href="{page_url}">

<!-- ═══ JSON-LD para Google ═══ -->
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": {json_name},
  "description": {json_desc},
  "image": {json_img},
  "url": "{page_url}",
  "brand": {{"@type": "Brand", "name": "TiendaMax"}},
  "offers": {{
    "@type": "Offer",
    "price": "{price}",
    "priceCurrency": "USD",
    "availability": "{availability}",
    "url": "{page_url}",
    "seller": {{"@type": "Organization", "name": "TiendaMax"}}
  }}
}}
</script>

<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0D0D0D;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
  }}
  .loader {{ padding: 40px; max-width: 420px; }}
  .loader h2 {{ color: #C9A96E; font-size: 18px; margin-bottom: 8px; }}
  .price  {{ color: #FF6B35; font-size: 22px; font-weight: 700; margin-bottom: 8px; }}
  .desc   {{ color: #888; font-size: 13px; line-height: 1.5; margin-bottom: 20px; }}
  .loader a  {{
    display: inline-block;
    background: linear-gradient(135deg, #FF6B35, #E8501E);
    color: #fff;
    text-decoration: none;
    padding: 12px 28px;
    border-radius: 50px;
    font-weight: 600;
    font-size: 14px;
  }}
  .spinner {{
    width: 36px; height: 36px;
    border: 3px solid rgba(201,169,110,0.2);
    border-top-color: #C9A96E;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 20px;
  }}
  @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
</style>
</head>
<body>
<div class="loader">
  <div class="spinner"></div>
  <h2>{html_name}</h2>
  <p class="price">${price} USD</p>
  <p class="desc">{og_desc}</p>
  <a href="{app_url}">Abrir en TiendaMax</a>
</div>
<script>
  // Espera breve: los crawlers alcanzan a leer OpenGraph antes de redirigir.
  setTimeout(function(){{ window.location.replace('{app_url_js}'); }}, 900);
</script>
</body>
</html>
"""


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"⚠️ Error leyendo {path}: {e}", file=sys.stderr)
        return default


def _atomic_write(path: Path, content: str):
    """Escribe content en path de forma atómica usando un archivo temporal."""
    tmp = path.parent / f".{path.name}.tmp"
    try:
        tmp.write_text(content, encoding="utf-8")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def write_json(path: Path, data):
    new = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    old = path.read_text(encoding="utf-8") if path.exists() else ""
    if new != old:
        _atomic_write(path, new)
        print(f"✏️  Actualizado: {path.relative_to(ROOT)}")
        return True
    return False


def write_text(path: Path, content: str):
    old = path.read_text(encoding="utf-8") if path.exists() else ""
    if content != old:
        _atomic_write(path, content)
        print(f"✏️  Actualizado: {path.relative_to(ROOT)}")
        return True
    return False


def desc_short(s: str, n: int = 200) -> str:
    s = (s or "").replace("\n", " ").replace("\r", " ").strip()
    s = re.sub(r"\s+", " ", s)
    if len(s) > n:
        s = s[: n - 1].rstrip() + "…"
    return s


def regenerate_pages(products: list[dict]) -> tuple[int, list[str]]:
    """Crea/actualiza páginas /p/ y borra las huérfanas."""
    P_DIR.mkdir(exist_ok=True)
    written = 0
    valid_files = set()

    for p in products:
        pid = p.get("id")
        if not pid:
            continue
        name  = (p.get("nombre") or "").strip()
        desc  = desc_short(p.get("seoDescription") or p.get("descripcion") or "", 155 if p.get("seoDescription") else 200)
        price = f"{float(p.get('precioActual') or 0):.2f}"
        raw_img = p.get("imagen") or f"{SITE}/og-image.jpg"
        # WhatsApp/Facebook cargan más fiable JPG/PNG que WEBP en og:image.
        # Si el producto está en WEBP, usar imagen general JPG para que al menos haya preview.
        img   = f"{SITE}/og-image.jpg" if str(raw_img).lower().endswith('.webp') else raw_img
        stock = int(p.get("stock") or 0)
        seo_title_raw = (p.get("seoTitle") or f"{name} — ${price} USD").strip()
        seo_keywords = p.get("seoKeywords") or []
        if isinstance(seo_keywords, str):
            seo_keywords = [x.strip() for x in seo_keywords.split(",") if x.strip()]
        keywords_raw = ", ".join(dict.fromkeys([*seo_keywords, name, p.get("categoria") or "", "TiendaMax", "Cuba"]))

        # Sanitización: HTML escape para todo lo inyectado en HTML
        html_name = escape(name)
        og_title  = escape(seo_title_raw)
        og_desc   = escape(desc)
        image     = escape(img, quote=True)
        keywords  = escape(keywords_raw, quote=True)

        # JSON-LD: json.dumps produce strings correctamente escapadas para JSON
        json_name = json.dumps(name)
        json_desc = json.dumps(desc)
        json_img  = json.dumps(img)
        availability = (
            "https://schema.org/InStock"
            if stock > 0
            else "https://schema.org/OutOfStock"
        )

        page_url  = f"{SITE}/p/producto-{pid}.html"
        # Query + hash: query ayuda a navegadores in-app; hash mantiene compatibilidad SPA.
        app_url   = f"{SITE}/?producto={pid}#producto-{pid}"
        app_url_js = app_url.replace("'", "\\'")
        title = escape(p.get("seoTitle") or f"{name} — ${price} USD | TiendaMax")

        html = PAGE_TEMPLATE.format(
            title=title,
            html_name=html_name,
            og_title=og_title,
            og_desc=og_desc,
            image=image,
            keywords=keywords,
            page_url=page_url,
            app_url=app_url,
            app_url_js=app_url_js,
            price=price,
            json_name=json_name,
            json_desc=json_desc,
            json_img=json_img,
            availability=availability,
        )

        fp = P_DIR / f"producto-{pid}.html"
        valid_files.add(fp.name)
        if write_text(fp, html):
            written += 1

    # Borrar huérfanos
    removed = []
    for fname in os.listdir(P_DIR):
        if fname.startswith("producto-") and fname.endswith(".html") and fname not in valid_files:
            (P_DIR / fname).unlink(missing_ok=True)
            removed.append(fname)
            print(f"🗑️  Borrado huérfano: p/{fname}")

    return written, removed


def regenerate_sitemap(products: list[dict]) -> bool:
    today = date.today().isoformat()
    urls = [(f"{SITE}/", "daily", "1.0")]
    for p in products:
        pid = p.get("id")
        if pid:
            stock = int(p.get("stock") or 0)
            prio = "0.8" if stock > 0 else "0.5"
            urls.append((f"{SITE}/p/producto-{pid}.html", "weekly", prio))

    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, freq, prio in urls:
        xml.append("  <url>")
        xml.append(f"    <loc>{loc}</loc>")
        xml.append(f"    <lastmod>{today}</lastmod>")
        xml.append(f"    <changefreq>{freq}</changefreq>")
        xml.append(f"    <priority>{prio}</priority>")
        xml.append("  </url>")
    xml.append("</urlset>")
    xml.append("")
    return write_text(SITEMAP, "\n".join(xml))


def regenerate_subcategorias(products: list[dict], manual: dict) -> bool:
    """
    Fusiona subcategorías declaradas manualmente con las que aparecen
    realmente en productos.json. Así no quedan subcategorías inaccesibles.
    """
    out = {}
    # Categorías declaradas (preserva orden manual)
    for cat, subs in (manual or {}).items():
        out[cat] = list(subs or [])

    for p in products:
        cat = (p.get("categoria") or "").strip()
        sub = (p.get("subcategoria") or "").strip()
        if not cat:
            continue
        if cat not in out:
            out[cat] = []
        if sub and sub not in out[cat] and sub.lower() != "todas":
            out[cat].append(sub)

    return write_json(SUBS, out)


def cleanup_comisiones(products: list[dict], comm: dict) -> bool:
    if not isinstance(comm, dict):
        return False
    ids_validos = {str(p.get("id")) for p in products if p.get("id") is not None}
    nuevo = {k: v for k, v in comm.items() if k in ids_validos}
    if nuevo != comm:
        return write_json(COMM, nuevo)
    return False


def main() -> int:
    products = read_json(PROD, None)
    if not isinstance(products, list):
        print("❌ productos.json no es una lista o no pudo leerse", file=sys.stderr)
        return 1
    if len(products) == 0:
        # Podría ser corrupción silenciosa; abortar para no borrar todas las páginas
        print("⚠️  productos.json está vacío — abortando para evitar borrado masivo de /p/", file=sys.stderr)
        return 1

    print(f"📦 {len(products)} productos cargados")

    n_written, removed = regenerate_pages(products)
    print(f"   Páginas /p/ actualizadas: {n_written}, borradas: {len(removed)}")

    if regenerate_sitemap(products):
        print("   sitemap.xml actualizado")

    manual_subs = read_json(SUBS, {})
    if regenerate_subcategorias(products, manual_subs):
        print("   subcategorias.json actualizado")

    comm = read_json(COMM, {})
    if cleanup_comisiones(products, comm):
        print("   comisiones.json limpiado")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
