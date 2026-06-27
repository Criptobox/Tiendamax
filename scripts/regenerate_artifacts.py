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
import urllib.parse
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
<link rel="canonical" href="{page_url}">

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

<!-- ═══ JSON-LD para Google ═══ -->
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": {json_name},
  "description": {json_desc},
  "image": {json_img},
  "url": "{page_url}",
  "sku": "{sku}",
  "category": {json_category},
  "itemCondition": "{condition}",
  "brand": {{"@type": "Brand", "name": "TiendaMax"}},
  "offers": {{
    "@type": "Offer",
    "price": "{price}",
    "priceCurrency": "USD",
    "availability": "{availability}",
    "itemCondition": "{condition}",
    "url": "{page_url}",
    "seller": {{"@type": "Organization", "name": "TiendaMax"}},
    "areaServed": {{"@type": "Country", "name": "Cuba"}}
  }}
}}
</script>

<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0C0806;color:#fff;min-height:100vh}}
  a{{color:inherit;text-decoration:none}}
  .tm-hdr{{display:flex;align-items:center;padding:14px 20px;background:#0D0806;border-bottom:1px solid rgba(201,169,110,.15)}}
  .tm-logo{{font-size:20px;font-weight:800;letter-spacing:-.5px}}
  .tm-logo .t{{color:#C9A96E}}.tm-logo .m{{color:#FF6B35}}
  .tm-back{{margin-left:auto;font-size:13px;color:#C9A96E;border:1px solid rgba(201,169,110,.3);padding:6px 14px;border-radius:20px;white-space:nowrap}}
  .tm-wrap{{max-width:900px;margin:0 auto;padding:28px 16px 60px;display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:start}}
  @media(max-width:640px){{.tm-wrap{{grid-template-columns:1fr;gap:20px}}}}
  .tm-img{{border-radius:16px;overflow:hidden;background:#1a1410;aspect-ratio:1/1}}
  .tm-img img{{width:100%;height:100%;object-fit:cover;display:block}}
  .tm-cat{{display:inline-block;background:#FF6B35;color:#fff;font-size:11px;font-weight:700;letter-spacing:.5px;padding:4px 12px;border-radius:20px;margin-bottom:14px;text-transform:uppercase}}
  h1{{font-size:clamp(20px,4vw,26px);font-weight:800;line-height:1.25;margin-bottom:18px}}
  .tm-prices{{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:18px}}
  .tm-price{{font-size:30px;font-weight:800;color:#FF6B35}}
  .tm-orig{{font-size:17px;color:#666;text-decoration:line-through}}
  .tm-badge{{background:rgba(255,107,53,.15);color:#FF6B35;border:1px solid rgba(255,107,53,.3);font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px}}
  .tm-desc{{font-size:14px;line-height:1.75;color:#a09080;margin-bottom:22px;white-space:pre-line}}
  .tm-stok-y{{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#4ade80;margin-bottom:22px}}
  .tm-stok-y::before{{content:'';width:8px;height:8px;border-radius:50%;background:#4ade80;flex-shrink:0}}
  .tm-stok-n{{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#888;margin-bottom:22px}}
  .tm-stok-n::before{{content:'';width:8px;height:8px;border-radius:50%;background:#666;flex-shrink:0}}
  .tm-actions{{display:flex;flex-direction:column;gap:12px}}
  .tm-btn{{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 20px;border-radius:12px;font-size:15px;font-weight:700;transition:opacity .2s}}
  .tm-btn:hover{{opacity:.85}}
  .tm-btn-p{{background:linear-gradient(135deg,#FF6B35,#E8501E);color:#fff}}
  .tm-btn-w{{background:#25D366;color:#fff}}
  .tm-ftr{{text-align:center;padding:24px 16px;color:#555;font-size:12px;border-top:1px solid rgba(255,255,255,.06)}}
  .tm-ftr a{{color:#C9A96E}}
</style>
</head>
<body>

<header class="tm-hdr">
  <a href="https://tiendamax.org" class="tm-logo"><span class="t">TIENDA</span><span class="m">MAX</span></a>
  <a href="https://tiendamax.org" class="tm-back">← Ver catálogo</a>
</header>

<div class="tm-wrap">
  <div class="tm-img">
    <img src="{image}" alt="{html_name}" loading="lazy">
  </div>
  <div>
    {cat_html}
    <h1>{html_name}</h1>
    <div class="tm-prices">
      <span class="tm-price">${price} USD</span>
      {precio_orig_html}
      {pct_desc_html}
    </div>
    <p class="tm-desc">{desc_full}</p>
    {stock_html}
    <div class="tm-actions">
      <a href="{app_url}" class="tm-btn tm-btn-p">🛍️ Ver en TiendaMax</a>
      <a href="{wa_link}" class="tm-btn tm-btn-w" target="_blank" rel="noopener noreferrer">💬 Pedir por WhatsApp</a>
    </div>
  </div>
</div>

<footer class="tm-ftr">
  <a href="https://tiendamax.org">tiendamax.org</a> &middot; Todos los derechos reservados
</footer>

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


def regenerate_pages(products: list[dict], wa_num: str = "5354320170") -> tuple[int, list[str]]:
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
        img   = raw_img
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
        json_desc = json.dumps(desc_short(p.get("descripcion") or "", 500))
        json_img  = json.dumps(img)
        availability = (
            "https://schema.org/InStock"
            if stock > 0
            else "https://schema.org/OutOfStock"
        )

        page_url = f"{SITE}/p/producto-{pid}.html"
        app_url  = f"{SITE}/?producto={pid}#producto-{pid}"
        title    = escape(p.get("seoTitle") or f"{name} — ${price} USD | TiendaMax")

        # ── Variables nuevas para la página de producto real ────────────────
        cat = (p.get("categoria") or "").strip()
        cat_html = f'<span class="tm-cat">{escape(cat)}</span>' if cat else ""
        json_category = json.dumps(cat or "General")
        condition = "https://schema.org/UsedCondition" if p.get("usado") else "https://schema.org/NewCondition"

        desc_raw  = (p.get("descripcion") or "").strip()
        desc_full = escape(desc_raw)

        precio_act  = float(p.get("precioActual") or 0)
        precio_orig = float(p.get("precioOriginal") or 0)
        if precio_orig > precio_act > 0:
            pct = round((precio_orig - precio_act) / precio_orig * 100)
            precio_orig_html = f'<span class="tm-orig">${precio_orig:.2f} USD</span>'
            pct_desc_html    = f'<span class="tm-badge">-{pct}%</span>'
        else:
            precio_orig_html = ""
            pct_desc_html    = ""

        if stock > 0:
            stock_html = f'<div class="tm-stok-y">En stock ({stock} disponible{"s" if stock != 1 else ""})</div>'
        else:
            stock_html = '<div class="tm-stok-n">Agotado</div>'

        wa_msg  = urllib.parse.quote(f"Hola, me interesa: {name}. {page_url}")
        wa_link = f"https://wa.me/{wa_num}?text={wa_msg}"

        html = PAGE_TEMPLATE.format(
            title=title,
            html_name=html_name,
            og_title=og_title,
            og_desc=og_desc,
            image=image,
            keywords=keywords,
            page_url=page_url,
            app_url=app_url,
            price=price,
            json_name=json_name,
            json_desc=json_desc,
            json_img=json_img,
            availability=availability,
            sku=pid,
            json_category=json_category,
            condition=condition,
            cat_html=cat_html,
            desc_full=desc_full,
            precio_orig_html=precio_orig_html,
            pct_desc_html=pct_desc_html,
            stock_html=stock_html,
            wa_link=wa_link,
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

    config = read_json(CONF, {})
    wa_num = str(
        config.get("whatsapp") or config.get("telefono") or
        config.get("numeroWhatsApp") or "5354320170"
    ).replace("+", "").replace(" ", "").replace("-", "")

    n_written, removed = regenerate_pages(products, wa_num)
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
