#!/usr/bin/env python3
"""
Regenera artefactos derivados de productos.json:
  1) /p/<slug>.html  (fichas estáticas para previews ricas en WhatsApp/Facebook;
     /p/producto-<id>.html queda como salto a la nueva dirección)
  2) /c/<slug>.html         (páginas estáticas por categoría, indexables por Google —
                             hoy las categorías solo existen como #hash en la SPA)
  3) sitemap.xml            (con todas las URLs actuales, incluidas las de /c/)
  4) subcategorias.json     (fusiona el manual con las subcategorías reales en productos)
  5) comisiones.json        (elimina IDs huérfanos)

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

import categorias_apagadas
from ficha_url import slug_valido
from fill_seo import nombre_titulo, seo_title as _seo_title_de

ROOT = Path(__file__).resolve().parents[1]
PROD = ROOT / "productos.json"
CONF = ROOT / "config.json"
COMM = ROOT / "comisiones.json"
SUBS = ROOT / "subcategorias.json"
CATS = ROOT / "categorias.json"
RESENAS = ROOT / "resenas-cache.json"
P_DIR = ROOT / "p"
C_DIR = ROOT / "c"
OG_MANIFEST = ROOT / "og" / "manifiesto.json"
SITEMAP = ROOT / "sitemap.xml"
INDEX = ROOT / "index.html"

SITE = "https://tiendamax.org"


# ── Direcciones de las fichas: /p/<nombre-corto> ─────────────────────────────
# En Facebook la dirección se lee entera en el texto del post, y
# "producto-1784403677390.html" no dice nada. Cada producto lleva un `slug`
# (máx. SLUG_MAX, lo propone el panel con marca y modelo) y su ficha se
# publica en p/<slug>.html, que GitHub Pages sirve también sin el .html.
#
# Las direcciones viejas NO se rompen: p/producto-<id>.html y cada nombre
# anterior (`slugsAnteriores`, al cambiarlo en el panel) quedan como una
# página mínima con las mismas etiquetas de vista previa y un salto a la
# nueva que conserva ?c=/&g=, o se perdería la medición de lo ya publicado.
# Sin slug válido, la ficha sigue en producto-<id>.html como siempre.
# slug_valido vive en ficha_url.py, compartido con el bot y el pack diario.
_RUTAS: dict[str, str] = {}      # id → slug en uso


def preparar_rutas(products: list[dict]) -> dict[str, list[str]]:
    """Fija el slug de cada producto (el primero que lo reclama gana; uno
    repetido o mal formado se queda en producto-<id>) y devuelve los nombres
    anteriores que siguen libres, para redirigirlos."""
    _RUTAS.clear()
    usados: set[str] = set()
    for p in products:
        pid, s = str(p.get("id") or ""), p.get("slug")
        if pid and slug_valido(s) and s not in usados:
            _RUTAS[pid] = s
            usados.add(s)
    viejos: dict[str, list[str]] = {}
    for p in products:
        pid = str(p.get("id") or "")
        for s in p.get("slugsAnteriores") or []:
            if pid and slug_valido(s) and s not in usados:
                viejos.setdefault(pid, []).append(s)
                usados.add(s)
    return viejos


def url_producto(p: dict) -> str:
    pid = str(p.get("id") or "")
    s = _RUTAS.get(pid)
    return f"{SITE}/p/{s}" if s else f"{SITE}/p/producto-{pid}.html"


# Mismo criterio que EMOJI en build_og_images.py (no se importa: arrastraría
# Pillow a un script que no lo necesita).
_EMOJI = re.compile(r"[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D\u2B00-\u2BFF\u2190-\u21FF\u2900-\u297F\u3030\u303D]")


def nombre_limpio(nombre: str) -> str:
    return re.sub(r"\s+", " ", _EMOJI.sub(" ", nombre or "")).strip()


def precio_texto(p: dict) -> str:
    """"$140 USD" / "280 MN": la moneda va siempre, y un producto marcado
    moneda:'MN' lleva su precio tal cual — leerlo como dólares es el error
    de la Linterna."""
    v = float(p.get("precioActual") or 0)
    n = str(int(v)) if v == int(v) else f"{v:.2f}"
    return f"{n} MN" if p.get("moneda") == "MN" else f"${n} USD"


def titulo_seo(p: dict) -> str:
    """El seoTitle guardado, salvo que ya no hable de este producto.

    Se quedaban viejos al renombrar: el timbre se titulaba «PROTEGE TU
    HOGAR» y una CPE «EL ENRUTADOR WIFI DE 1.150MBPS», porque el panel no
    toca seoTitle y al subir se recupera el del repo. Si no contiene el
    comienzo del nombre actual, se rehace desde el nombre (fill_seo.py)."""
    guardado = (p.get("seoTitle") or "").strip()
    nombre = nombre_titulo(p.get("nombre") or "")
    if guardado and nombre[:20].lower() in guardado.lower():
        return guardado
    return _seo_title_de(p) if nombre else guardado


def es_mn(p: dict) -> bool:
    return p.get("moneda") == "MN"


def es_digital(p: dict) -> bool:
    """Tarjeta regalo o recarga (categoría TARJETAS, ver tm-digital.src.js):
    tiene importes, se cobra en USDT o USD —nunca en MN— y se paga antes."""
    return bool(p.get("digital")) and isinstance(p.get("importes"), list) and bool(p["importes"])


def importes_digital(p: dict) -> list[dict]:
    return [x for x in (p.get("importes") or [])
            if isinstance(x, dict) and x.get("on") is not False and float(x.get("usdt") or 0) > 0]


def _valor_digital(p: dict, v) -> str:
    return f"{int(v):,} {p['unidad']}".replace(",", ".") if p.get("unidad") else f"${v}"


def precio_pagina(v, p: dict) -> str:
    """El precio tal como se pinta en las fichas y tarjetas: "$140.00 USD" o
    "280 MN". Antes era siempre "$… USD", y el cable de 280 MN salía en su
    página a $280 —y a Google con priceCurrency USD—. Un digital dice su
    precio más bajo en USDT, que es como se cobra."""
    if es_digital(p):
        imps = importes_digital(p)
        if imps:
            return f"desde {min(int(x['usdt']) for x in imps)} USDT"
    v = float(v or 0)
    if es_mn(p):
        return (f"{int(v):,}" if v == int(v) else f"{v:,.2f}").replace(",", ".") + " MN"
    return f"${v:.2f} USD"


def moneda_iso(p: dict) -> str:
    # El peso cubano (MN) es CUP en schema.org / Open Graph.
    return "CUP" if es_mn(p) else "USD"


def precio_corto(v, p: dict) -> str:
    """"$110", "$12.50", "280 MN": como lo dice la tienda, sin los «.00» que en
    una tarjeta solo son ruido. Un digital, «desde N USDT» (precio_pagina)."""
    if es_digital(p) or es_mn(p):
        return precio_pagina(v, p)
    v = float(v or 0)
    return f"${int(v)}" if v == int(v) else f"${v:.2f}"


def precio_grande(p: dict) -> str:
    """El precio principal de la ficha: la cifra en grande y la moneda
    pequeña al lado («$110 USD»). MN y digitales, tal cual (precio_pagina)."""
    if es_digital(p) or es_mn(p):
        return precio_pagina(p.get("precioActual"), p)
    return f'{precio_corto(p.get("precioActual"), p)}<small>USD</small>'


# Iconos de línea de la ficha (mismo trazo que el panel y la tienda). Van en
# línea porque son media docena y una hoja aparte sería otra petición en 3G.
_ICONOS = {
    "wa": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "box": '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    "hand": '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    "bag": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    "bell": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "zap": '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    "arrow": '<path d="M5 12h14M12 5l7 7-7 7"/>',
}


def _ico(nombre: str) -> str:
    return ('<svg class="tm-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{_ICONOS[nombre]}</svg>')


def _h1_html(name: str) -> str:
    """El nombre con sus dos últimas palabras en cursiva coral, como lo
    escribe la ficha de la tienda («Smartphone itel A100C … <em>RAM
    Extendida)</em>»). Un nombre de una palabra va entero, sin cursiva."""
    pal = name.split(" ")
    if len(pal) < 2:
        return escape(name)
    corte = max(1, len(pal) - 2)
    return escape(" ".join(pal[:corte])) + " <em>" + escape(" ".join(pal[corte:])) + "</em>"


def _galeria_html(p: dict, name: str) -> str:
    """Las fotos del producto, que se pasan deslizando. La primera es lo
    primero que se ve: se pide ya y con prioridad (antes iba en lazy, que en
    la foto principal solo retrasa el pintado)."""
    fotos = []
    for u in [p.get("imagen"), *(p.get("imagenes") or [])]:
        if isinstance(u, str) and u.strip() and u.strip() not in fotos:
            fotos.append(u.strip())
    if not fotos:
        fotos = [f"{SITE}/og-image.jpg"]
    alt = escape(name, quote=True)
    imgs = "".join(
        f'<img src="{escape(u, quote=True)}" alt="{alt}" '
        + ('fetchpriority="high"' if k == 0 else 'loading="lazy" decoding="async"') + '>'
        for k, u in enumerate(fotos))
    n = f'<span class="tm-nfotos">{len(fotos)} fotos · desliza</span>' if len(fotos) > 1 else ""
    return f'<div class="tm-fotos">{imgs}</div>{n}'


def _bloques_html(p: dict, desc_raw: str) -> str:
    """Descripción, ficha técnica, características, para quién es y qué trae.
    Todo lo cargó el gestor en el panel y la página no enseñaba nada de ello;
    cada bloque sale solo si el producto lo tiene."""
    bloques = []
    if desc_raw:
        bloques.append(f'<section class="tm-blk"><h2>La <em>descripción</em></h2>'
                       f'<p class="tm-desc">{escape(desc_raw)}</p></section>')
    ficha = [f for f in (p.get("ficha") or []) if isinstance(f, dict) and f.get("k") and f.get("v")]
    if ficha:
        filas = "".join(
            f'<div><dt>{escape(nombre_limpio(str(f["k"])))}</dt><dd>{escape(str(f["v"]))}'
            + (f'<small>{escape(str(f["nota"]))}</small>' if f.get("nota") else "") + "</dd></div>"
            for f in ficha)
        bloques.append(f'<section class="tm-blk"><h2>Ficha <em>técnica</em></h2><dl class="tm-ficha">{filas}</dl></section>')
    cars = [c for c in (p.get("caracteristicas") or []) if isinstance(c, dict) and (c.get("t") or c.get("d"))]
    if cars:
        def _car(c):
            d = str(c.get("d") or "").strip()
            d = d[:1].upper() + d[1:]
            t = nombre_limpio(str(c.get("t") or ""))
            return ('<div class="tm-car">' + (f"<b>{escape(t)}</b>" if t else "")
                    + (f"<p>{escape(d)}</p>" if d else "") + "</div>")
        bloques.append('<section class="tm-blk"><h2>Lo que lo hace <em>bueno</em></h2>'
                       f'<div class="tm-cars">{"".join(_car(c) for c in cars)}</div></section>')

    def _lista(items):
        return '<ul class="tm-lst">' + "".join(
            f'<li>{_ico("check")}<span>{escape(nombre_limpio(str(t)))}</span></li>'
            for t in items) + "</ul>"
    ideal = [t for t in (p.get("idealPara") or []) if isinstance(t, str) and t.strip()]
    trae = [t for t in (p.get("incluye") or []) if isinstance(t, str) and t.strip()]
    dos = ""
    if ideal:
        dos += f'<section class="tm-blk"><h2>Ideal <em>para</em></h2>{_lista(ideal)}</section>'
    if trae:
        dos += f'<section class="tm-blk"><h2>Qué trae <em>la caja</em></h2>{_lista(trae)}</section>'
    if dos:
        bloques.append(f'<div class="tm-dos">{dos}</div>')
    return f'<div class="tm-cuerpo">{"".join(bloques)}</div>' if bloques else ""


# ── El emoji va al compartir, no en el nombre ───────────────────────────────
# (nota «Emojis solo al compartir productos»). El nombre del catálogo es el
# dato limpio —ficha, tarjetas, <title>, JSON-LD, alt y el mensaje del
# pedido lo usan tal cual— y el emoji se añade SOLO al og:title, según la
# categoría. Manda el icono que el dueño pone en el panel (😀 en Categorías,
# `iconos` de categorias.json), así se cambia sin tocar productos; si una
# categoría no tiene, esta propuesta inicial; si tampoco, va sin emoji.
EMOJI_CATEGORIA_DEFECTO = {
    "WIFI": "📶", "AUDIO": "🔊", "MOTOS": "🏍️", "ENERGIA": "⚡", "JUEGOS": "🎮", "CARROS": "🚗",
}


def emoji_categoria(cat, iconos: dict | None = None) -> str:
    c = categorias_apagadas._norm(cat)
    if not c:
        return ""
    for fuente in (iconos or {}, EMOJI_CATEGORIA_DEFECTO):
        for k, v in fuente.items():
            if categorias_apagadas._norm(k) == c and str(v or "").strip():
                return str(v).strip()
    return ""


def titulo_vista_previa(p: dict, iconos: dict | None = None) -> str:
    """og:title: «{emoji} {nombre} | TiendaMax». Sin emoji configurado para
    su categoría, «{nombre} | TiendaMax»."""
    e = emoji_categoria(p.get("categoria"), iconos)
    return " ".join(x for x in (e, nombre_limpio(p.get("nombre"))) if x) + " | TiendaMax"

def descripcion_vista_previa(p: dict, desc: str) -> str:
    """Primero lo que hace comprar, y solo lo que es verdad para ESTE
    producto: el stock real, el pago al recibir (la política de la tienda) y
    la garantía solo si el gestor la escribió."""
    partes = []
    stock = int(p.get("stock") or 0)
    if es_digital(p):
        # Ni stock (se compra al pedirlo) ni «pagas al recibirlo» (se paga antes).
        partes = ["⚡ Código por WhatsApp", "Pago en USDT o USD", precio_pagina(0, p)]
    elif stock > 0:
        partes.append(f"✅ {stock} disponible{'s' if stock != 1 else ''}")
        partes.append("Pagas al recibirlo")
        g = str(p.get("garantia") or "").strip()
        if g:
            partes.append(f"Garantía {g}" if len(g) <= 20 and not g.lower().startswith("garant") else "Con garantía")
    else:
        partes.append("⏳ Agotado ahora · Te avisamos cuando vuelva")
    cabeza = " · ".join(partes)
    return desc_short(f"{cabeza}. {desc}" if desc else cabeza, 200)


REDIRECCION_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>{og_title}</title>
<link rel="canonical" href="{url}">
<meta name="robots" content="noindex, follow">
<meta property="og:type" content="product">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{og_desc}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:secure_url" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="{og_image_type}">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="TiendaMax">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{og_title}">
<meta name="twitter:description" content="{og_desc}">
<meta name="twitter:image" content="{og_image}">
<script>location.replace({url_json}+location.search+location.hash)</script>
<meta http-equiv="refresh" content="0; url={url}">
</head>
<body><a href="{url}">{og_title}</a></body>
</html>
"""

# ── Página de categoría: lista real de productos para que Google indexe
# búsquedas como "router wifi cuba" — hoy esas categorías solo existen como
# #hash en la SPA, invisibles para crawlers. ──────────────────────────────
CATEGORY_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{page_url}">

<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{page_url}">
<meta property="og:site_name" content="TiendaMax">
<meta property="og:locale" content="es_CU">

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": {json_title},
  "description": {json_desc},
  "url": "{page_url}",
  "mainEntity": {{
    "@type": "ItemList",
    "itemListElement": [{items_jsonld}]
  }}
}}
</script>

<link rel="preload" href="{site}/fonts/playfair-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>
  /* El mismo lenguaje que las fichas /p/ y que tiendamax.org (ver el
     comentario de PAGE_TEMPLATE): fondo casi negro con el resplandor coral,
     Playfair en títulos y precios, Inter en el texto, tarjetas lisas con la
     foto sobre blanco. Colores medidos en tests/test_contraste.py. */
  @font-face{{font-family:'Playfair Display';font-style:normal;font-weight:400 900;font-display:swap;src:url({site}/fonts/playfair-latin.woff2) format('woff2')}}
  @font-face{{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url({site}/fonts/inter-normal-latin.woff2) format('woff2')}}
  *{{margin:0;padding:0;box-sizing:border-box}}
  :root{{--bg:#08060a;--card:#110f13;--line:rgba(255,255,255,.09);--txt:#f2f2f5;--mut:#9898a8;--o:#FF6A1F;--gold:#F2B632;--serif:'Playfair Display',Georgia,serif}}
  html{{scroll-behavior:smooth}}
  body{{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;-webkit-font-smoothing:antialiased;
    background-image:radial-gradient(900px 420px at 50% -120px,rgba(255,106,31,.2),transparent 70%);background-repeat:no-repeat}}
  a{{color:inherit;text-decoration:none}}
  .tm-i{{width:18px;height:18px;flex:none}}
  .tm-hdr{{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;margin:10px 12px 0;padding:10px 12px;border-radius:22px;
    background:rgba(14,12,16,.84);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--line)}}
  .tm-logo{{display:flex;align-items:center;gap:10px}}
  .tm-logo img{{width:36px;height:36px;border-radius:11px;display:block}}
  .tm-logo span{{font-family:var(--serif);font-size:22px;font-weight:800;letter-spacing:-.3px}}.tm-logo b{{color:var(--o);margin-left:6px}}
  .tm-back{{margin-left:auto;display:flex;align-items:center;gap:4px;font-size:14px;font-weight:600;padding:8px 14px 8px 9px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03);white-space:nowrap}}
  .tm-wrap{{max-width:1100px;margin:0 auto;padding:16px 16px 40px}}
  .tm-migas{{font-size:12px;color:var(--mut);display:flex;gap:6px;margin-bottom:18px}}
  .tm-migas a{{color:var(--gold)}}
  .tm-kick{{display:block;font-size:12px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--o);margin-bottom:10px}}
  h1{{font-family:var(--serif);font-size:clamp(32px,6vw,48px);line-height:1.05;font-weight:800;margin-bottom:12px}}
  h1 em,.tm-sec h2 em,.tm-out summary em,.tm-nav-cats h2 em{{color:var(--o);font-style:italic}}
  .tm-sub{{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:14px;color:var(--mut);margin-bottom:18px}}
  .tm-sub span{{display:inline-flex;align-items:center;gap:7px}}
  .tm-sub .tm-i{{width:16px;height:16px;color:var(--o)}}
  .tm-sub b{{color:var(--txt)}}
  /* Saltos a cada subcategoría: con 30 o 40 productos, la lista de una sola
     tirada obligaba a bajar a ciegas buscando "Routers". */
  .tm-subs{{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 8px;padding:2px 16px 6px}}
  .tm-subs::-webkit-scrollbar{{display:none}}
  .tm-subs a{{flex:none;font-size:14px;font-weight:600;padding:9px 14px;border-radius:14px;border:1px solid rgba(255,106,31,.55);background:rgba(255,106,31,.08);white-space:nowrap}}
  .tm-subs a small{{color:var(--mut);font-weight:500;margin-left:4px}}
  .tm-sec{{margin-top:26px;scroll-margin-top:90px}}
  .tm-sec h2{{font-family:var(--serif);font-size:22px;font-weight:800;margin-bottom:12px}}
  .tm-sec h2 small,.tm-out summary small{{font-family:Inter,system-ui,sans-serif;font-size:14px;font-weight:600;color:var(--mut);margin-left:8px}}
  .tm-out summary{{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:16px 18px;border-radius:20px;background:var(--card);border:1px solid var(--line);
    font-family:var(--serif);font-size:22px;font-weight:800}}
  .tm-out summary::-webkit-details-marker{{display:none}}
  .tm-out summary::after{{content:'';margin-left:auto;width:9px;height:9px;border-right:2px solid var(--mut);border-bottom:2px solid var(--mut);transform:rotate(45deg) translateY(-3px);transition:transform .15s}}
  .tm-out[open] summary{{margin-bottom:12px}}
  .tm-out[open] summary::after{{transform:rotate(225deg)}}
  .tm-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}}
  .tm-card{{position:relative;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;transition:border-color .2s}}
  .tm-card:hover{{border-color:rgba(255,106,31,.45)}}
  .tm-card img{{width:100%;aspect-ratio:1/1;object-fit:contain;background:#fff;display:block}}
  .tm-card-body{{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;flex:1}}
  .tm-card-name{{font-size:14px;line-height:1.35;color:#e2e2ea;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.7em}}
  .tm-card-price{{font-family:var(--serif);font-size:18px;font-weight:800;color:var(--o);margin-top:auto;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}}
  .tm-card-price s{{font-family:Inter,system-ui,sans-serif;font-size:12px;font-weight:500;color:var(--mut)}}
  .tm-card-tag{{position:absolute;top:10px;left:10px;font-size:12px;font-weight:800;padding:4px 9px;border-radius:999px;background:#FF6A1F;color:#2B0E00}}
  .tm-card-low{{font-size:12px;font-weight:600;color:var(--gold)}}
  /* Agotados aparte y atenuados: siguen enlazados porque su ficha es donde
     se deja el WhatsApp para el aviso, pero no se mezclan con lo que se
     puede pedir hoy. */
  .tm-out .tm-card img{{filter:grayscale(.85);opacity:.6}}
  .tm-out .tm-card-price{{color:var(--mut)}}
  .tm-card-out{{font-size:12px;font-weight:600;color:var(--mut)}}
  .tm-cta{{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}}
  .tm-cta a{{display:inline-flex;align-items:center;gap:8px;padding:13px 18px;border-radius:16px;font-size:14px;font-weight:700}}
  .tm-cta .tm-i{{width:19px;height:19px}}
  .tm-cta .w{{background:#25D366;color:#062B14}}
  .tm-cta .s{{color:var(--gold);border:1px solid rgba(242,182,50,.35)}}
  .tm-nav-cats{{margin-top:36px;padding-top:24px;border-top:1px solid var(--line)}}
  .tm-nav-cats h2{{font-family:var(--serif);font-size:22px;font-weight:800;margin-bottom:12px}}
  .tm-nav-cats a{{display:inline-block;font-size:14px;font-weight:600;padding:9px 14px;border-radius:14px;border:1px solid var(--line);background:var(--card);margin:0 6px 8px 0}}
  .tm-nav-cats a small{{color:var(--mut);font-weight:500;margin-left:4px}}
  .tm-ftr{{text-align:center;padding:26px 16px;color:var(--mut);font-size:12px;border-top:1px solid var(--line)}}
  .tm-ftr a{{color:#F2B632;text-decoration:underline}}
  @media (prefers-reduced-motion:reduce){{html{{scroll-behavior:auto}}*{{transition:none !important}}}}
  @media(max-width:520px){{.tm-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
</style>

</head>
<body>

<header class="tm-hdr">
  <a href="{site}" class="tm-logo"><img src="{site}/iconos/icon-192.png" alt="" width="36" height="36"><span>Tienda<b>Max</b></span></a>
  <a href="{site}" class="tm-back"><svg class="tm-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Catálogo</a>
</header>

<main class="tm-wrap">
  <nav class="tm-migas" aria-label="Ruta de navegación"><a href="{site}/">Inicio</a><span>›</span><span>{html_name}</span></nav>
  <span class="tm-kick">Categoría</span>
  <h1>{h1_html}</h1>
  <p class="tm-sub">{sub_html}</p>
  {subs_html}
  {secciones_html}
  {agotados_html}
  <div class="tm-cta">
    <a class="w" href="{wa_url}" target="_blank" rel="noopener noreferrer">{ico_wa} ¿Buscas otro? Pregúntanos</a>
    <a class="s" href="{app_url}">{ico_bag} Ver {html_name} en la tienda</a>
  </div>
  <nav class="tm-nav-cats">
    <h2>Otras <em>categorías</em></h2>
    {other_cats_html}
  </nav>
</main>

<footer class="tm-ftr">
  <a href="{site}">tiendamax.org</a> &middot; Pedidos por WhatsApp &middot; Pagas al recibirlo
</footer>

</body>
</html>
"""

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{meta_desc}">
<meta name="keywords" content="{keywords}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{page_url}">

<!-- ═══ Open Graph (WhatsApp, Facebook, Instagram) ═══ -->
<meta property="og:type" content="product">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{og_desc}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:secure_url" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="{og_image_type}">
<meta property="og:image:alt" content="{og_alt}">
<meta property="og:url" content="{page_url}">
<meta property="og:site_name" content="TiendaMax">
<meta property="product:price:amount" content="{price}">
<meta property="product:price:currency" content="{moneda_iso}">
<meta property="og:locale" content="es_CU">

<!-- ═══ Twitter Card ═══ -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{og_title}">
<meta name="twitter:description" content="{og_desc}">
<meta name="twitter:image" content="{og_image}">
<meta name="twitter:image:alt" content="{og_alt}">

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
    "priceCurrency": "{moneda_iso}",
    "availability": "{availability}",
    "itemCondition": "{condition}",
    "url": "{page_url}",
    "seller": {{"@type": "Organization", "name": "TiendaMax"}},
    "areaServed": {{"@type": "Country", "name": "Cuba"}}
  }}{json_extra}
}}
</script>

<!-- ═══ Migas de pan para Google ═══
     Con esto el resultado de búsqueda enseña "tiendamax.org › Audio › Xiaomi"
     en vez de la URL cruda, y le da a Google la jerarquía del sitio explícita
     en vez de tener que deducirla. -->
<script type="application/ld+json">
{json_breadcrumb}
</script>

<link rel="preload" href="{site}/fonts/playfair-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>
  /* Mismo lenguaje que tiendamax.org (la ficha de producto de la tienda):
     fondo casi negro con el resplandor coral arriba, coral #FF6A1F, dorado
     #F2B632, títulos y precio en Playfair con la cola en cursiva coral, Inter
     para el texto. Las fuentes son las del propio sitio (fonts/), con swap: el
     texto sale ya con la del sistema y cambia cuando llegan; quien viene de la
     tienda las tiene en caché. Los colores de texto están medidos en
     tests/test_contraste.py: el verde de WhatsApp lleva texto oscuro porque el
     blanco da 1.98:1, y el botón coral va liso porque su extremo oscuro
     (#D24E0F) bajaba a 4.15:1. */
  @font-face{{font-family:'Playfair Display';font-style:normal;font-weight:400 900;font-display:swap;src:url({site}/fonts/playfair-latin.woff2) format('woff2')}}
  @font-face{{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url({site}/fonts/inter-normal-latin.woff2) format('woff2')}}
  *{{margin:0;padding:0;box-sizing:border-box}}
  :root{{--bg:#08060a;--card:#110f13;--card2:#18151b;--line:rgba(255,255,255,.09);--txt:#f2f2f5;--mut:#9898a8;--o:#FF6A1F;--gold:#F2B632;--serif:'Playfair Display',Georgia,serif}}
  body{{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;-webkit-font-smoothing:antialiased;
    background-image:radial-gradient(900px 420px at 50% -120px,rgba(255,106,31,.2),transparent 70%);background-repeat:no-repeat}}
  a{{color:inherit;text-decoration:none}}
  .tm-i{{width:18px;height:18px;flex:none}}
  .tm-hdr{{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;margin:10px 12px 0;padding:10px 12px;border-radius:22px;
    background:rgba(14,12,16,.84);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--line)}}
  .tm-logo{{display:flex;align-items:center;gap:10px}}
  .tm-logo img{{width:36px;height:36px;border-radius:11px;display:block}}
  .tm-logo span{{font-family:var(--serif);font-size:22px;font-weight:800;letter-spacing:-.3px}}.tm-logo b{{color:var(--o);margin-left:6px}}
  .tm-back{{margin-left:auto;display:flex;align-items:center;gap:4px;font-size:14px;font-weight:600;padding:8px 14px 8px 9px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03);white-space:nowrap}}
  /* Migas de pan: además de orientar al visitante, son el enlace de vuelta a
     la categoría. Sin ellas la ficha era un callejón sin salida — solo se
     podía salir al home o a WhatsApp. */
  .tm-migas{{max-width:1080px;margin:0 auto;padding:16px 16px 0;font-size:12px;color:var(--mut);display:flex;flex-wrap:wrap;gap:6px;align-items:center}}
  .tm-migas a{{color:var(--gold)}}
  .tm-migas a:hover{{text-decoration:underline}}
  .tm-migas .sep{{opacity:.6}}
  .tm-migas .actual{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(52vw,420px)}}
  .tm-wrap{{max-width:1080px;margin:0 auto;padding:14px 16px 8px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:40px;align-items:start}}
  .tm-img{{position:relative;border-radius:26px;overflow:hidden;background:#fff;aspect-ratio:1/1;border:1px solid var(--line)}}
  .tm-fotos{{display:flex;height:100%;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}}
  .tm-fotos::-webkit-scrollbar{{display:none}}
  .tm-fotos img{{flex:0 0 100%;width:100%;height:100%;object-fit:contain;scroll-snap-align:center;display:block}}
  .tm-nfotos{{position:absolute;right:12px;bottom:12px;font-size:12px;font-weight:700;color:#fff;background:rgba(8,6,10,.72);padding:6px 10px;border-radius:999px}}
  .tm-cat{{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--o);margin-bottom:12px}}
  h1{{font-family:var(--serif);font-size:clamp(26px,3.6vw,36px);line-height:1.12;font-weight:800;margin-bottom:18px}}
  h1 em,.tm-blk h2 em,.tm-rel h2 em,.tm-res h2 em{{color:var(--o);font-style:italic}}
  .tm-prices{{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}}
  .tm-price{{font-family:var(--serif);font-size:44px;font-weight:800;line-height:1;color:var(--o)}}
  .tm-price small{{font-size:18px;margin-left:6px}}
  .tm-orig{{font-size:18px;color:var(--mut);text-decoration:line-through}}
  .tm-badge{{background:rgba(255,106,31,.15);color:var(--o);font-size:14px;font-weight:800;padding:4px 10px;border-radius:999px}}
  .tm-stok-y,.tm-stok-n{{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;margin:12px 0 18px}}
  .tm-stok-y{{color:var(--o)}}.tm-stok-n{{color:var(--mut)}}
  .tm-stok-y + .tm-stok-y{{margin-top:-10px}}
  .tm-keys{{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}}
  .tm-keys span{{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#f0e6de;padding:9px 14px;border-radius:14px;border:1px solid rgba(255,106,31,.55);background:rgba(255,106,31,.08)}}
  .tm-keys .tm-i{{color:var(--o);width:16px;height:16px}}
  .tm-actions{{display:flex;flex-direction:column;gap:12px}}
  .tm-btn{{display:flex;align-items:center;justify-content:center;gap:10px;padding:17px 20px;border-radius:18px;font-size:16px;font-weight:800;border:none;font-family:inherit;cursor:pointer;transition:opacity .2s}}
  .tm-btn:hover{{opacity:.9}}
  .tm-btn .tm-i{{width:21px;height:21px}}
  .tm-btn-w{{background:#25D366;color:#062B14;box-shadow:0 14px 30px -14px rgba(37,211,102,.7)}}
  .tm-btn-p{{background:#FF6A1F;color:#2B0E00}}
  /* Secundario: con stock "Ver más en TiendaMax" (la acción de la página es
     pedir); agotado, el de WhatsApp, "por si quieres preguntar". */
  .tm-btn-s{{background:transparent;color:var(--gold);border:1px solid rgba(242,182,50,.35);font-size:14px;padding:13px 18px}}
  .tm-conf{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}}
  .tm-conf > div{{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:14px 10px;border-radius:20px;background:var(--card);border:1px solid var(--line)}}
  .tm-conf .ic{{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center}}
  .tm-conf .ic .tm-i{{width:21px;height:21px}}
  .tm-conf .o{{background:rgba(255,106,31,.16);color:var(--o)}}.tm-conf .g{{background:rgba(37,211,102,.14);color:#4ade80}}
  .tm-conf b{{font-size:14px}}.tm-conf small{{font-size:12px;color:var(--mut);line-height:1.4}}
  /* Avísame cuando vuelva (solo fichas agotadas; el porqué, en el script). */
  .tm-aviso{{display:none;flex-direction:column;gap:10px;background:rgba(255,106,31,.07);border:1px solid rgba(255,106,31,.28);border-radius:18px;padding:14px}}
  .tm-aviso.abierto{{display:flex}}
  .tm-aviso p{{font-size:14px;color:#d6d6de;line-height:1.5}}
  .tm-aviso-row{{display:flex;gap:8px}}
  .tm-aviso input{{flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 13px;color:#fff;font-size:14px;font-family:inherit}}
  .tm-aviso input:focus{{outline:2px solid var(--o);outline-offset:1px;border-color:transparent}}
  .tm-aviso button{{background:#FF6A1F;color:#2B0E00;border:none;border-radius:12px;padding:12px 18px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}}
  .tm-aviso button:disabled{{opacity:.55;cursor:default}}
  .tm-aviso .msg{{font-size:14px;line-height:1.5}}
  .tm-aviso .msg.ok{{color:#4ade80}}
  .tm-aviso .msg.err{{color:#ff8a6b}}
  .tm-aviso .luego{{font-size:12px;color:var(--mut)}}
  .tm-aviso .luego a{{color:var(--gold);text-decoration:underline}}
  /* Lo que el gestor cargó del producto y la página no enseñaba: ficha,
     características, para quién es y qué trae. Cada bloque sale solo si el
     producto lo tiene. */
  .tm-cuerpo{{max-width:1080px;margin:0 auto;padding:18px 16px 8px;display:grid;gap:14px}}
  .tm-blk{{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:20px}}
  .tm-blk h2,.tm-rel h2,.tm-res h2{{font-family:var(--serif);font-size:22px;font-weight:800;margin-bottom:14px}}
  .tm-desc{{font-size:14px;line-height:1.7;color:#d6d6de;white-space:pre-line}}
  .tm-ficha{{display:grid}}
  .tm-ficha div{{display:grid;grid-template-columns:minmax(110px,38%) 1fr;gap:14px;padding:11px 0;border-top:1px solid var(--line)}}
  .tm-ficha div:first-child{{border-top:0;padding-top:0}}
  .tm-ficha dt{{font-size:14px;color:var(--mut)}}
  .tm-ficha dd{{font-size:14px;line-height:1.45;font-weight:500}}
  .tm-ficha small{{display:block;font-size:12px;color:var(--mut);margin-top:2px;font-weight:400}}
  .tm-cars{{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}}
  .tm-car{{background:var(--card2);border-radius:18px;padding:14px;border-left:3px solid var(--o)}}
  .tm-car b{{display:block;font-size:14px;margin-bottom:5px}}
  .tm-car p{{font-size:14px;line-height:1.5;color:var(--mut)}}
  .tm-dos{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
  .tm-lst{{list-style:none;display:grid;gap:10px}}
  .tm-lst li{{display:flex;gap:10px;font-size:14px;line-height:1.5;color:#e2e2ea}}
  .tm-lst .tm-i{{color:var(--o);margin-top:2px}}
{css_extra}  @media (prefers-reduced-motion:reduce){{*{{transition:none !important}}}}
  /* Productos relacionados: convierten las fichas sueltas en una malla que se
     puede recorrer, tanto por un cliente como por un rastreador. */
  .tm-rel{{max-width:1080px;margin:0 auto;padding:22px 16px 30px}}
  .tm-rel-grid{{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(150px,1fr);gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px;scrollbar-width:none}}
  .tm-rel-grid::-webkit-scrollbar{{display:none}}
  .tm-rel-card{{scroll-snap-align:start;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;transition:border-color .2s}}
  .tm-rel-card:hover{{border-color:rgba(255,106,31,.45)}}
  .tm-rel-card img{{width:100%;aspect-ratio:1/1;object-fit:contain;background:#fff;display:block}}
  .tm-rel-body{{padding:10px 12px 12px}}
  .tm-rel-name{{font-size:14px;line-height:1.35;color:#e2e2ea;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:2.7em;margin-bottom:6px}}
  .tm-rel-price{{font-family:var(--serif);font-size:18px;font-weight:800;color:var(--o)}}
  .tm-rel-mas{{display:inline-flex;align-items:center;gap:6px;margin-top:16px;font-size:14px;font-weight:600;color:var(--gold);border:1px solid rgba(242,182,50,.35);padding:9px 16px;border-radius:999px}}
  .tm-ftr{{text-align:center;padding:26px 16px;color:var(--mut);font-size:12px;border-top:1px solid var(--line)}}
  .tm-ftr a{{color:#F2B632;text-decoration:underline}}
  .tm-barra{{display:none}}
  @media(max-width:760px){{
    .tm-wrap{{grid-template-columns:minmax(0,1fr);gap:18px}}
    .tm-dos{{grid-template-columns:minmax(0,1fr)}}
    /* Barra fija con el precio y el pedido: en el móvil el botón grande queda
       atrás en cuanto se baja a leer la ficha. Toca el mismo #tmWa (lo mide
       MEDIR_JS y le añade el canal); sin JS, el enlace sirve igual. */
    .tm-barra{{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;align-items:center;gap:12px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));
      background:rgba(12,10,14,.95);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line)}}
    .tm-barra .pz{{display:flex;flex-direction:column;line-height:1.1;min-width:0}}
    .tm-barra .pz b{{font-family:var(--serif);font-size:24px}}.tm-barra .pz small{{font-size:12px;color:var(--mut);margin-top:2px}}
    .tm-barra a{{margin-left:auto;display:flex;align-items:center;gap:8px;padding:14px 22px;border-radius:16px;background:#25D366;color:#062B14;font-weight:800;font-size:16px}}
    .con-barra .tm-ftr{{padding-bottom:110px}}
  }}
</style>

</head>
<body{body_cls}>

<header class="tm-hdr">
  <a href="{site}" class="tm-logo"><img src="{site}/iconos/icon-192.png" alt="" width="36" height="36"><span>Tienda<b>Max</b></span></a>
  <a href="{site}" class="tm-back"><svg class="tm-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Catálogo</a>
</header>

{breadcrumb_html}
<main>
<div class="tm-wrap">
  <div class="tm-img">
    {galeria_html}
  </div>
  <div>
    {cat_html}
    <h1>{h1_html}</h1>
    <div class="tm-prices">
      <span class="tm-price">{precio_txt}</span>
      {precio_orig_html}
      {pct_desc_html}
    </div>
    {stock_html}
    {specs_html}
    <div class="tm-actions">
      {acciones_html}
    </div>
    {confianza_html}
  </div>
</div>
{bloques_html}
</main>

{resenas_html}
{related_html}

<footer class="tm-ftr">
  <a href="{site}">tiendamax.org</a> &middot; Pedidos por WhatsApp &middot; Todos los derechos reservados
</footer>
{barra_html}
{medir_js}
{aviso_js}
</body>
</html>
"""


# Estilos que solo necesitan unas pocas fichas. La hoja va en línea dentro
# de cada página, así que dejarlos fijos sería mandarle a las 132 —y a cada
# visita— reglas para un bloque que no existe en esa página.
CSS_GARANTIA = """
  /* Garantía (solo si el producto la trae escrita): tercera tarjeta de
     confianza, a lo ancho. */
  .tm-gar{grid-column:1/-1}
  .tm-conf .y{background:rgba(242,182,50,.15);color:#F2B632}
"""

CSS_RESENAS = """
  /* Reseñas reales, pintadas al generar (ver _resenas_html). */
  .tm-res{max-width:1080px;margin:0 auto;padding:8px 16px 8px}
  .tm-res-item{background:#110f13;border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:16px 18px;margin-bottom:10px}
  .tm-res-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
  .tm-res-autor{font-size:14px;font-weight:700;color:#f2f2f5}
  .tm-res-est{font-size:14px;color:#F2B632;letter-spacing:1px}
  .tm-res-fecha{font-size:12px;color:#9898a8;margin-left:auto}
  .tm-res-texto{font-size:14px;line-height:1.65;color:#d6d6de;white-space:pre-line}
"""


# ── Medir lo que traen los enlaces publicados ───────────────────────────────
# Estas páginas son el destino de TODO lo que se publica, y hasta ahora no
# escribían una sola línea en Firebase: solo cargaban gtag. Así que las vistas
# por producto, los clics de WhatsApp y el canal de procedencia que enseña el
# panel salían únicamente de quien navegaba tiendamax.org por su cuenta — o
# sea, el tráfico que genera publicar era invisible justo en el panel donde se
# decide qué publicar.
#
# No se carga js/analytics.js: son 20 KB y además pide config.json. Esto es
# ~1,5 KB en línea (unos 650 B comprimidos, que es lo que viaja), sin una petición extra al cargar, y escribe en las MISMAS
# rutas con la misma forma (contador entero en .../count) para que las dos
# fuentes se sumen en vez de contarse aparte. Va sin comentarios y apretado a
# propósito: se copia entero en las 132 páginas y cada línea la descarga cada
# visita en 3G; el porqué de cada trozo está aquí y no allí.
#
#   - Las tres marcas de admin son las mismas que mira el sitio: el dueño abre
#     sus propias fichas para comprobarlas y se contaba como cliente.
#   - La tabla F es _TM_FUENTES, copiada. La clave termina siendo una ruta de
#     Firebase, así que aceptar el utm_source tal cual dejaría que un enlace
#     inventado creara nodos en la base.
#   - Las llaves de sesión son LAS DEL SITIO, no unas propias: 'tm_an_vistas_ID'
#     con su ventana de 30 min (analytics.js) y 'tm_visita_contada'
#     (tm-patches.src.js). Con llaves distintas, quien entra por un enlace
#     publicado y luego sigue a tiendamax.org contaría dos visitas — y la
#     duplicada sería justo la del canal que se quiere medir.
#   - El incremento del servidor es atómico y una sola petición; si la regla lo
#     rechaza se cae al leer-y-escribir que usa el resto del sitio.
#   - El utm se le pega al enlace de WhatsApp ya codificado, detrás de la URL
#     del producto con que acaba el mensaje: sin JS el enlace sigue sirviendo,
#     solo que sin marca de canal.
#   - `g` es la marca del GRUPO de Facebook desde el que se publicó
#     (tmGrupoCodigo en js/revolico_integration.js): la visita y el toque en
#     WhatsApp se suman también en /analytics/grupos/<g>, para ver qué grupo
#     trae a quien escribe. Solo cuenta con un canal válido y con 4–8 letras
#     minúsculas o cifras — el mismo filtro que la regla de Firebase: la clave
#     es una ruta, y sin él cualquier enlace inventado crearía nodos.
#     El toque en WhatsApp se cuenta también por HORA (la del teléfono de
#     quien toca, dos cifras): dice a qué hora responde cada grupo, que es
#     cuándo conviene publicar ahí.
MEDIR_JS = """
<script>
(function(){{
var B={rtdb_json},ID={pid_json},C=30*60*1000,n=Date.now();if(!B)return;
function g(k){{try{{return sessionStorage.getItem(k);}}catch(e){{return null;}}}}
function p(k,v){{try{{sessionStorage.setItem(k,v);}}catch(e){{}}}}
try{{if(localStorage.getItem('githubToken')||localStorage.getItem('tm_auth_hash_v3')||localStorage.getItem('tm_es_admin'))return;}}catch(e){{}}
var F={{whatsapp:'whatsapp',wa:'whatsapp','whatsapp-estado':'whatsapp-estado',story:'whatsapp-estado',estado:'whatsapp-estado',facebook:'facebook',fb:'facebook',instagram:'instagram',ig:'instagram',revolico:'revolico',rev:'revolico',copiado:'copiado',copy:'copiado','lote-categoria':'lote-categoria'}};
var q='',G='';try{{var U=new URLSearchParams(location.search);q=(U.get('c')||U.get('utm_source')||'').trim().toLowerCase();G=(U.get('g')||'').toLowerCase();}}catch(e){{}}
if(!/^[a-z0-9]{{4,8}}$/.test(G))G='';else if(!q)q='facebook';
var c=F[q]||'',h=new Date().toISOString().slice(0,10);if(!c)G='';
function mas(r){{var u=B+r+'.json',o={{method:'PUT',headers:{{'Content-Type':'application/json'}},keepalive:true}};
fetch(u,Object.assign({{body:'{{".sv":{{"increment":1}}}}'}},o)).then(function(x){{if(x.ok)return;
return fetch(u).then(function(y){{return y.ok?y.json():0;}}).then(function(v){{return fetch(u,Object.assign({{body:JSON.stringify((typeof v==='number'?v:0)+1)}},o));}});}}).catch(function(){{}});}}
function frio(k){{var t=parseInt(g('tm_an_'+k)||'0',10)||0;if(t&&n-t<C)return false;p('tm_an_'+k,String(n));return true;}}
if(frio('vistas_'+ID))mas('/analytics/vistas/'+ID+'/count');
if(!g('tm_visita_contada')){{p('tm_visita_contada','1');
mas('/analytics/visitas/count');mas('/analytics/visitas/dias/'+h);
if(c){{mas('/analytics/fuentes/'+c+'/count');mas('/analytics/fuentes/'+c+'/dias/'+h);}}if(G)mas('/analytics/grupos/'+G+'/visitas/count');}}
var a=document.getElementById('tmWa');
if(a){{if(c)a.href=a.href+encodeURIComponent('?c='+c);
a.addEventListener('click',function(){{if(frio('whatsapp_'+ID)){{mas('/analytics/whatsapp/'+ID+'/count');if(G){{mas('/analytics/grupos/'+G+'/whatsapp/count');mas('/analytics/grupos/'+G+'/horas/'+('0'+new Date().getHours()).slice(-2)+'/count');}}}}}});}}
}})();
</script>
"""


# ── "Avísame cuando vuelva" en las fichas agotadas ──────────────────────────
# JavaScript suelto, sin dependencias: una escritura a /lista_espera y ya. La
# regla de ese nodo (".write": "!data.exists()") deja crear sin cuenta y no deja
# leer a nadie salvo al dueño, así que el número del cliente no queda expuesto.
#
# Deliberadamente NO se usa el SDK de Firebase ni se piden notificaciones: estas
# páginas son la entrada desde Google y viven de cargar rápido en 3G. Pedirle
# permiso de avisos a alguien que aterriza por primera vez es la mejor forma de
# perderlo; el número, además, vale más — a un token le mandas un aviso, a un
# número le vendes.
AVISO_JS = """
<script>
(function(){{
  var BASE = {rtdb_json};
  var PID  = {pid_json};
  var btn  = document.getElementById('tmAvisarBtn');
  var caja = document.getElementById('tmAviso');
  var tel  = document.getElementById('tmAvisoTel');
  var ok   = document.getElementById('tmAvisoOk');
  var msg  = document.getElementById('tmAvisoMsg');
  if(!btn || !caja || !tel || !ok || !msg) return;

  var YA = 'tm_espera_' + PID;
  function decir(t, clase){{ msg.textContent = t; msg.className = 'msg ' + (clase||''); }}

  // Ya lo pidió desde este teléfono: no se le vuelve a preguntar.
  try{{ if(localStorage.getItem(YA)){{
    caja.classList.add('abierto');
    btn.setAttribute('aria-expanded','true');
    decir('\\u2705 Ya tienes el aviso puesto. Te escribo apenas entre.','ok');
    tel.style.display = ok.style.display = 'none';
  }} }}catch(e){{}}

  btn.addEventListener('click', function(){{
    var abierto = caja.classList.toggle('abierto');
    btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    if(abierto) try{{ tel.focus(); }}catch(e){{}}
  }});

  tel.addEventListener('keydown', function(e){{ if(e.key === 'Enter') ok.click(); }});

  ok.addEventListener('click', function(){{
    // Los dos extremos los exige la regla de /lista_espera (6 a 25). Pasarse
    // por arriba daba un rechazo mudo: el cliente veía "guardando" y nada más.
    var n = (tel.value || '').replace(/[^0-9+]/g, '').slice(0, 25);
    if(n.length < 6){{ decir('Escribe un WhatsApp v\\u00e1lido, con el c\\u00f3digo si es de fuera.','err'); return; }}
    if(!BASE){{ decir('No se pudo guardar. Escr\\u00edbeme por WhatsApp y te apunto.','err'); return; }}
    ok.disabled = true; decir('Guardando\\u2026','');
    // Clave con azar además de la hora: la regla es "solo si no existe", y dos
    // personas en el mismo milisegundo harían que la segunda se perdiera callada.
    var clave = Date.now() + '_' + Math.random().toString(36).slice(2,8);
    var ctrl = new AbortController();
    var tid = setTimeout(function(){{ ctrl.abort(); }}, 8000);
    fetch(BASE + '/lista_espera/' + PID + '/' + clave + '.json', {{
      method:'PUT', headers:{{'Content-Type':'application/json'}}, signal: ctrl.signal,
      body: JSON.stringify({{ tel:n, productoId:String(PID), ts:Date.now() }})
    }}).then(function(r){{
      if(!r.ok) throw new Error('HTTP ' + r.status);
      try{{ localStorage.setItem(YA,'1'); }}catch(e){{}}
      decir('\\u2705 Listo. Te escribo apenas entre.','ok');
      tel.style.display = ok.style.display = 'none';
    }}).catch(function(){{
      ok.disabled = false;
      decir('No se pudo guardar. Rev\\u00edsa tu conexi\\u00f3n o escr\\u00edbeme por WhatsApp.','err');
    }}).then(function(){{ clearTimeout(tid); }});
  }});
}})();
</script>"""


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


def _breadcrumb(cat: str, slug: str, name: str, page_url: str) -> tuple[str, str]:
    """Migas de pan visibles + su JSON-LD.

    Las fichas eran callejones sin salida: solo enlazaban al home, a sí mismas
    y a WhatsApp. Ni a su categoría ni a nada más. Para quien navega es un
    incordio; para Google es una página que no reparte nada de lo que recibe.

    Si el producto no tiene categoría se degrada a "Inicio › Producto" en vez
    de inventar un enlace a una /c/ que no existe.
    """
    inicio = f'<a href="{SITE}/">Inicio</a>'
    if cat and slug:
        cat_nombre = escape(category_display_name(cat))
        visible = (
            f'<nav class="tm-migas" aria-label="Ruta de navegación">'
            f'{inicio}<span class="sep">›</span>'
            f'<a href="{SITE}/c/{slug}.html">{cat_nombre}</a>'
            f'<span class="sep">›</span>'
            f'<span class="actual">{escape(name)}</span></nav>'
        )
        items = [
            {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": category_display_name(cat),
             "item": f"{SITE}/c/{slug}.html"},
            {"@type": "ListItem", "position": 3, "name": name, "item": page_url},
        ]
    else:
        visible = (
            f'<nav class="tm-migas" aria-label="Ruta de navegación">'
            f'{inicio}<span class="sep">›</span>'
            f'<span class="actual">{escape(name)}</span></nav>'
        )
        items = [
            {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": page_url},
        ]
    jsonld = json.dumps(
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items},
        ensure_ascii=False, indent=2,
    )
    return visible, jsonld


def _relacionados_html(actual: dict, hermanos: list[dict], slug: str, limite: int = 6) -> str:
    """Tarjetas de otros productos de la misma categoría.

    Es lo que convierte 118 fichas aisladas en una malla recorrible. Se
    priorizan los que están en stock: enlazar a agotados reparte enlaces hacia
    páginas que no venden.
    """
    pid_actual = str(actual.get("id"))
    candidatos = [p for p in hermanos if str(p.get("id")) != pid_actual and p.get("id")]
    if not candidatos:
        return ""
    candidatos.sort(key=lambda p: (int(p.get("stock") or 0) <= 0, -float(p.get("precioActual") or 0)))
    elegidos = candidatos[:limite]

    tarjetas = []
    for p in elegidos:
        pid = p.get("id")
        nombre = nombre_limpio(p.get("nombre") or "")
        precio = f"{float(p.get('precioActual') or 0):.2f}"
        img = escape(p.get("imagen") or f"{SITE}/og-image.jpg", quote=True)
        tarjetas.append(
            f'<a class="tm-rel-card" href="{url_producto(p)}">'
            f'<img src="{img}" alt="{escape(nombre)}" loading="lazy" decoding="async">'
            f'<div class="tm-rel-body">'
            f'<div class="tm-rel-name">{escape(nombre)}</div>'
            f'<div class="tm-rel-price">{precio_corto(p.get("precioActual"), p)}</div>'
            f'</div></a>'
        )

    ver_mas = (
        f'<a class="tm-rel-mas" href="{SITE}/c/{slug}.html">Ver toda la categoría {_ico("arrow")}</a>'
        if slug else ""
    )
    return (
        '<section class="tm-rel">\n'
        '  <h2>También te puede <em>interesar</em></h2>\n'
        '  <div class="tm-rel-grid">\n    '
        + "\n    ".join(tarjetas)
        + f'\n  </div>\n  {ver_mas}\n</section>'
    )


def _garantia_html(producto: dict) -> str:
    """La garantía del producto, si la tiene escrita, como tercera tarjeta de
    confianza.

    La rellena el gestor a mano y solo unos pocos productos la traen; no se
    deduce ni se rellena por defecto, porque aquí una garantía inventada es
    una promesa que quien la lee viene luego a cobrar. Se imprime el texto tal
    cual lo escribió.
    """
    texto = (producto.get("garantia") or "").strip()
    if not texto:
        return ""
    return (f'<div class="tm-gar"><span class="ic y">{_ico("shield")}</span>'
            f'<b>Garantía</b><small>{escape(texto)}</small></div>')


def _estrellas(n: int) -> str:
    n = max(0, min(5, int(n or 0)))
    return "★" * n + "☆" * (5 - n)


def _resenas_de(cache: dict, pid: str, limite: int = 3) -> list[dict]:
    """Las reseñas reales de un producto, de la más nueva a la más vieja."""
    por = (cache or {}).get("por_producto") or {}
    lista = [r for r in (por.get(str(pid)) or []) if (r or {}).get("texto")]
    lista.sort(key=lambda r: r.get("ts") or 0, reverse=True)
    return lista[:limite]


def _resenas_html(resenas: list[dict]) -> str:
    """Las reseñas, pintadas al generar la página.

    Van en el HTML y no en una petición desde el móvil: son tres líneas de
    texto que ya existen cuando se genera el fichero, y pedirlas a Firebase
    costaría una conexión más en 3G para enseñar lo mismo.
    """
    if not resenas:
        return ""
    filas = []
    for r in resenas:
        autor = escape((r.get("autor") or "Cliente").strip())
        fecha = escape((r.get("fecha") or "").strip())
        est = int(r.get("estrellas") or 0)
        estrellas = (
            f'<span class="tm-res-est" aria-label="{est} de 5 estrellas">{_estrellas(est)}</span>'
            if est else ""
        )
        fecha_html = f'<span class="tm-res-fecha">{fecha}</span>' if fecha else ""
        filas.append(
            '<div class="tm-res-item">'
            f'<div class="tm-res-top"><span class="tm-res-autor">{autor}</span>'
            f'{estrellas}{fecha_html}</div>'
            f'<div class="tm-res-texto">{escape((r.get("texto") or "").strip())}</div>'
            "</div>"
        )
    titulo = "Lo que dicen quienes lo compraron" if len(filas) > 1 else "Lo que dice quien lo compró"
    return (
        '<section class="tm-res">\n'
        f"  <h2>{titulo}</h2>\n  " + "\n  ".join(filas) + "\n</section>"
    )


def _resenas_jsonld(resenas: list[dict]) -> str:
    """Las mismas reseñas para Google, o "" si el producto no tiene ninguna.

    Se emite solo con reseñas de verdad: un aggregateRating sin reseñas debajo
    es justo lo que Google penaliza, y aquí además sería mentira.
    """
    validas = [r for r in resenas if int(r.get("estrellas") or 0) > 0]
    if not validas:
        return ""
    media = round(sum(int(r["estrellas"]) for r in validas) / len(validas), 1)
    bloques = []
    for r in validas:
        bloques.append({
            "@type": "Review",
            "reviewRating": {"@type": "Rating", "ratingValue": int(r["estrellas"]),
                             "bestRating": 5, "worstRating": 1},
            "author": {"@type": "Person", "name": (r.get("autor") or "Cliente").strip()},
            "reviewBody": (r.get("texto") or "").strip(),
        })
    agregado = {"@type": "AggregateRating", "ratingValue": media,
                "reviewCount": len(validas), "bestRating": 5, "worstRating": 1}
    return (',\n  "aggregateRating": ' + json.dumps(agregado, ensure_ascii=False)
            + ',\n  "review": ' + json.dumps(bloques, ensure_ascii=False))


def rtdb_url(config: dict) -> str:
    """La URL de la Realtime Database, sacada de config.json.

    Sin ella el formulario de "avísame" no tiene dónde escribir, así que se
    devuelve "" y el JS lo dice en vez de fallar callado.
    """
    fb = (config or {}).get("firebaseConfig") or {}
    url = str(fb.get("databaseURL") or "").strip()
    if not url and fb.get("projectId"):
        url = f"https://{fb['projectId']}-default-rtdb.firebaseio.com"
    return url.rstrip("/")


def regenerate_pages(products: list[dict], wa_num: str = "5354320170",
                     rtdb: str = "", resenas: dict | None = None) -> tuple[int, list[str]]:
    """Crea/actualiza páginas /p/ y borra las huérfanas."""
    P_DIR.mkdir(exist_ok=True)
    if resenas is None:
        resenas = read_json(RESENAS, {})
    written = 0
    valid_files = set()
    viejos = preparar_rutas(products)
    iconos = category_icons()

    # Huella (sha256 recortado) de cada tarjeta OG, calculada por
    # build_og_images.py a partir de nombre/precio/stock/foto. Sin adjuntarla
    # a la URL, la tarjeta cambia de contenido pero no de dirección, y
    # WhatsApp/Facebook/Telegram cachean la vista previa por URL: un producto
    # que pasa de agotado a repuesto (o cambia de precio o de foto) sigue
    # mostrando en el chat la tarjeta vieja indefinidamente aunque el JPEG en
    # og/ ya esté al día.
    og_manifest = read_json(OG_MANIFEST, {})
    if not isinstance(og_manifest, dict):
        og_manifest = {}

    # Índice por categoría para los "relacionados". Se arma una vez: hacerlo
    # dentro del bucle serían 118 recorridos del catálogo entero.
    por_categoria: dict[str, list[dict]] = {}
    for p in products:
        c = (p.get("categoria") or "").strip()
        if c:
            por_categoria.setdefault(c, []).append(p)

    for p in products:
        pid = p.get("id")
        if not pid:
            continue
        name  = nombre_limpio(p.get("nombre") or "")
        desc  = desc_short(p.get("seoDescription") or p.get("descripcion") or "", 155 if p.get("seoDescription") else 200)
        price = f"{float(p.get('precioActual') or 0):.2f}"
        # OJO: son DOS imágenes distintas y hay que mantenerlas separadas.
        #
        # `img` es la foto que se ve en la página. `og_img` es la tarjeta de
        # 1200x630 que arma scripts/build_og_images.py y que solo verá quien
        # comparta el enlace. Mezclarlas hace que la ficha del producto enseñe
        # la tarjeta entera —con su marco, su precio y su "TiendaMax"— en lugar
        # del producto.
        #
        # La tarjeta existe porque las etiquetas de abajo declaran 1200x630 y
        # las fotos reales son 480x480 o 700x700: los 118 productos mentían
        # sobre sus medidas, y WhatsApp, Telegram y Facebook maquetan la vista
        # previa con lo DECLARADO, así que salían recortadas o con franjas.
        img = p.get("imagen") or f"{SITE}/og-image.jpg"
        if (ROOT / "og" / f"producto-{pid}.jpg").exists():
            og_img = f"{SITE}/og/producto-{pid}.jpg"
            huella_og = og_manifest.get(str(pid))
            if huella_og:
                og_img += f"?v={huella_og}"
        else:
            og_img = img
        # Tipo MIME real de la tarjeta para og:image:type (antes siempre jpeg)
        _ext = og_img.split("?", 1)[0].rsplit(".", 1)[-1].lower()
        og_image_type = {
            "webp": "image/webp", "png": "image/png", "gif": "image/gif",
            "jpg": "image/jpeg", "jpeg": "image/jpeg",
        }.get(_ext, "image/jpeg")
        stock = int(p.get("stock") or 0)
        seo_title_raw = (titulo_seo(p) or f"{name} — {precio_texto(p)}").strip()
        seo_keywords = p.get("seoKeywords") or []
        if isinstance(seo_keywords, str):
            seo_keywords = [x.strip() for x in seo_keywords.split(",") if x.strip()]
        keywords_raw = ", ".join(dict.fromkeys([*seo_keywords, name, p.get("categoria") or "", "TiendaMax", "Cuba"]))

        # Sanitización: HTML escape para todo lo inyectado en HTML
        html_name = escape(name)
        og_title  = escape(titulo_vista_previa(p, iconos))
        og_alt    = escape(nombre_limpio(name))
        og_desc   = escape(descripcion_vista_previa(p, desc))
        meta_desc = escape(desc)
        image     = escape(img, quote=True)
        og_image  = escape(og_img, quote=True)
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

        page_url = url_producto(p)
        app_url  = f"{SITE}/?producto={pid}#producto-{pid}"
        title    = escape(titulo_seo(p) or f"{name} — {precio_texto(p)} | TiendaMax")

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
            precio_orig_html = f'<span class="tm-orig">{precio_corto(precio_orig, p)}</span>'
            pct_desc_html    = f'<span class="tm-badge">-{pct}%</span>'
        else:
            precio_orig_html = ""
            pct_desc_html    = ""

        if es_digital(p):
            imps = " · ".join(f"{_valor_digital(p, x['v'])}: {int(x['usdt'])} USDT"
                              for x in importes_digital(p))
            stock_html = (f'<div class="tm-stok-y">{_ico("zap")} Código por WhatsApp en 5–30 min · '
                          f'pago antes, en USDT (BEP20) o USD</div>\n'
                          f'    <div class="tm-stok-y">{escape(imps)}</div>')
        elif stock > 0:
            stock_html = (f'<div class="tm-stok-y">{_ico("box")} {stock} '
                          f'{"unidades disponibles" if stock != 1 else "unidad disponible"}</div>')
        else:
            stock_html = '<div class="tm-stok-n">Agotado</div>'

        # ── Los botones dependen del stock ──────────────────────────────────
        # Antes eran los mismos hubiera existencias o no: sobre un "Agotado" se
        # ofrecía "Ver en TiendaMax" —que no promete nada a quien acaba de leer
        # que no lo tienes— y un WhatsApp escrito como "me interesa", o sea
        # pedir algo que no se puede vender. El dueño recibía la pregunta de
        # cuándo vuelve, que tampoco sabe contestar.
        if es_digital(p):
            # Hay que elegir importe, y eso lo hace la ficha de la tienda.
            wa_msg = urllib.parse.quote(f"Hola, me interesa: {name}. ¿De qué importe? {page_url}")
            wa_link = f"https://wa.me/{wa_num}?text={wa_msg}"
            acciones_html = (
                f'<a href="{app_url}" class="tm-btn tm-btn-w">{_ico("zap")} Elegir importe y pedir</a>\n'
                f'      <a href="{wa_link}" class="tm-btn tm-btn-s" id="tmWa" target="_blank" '
                f'rel="noopener noreferrer">{_ico("wa")} Preguntar por WhatsApp</a>'
            )
        elif stock > 0:
            wa_msg = urllib.parse.quote(f"Hola, me interesa: {name}. {page_url}")
            wa_link = f"https://wa.me/{wa_num}?text={wa_msg}"
            # WhatsApp va primero y es el botón principal: aquí no hay carrito
            # ni pago, el pedido ES el mensaje. "Ver en TiendaMax" mandaba al
            # catálogo entero a quien ya estaba mirando justo el producto que
            # quería, así que pasa a segundo plano.
            acciones_html = (
                f'<a href="{wa_link}" class="tm-btn tm-btn-w" id="tmWa" target="_blank" '
                f'rel="noopener noreferrer">{_ico("wa")} Pedir por WhatsApp</a>\n'
                f'      <a href="{app_url}" class="tm-btn tm-btn-s">{_ico("bag")} Ver más en TiendaMax</a>'
            )
        else:
            # Sin stock la pregunta se le da la vuelta: en vez de que el cliente
            # pregunte cuándo vuelve, deja su número y AVISA LA TIENDA cuando
            # vuelve. Esa otra mitad ya existe — al reponer, send_notifications.py
            # lee /lista_espera, se la manda al dueño por push y la borra.
            wa_msg = urllib.parse.quote(f"Hola, te escribo por: {name}. {page_url}")
            wa_link = f"https://wa.me/{wa_num}?text={wa_msg}"
            acciones_html = (
                f'<button type="button" class="tm-btn tm-btn-p" id="tmAvisarBtn" '
                f'aria-expanded="false" aria-controls="tmAviso">{_ico("bell")} Avísame cuando vuelva</button>\n'
                f'      <div class="tm-aviso" id="tmAviso">\n'
                f'        <p>Déjame tu WhatsApp y te escribo apenas entre. Nada más: '
                f'ni correo, ni registro.</p>\n'
                f'        <div class="tm-aviso-row">\n'
                f'          <input id="tmAvisoTel" type="tel" inputmode="tel" maxlength="25" '
                f'autocomplete="tel" placeholder="5355551234" aria-label="Tu WhatsApp">\n'
                f'          <button type="button" id="tmAvisoOk">Avisarme</button>\n'
                f'        </div>\n'
                f'        <div class="msg" id="tmAvisoMsg" role="status" aria-live="polite"></div>\n'
                f'        <div class="luego">¿Prefieres el aviso automático en el móvil? '
                f'<a href="{app_url}">Actívalo en la tienda</a>.</div>\n'
                f'      </div>\n'
                f'      <a href="{wa_link}" class="tm-btn tm-btn-s" id="tmWa" '
                f'target="_blank" rel="noopener noreferrer">{_ico("wa")} Escríbeme</a>'
            )

        # El formulario de aviso solo viaja en las fichas agotadas: es lo único
        # que necesitan y no tiene sentido en las que sí se pueden vender.
        aviso_js = "" if stock > 0 or es_digital(p) else AVISO_JS.format(
            rtdb_json=json.dumps(rtdb), pid_json=json.dumps(str(pid)))
        # El contador, en cambio, va en todas: medir solo las agotadas sería
        # medir justo las que no venden.
        medir_js = MEDIR_JS.format(
            rtdb_json=json.dumps(rtdb), pid_json=json.dumps(str(pid))) if rtdb else ""

        garantia_html = _garantia_html(p)
        # Confianza: lo que es verdad de todo pedido físico (se paga al recibir
        # y se prueba antes: la misma promesa del og:description). Un digital
        # se paga antes, así que ahí solo va su garantía si la tiene.
        tarjetas = [] if es_digital(p) else [
            f'<div><span class="ic o">{_ico("hand")}</span><b>Pagas al recibirlo</b>'
            f'<small>Lo pruebas antes de pagar</small></div>',
            f'<div><span class="ic g">{_ico("wa")}</span><b>Pides por WhatsApp</b>'
            f'<small>Te responde una persona</small></div>']
        if garantia_html:
            tarjetas.append(garantia_html)
        confianza_html = f'<div class="tm-conf">{"".join(tarjetas)}</div>' if tarjetas else ""
        specs = [nombre_limpio(str(x)) for x in (p.get("specs") or []) if nombre_limpio(str(x))][:4]
        specs_html = ('<div class="tm-keys">' + "".join(
            f'<span>{_ico("check")}{escape(x)}</span>' for x in specs) + "</div>") if specs else ""
        # La barra fija del móvil, solo donde se puede pedir ya. Pulsa el #tmWa
        # de arriba para que el toque cuente igual (MEDIR_JS) y lleve el canal.
        if stock > 0 and not es_digital(p):
            barra_html = (
                f'<div class="tm-barra"><div class="pz"><b>{precio_corto(p.get("precioActual"), p)}</b>'
                f'<small>{stock} disponible{"s" if stock != 1 else ""}</small></div>'
                f'<a href="{wa_link}" target="_blank" rel="noopener noreferrer" '
                f'onclick="var w=document.getElementById(\'tmWa\');if(w){{w.click();return false}}">'
                f'{_ico("wa")} Pedir</a></div>')
        else:
            barra_html = ""
        del_producto = _resenas_de(resenas, pid)
        resenas_html = _resenas_html(del_producto)
        json_extra = _resenas_jsonld(del_producto)
        css_extra = (CSS_GARANTIA if garantia_html else "") + (CSS_RESENAS if resenas_html else "")

        cat_slug = slugify(cat) if cat else ""
        breadcrumb_html, json_breadcrumb = _breadcrumb(cat, cat_slug, name, page_url)
        related_html = _relacionados_html(p, por_categoria.get(cat, []), cat_slug)

        html = PAGE_TEMPLATE.format(
            title=title,
            html_name=html_name,
            og_title=og_title,
            og_desc=og_desc,
            og_alt=og_alt,
            meta_desc=meta_desc,
            image=image,
            og_image=og_image,
            og_image_type=og_image_type,
            keywords=keywords,
            page_url=page_url,
            app_url=app_url,
            price=price,
            precio_txt=precio_grande(p),
            site=SITE,
            body_cls=' class="con-barra"' if barra_html else "",
            h1_html=_h1_html(name),
            galeria_html=_galeria_html(p, name),
            specs_html=specs_html,
            confianza_html=confianza_html,
            bloques_html=_bloques_html(p, desc_raw),
            barra_html=barra_html,
            moneda_iso=moneda_iso(p),
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
            acciones_html=acciones_html,
            aviso_js=aviso_js,
            medir_js=medir_js,
            garantia_html=garantia_html,
            resenas_html=resenas_html,
            json_extra=json_extra,
            css_extra=css_extra,
            breadcrumb_html=breadcrumb_html,
            json_breadcrumb=json_breadcrumb,
            related_html=related_html,
        )

        slug = _RUTAS.get(str(pid))
        fp = P_DIR / (f"{slug}.html" if slug else f"producto-{pid}.html")
        valid_files.add(fp.name)
        if write_text(fp, html):
            written += 1

        # Las direcciones viejas saltan a la nueva (ver preparar_rutas).
        if slug:
            stub = REDIRECCION_TEMPLATE.format(
                og_title=og_title, og_desc=og_desc, og_image=og_image,
                og_image_type=og_image_type, url=escape(page_url, quote=True),
                url_json=json.dumps(page_url))
            for nombre in [f"producto-{pid}"] + viejos.get(str(pid), []):
                fv = P_DIR / f"{nombre}.html"
                valid_files.add(fv.name)
                if write_text(fv, stub):
                    written += 1

    # Borrar huérfanos: cualquier .html de p/ que ya no sea ficha ni salto.
    removed = []
    for fname in os.listdir(P_DIR):
        if fname.endswith(".html") and fname not in valid_files:
            (P_DIR / fname).unlink(missing_ok=True)
            removed.append(fname)
            print(f"🗑️  Borrado huérfano: p/{fname}")

    return written, removed


def slugify(name: str) -> str:
    """'PC Y LAPTOPS' -> 'pc-y-laptops'. Sin librerías externas: solo
    normaliza acentos comunes en español y colapsa separadores."""
    s = (name or "").strip().lower()
    tildes = str.maketrans("áéíóúñü", "aeiounu")
    s = s.translate(tildes)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "otros"


def category_icons() -> dict:
    cats = read_json(CATS, {})
    return cats.get("iconos", {}) if isinstance(cats, dict) else {}


# Nombres tal como aparecen en productos.json (mayúsculas, sin tildes) no son
# lindos para un <title>/<h1> público — mapeo manual de los conocidos hoy.
# Una categoría nueva que no esté acá cae al fallback .title() (aceptable,
# solo pierde el acento).
_CATEGORY_DISPLAY = {
    "WIFI": "WiFi", "ENERGIA": "Energía", "CELULARES": "Celulares",
    "UTILES": "Útiles", "CARROS": "Carros", "ROPA": "Ropa",
    "SEGURIDAD": "Seguridad", "HOGAR": "Hogar", "JUEGOS": "Juegos",
    "MOTOS": "Motos", "PC Y LAPTOPS": "PC y Laptops", "GYM": "Gym",
}


def category_display_name(cat: str) -> str:
    return _CATEGORY_DISPLAY.get(cat, cat.title() if cat.isupper() else cat)


def _tarjeta_categoria(p: dict) -> str:
    """Una tarjeta de producto en /c/: foto, nombre, precio limpio y, si es
    verdad, el descuento y «quedan N»."""
    name = nombre_limpio(p.get("nombre") or "")
    img = escape(p.get("imagen") or f"{SITE}/og-image.jpg", quote=True)
    stock = int(p.get("stock") or 0)
    act = float(p.get("precioActual") or 0)
    orig = float(p.get("precioOriginal") or 0)
    rebaja = orig > act > 0 and not es_digital(p)
    tag = f'<span class="tm-card-tag">−{round((orig - act) / orig * 100)}%</span>' if rebaja and stock > 0 else ""
    tachado = f"<s>{precio_corto(orig, p)}</s>" if rebaja else ""
    if stock <= 0:
        pie = '<div class="tm-card-out">Agotado · avísame cuando vuelva</div>'
    elif stock <= 3 and not es_digital(p):
        pie = f'<div class="tm-card-low">Quedan {stock}</div>'
    else:
        pie = ""
    return (f'<a class="tm-card" href="{url_producto(p)}">{tag}'
            f'<img src="{img}" alt="{escape(name)}" loading="lazy" decoding="async">'
            f'<div class="tm-card-body"><div class="tm-card-name">{escape(name)}</div>'
            f'<div class="tm-card-price">{precio_corto(act, p)}{tachado}</div>{pie}</div></a>')


def regenerate_category_pages(products: list[dict], wa_num: str = "5354320170") -> tuple[int, list[str]]:
    """Crea/actualiza /c/<slug>.html por categoría: hoy las categorías solo
    existen como #hash en la SPA (invisibles para Google) — estas páginas dan
    contenido real e indexable para búsquedas como 'router wifi cuba'.

    Lo que se puede pedir va primero, agrupado por subcategoría con saltos
    arriba cuando hay más de una; lo agotado va aparte, al final y atenuado.
    No se promete cobertura de envío: no hay una escrita en ningún sitio (la
    misma regla que pubCatEnvioTxt en el panel)."""
    C_DIR.mkdir(exist_ok=True)

    by_cat: dict[str, list[dict]] = {}
    for p in products:
        cat = (p.get("categoria") or "").strip()
        if not cat:
            continue
        by_cat.setdefault(cat, []).append(p)

    if not by_cat:
        return 0, []

    # Orden estable: más productos primero (coincide con relevancia real)
    cat_names = sorted(by_cat.keys(), key=lambda c: -len(by_cat[c]))
    slugs = {c: slugify(c) for c in cat_names}
    disponibles = {c: sum(1 for p in by_cat[c] if int(p.get("stock") or 0) > 0) for c in cat_names}

    written = 0
    valid_files = set()

    for cat in cat_names:
        prods = sorted(by_cat[cat], key=lambda p: (int(p.get("stock") or 0) <= 0, -(float(p.get("precioActual") or 0) > 0)))
        con = [p for p in prods if int(p.get("stock") or 0) > 0]
        sin = [p for p in prods if int(p.get("stock") or 0) <= 0]
        en_stock = len(con)
        nombre = category_display_name(cat)
        html_name = escape(nombre)
        slug = slugs[cat]
        page_url = f"{SITE}/c/{slug}.html"
        app_url = f"{SITE}/?categoria={urllib.parse.quote(cat)}"

        title = escape(f"{nombre} en Cuba — Pago al recibir | TiendaMax")
        desc = escape(
            f"{en_stock} producto{'s' if en_stock != 1 else ''} de {cat.lower()} disponibles en TiendaMax. "
            f"Pides por WhatsApp y pagas al recibirlo, en USD o MN."
        )

        items_jsonld = []
        for k, p in enumerate(p for p in prods if p.get("id")):
            items_jsonld.append(json.dumps({
                "@type": "ListItem", "position": k + 1,
                "url": url_producto(p),
                "name": nombre_limpio(p.get("nombre") or ""),
            }, ensure_ascii=False))

        # Lo disponible, por subcategoría. Los que no tienen van a «Otros».
        grupos: dict[str, list[dict]] = {}
        for p in con:
            if not p.get("id"):
                continue
            grupos.setdefault((p.get("subcategoria") or "").strip() or "Otros", []).append(p)
        orden = sorted(grupos, key=lambda g: (g == "Otros", -len(grupos[g]), g))
        varios = len(orden) > 1

        def _sid(g):
            return "s-" + slugify(g)
        secciones = []
        for g in orden:
            cab = (f'<h2>{escape(g.capitalize())} <small>{len(grupos[g])}</small></h2>' if varios else "")
            secciones.append(f'<section class="tm-sec" id="{_sid(g)}">{cab}<div class="tm-grid">'
                             + "".join(_tarjeta_categoria(p) for p in grupos[g]) + "</div></section>")
        if not secciones:
            secciones.append('<section class="tm-sec"><p class="tm-sub">Ahora mismo no queda nada '
                             'disponible aquí. Abajo están los agotados: toca uno y deja tu WhatsApp '
                             'para que te avisemos cuando vuelva.</p></section>')
        subs_html = ('<nav class="tm-subs" aria-label="Subcategorías">' + "".join(
            f'<a href="#{_sid(g)}">{escape(g.capitalize())}<small>{len(grupos[g])}</small></a>' for g in orden)
            + "</nav>") if varios else ""
        agotados = [p for p in sin if p.get("id")]
        # Plegados cuando hay algo que pedir (en WiFi eran 36 tarjetas grises
        # delante del pie); abiertos si la categoría no tiene nada disponible.
        # Plegar no los saca del HTML: Google y el enlazado interno los ven igual.
        agotados_html = (
            f'<details class="tm-sec tm-out" id="agotados"{"" if con else " open"}>'
            f'<summary>Agotados <em>ahora</em><small>{len(agotados)}</small></summary><div class="tm-grid">'
            + "".join(_tarjeta_categoria(p) for p in agotados) + "</div></details>") if agotados else ""

        sub_html = (f'<span>{_ico("box")}<b>{en_stock}</b> disponible{"s" if en_stock != 1 else ""}</span>'
                    f'<span>{_ico("hand")}Pagas al recibirlo</span>'
                    f'<span>{_ico("wa")}Pedidos por WhatsApp</span>')
        pal = nombre.split(" ")
        h1_html = (escape(" ".join(pal[:-1])) + " <em>" + escape(pal[-1]) + "</em>") if len(pal) > 1 else escape(nombre)

        # Todas las hermanas, no las 11 primeras: con 13 categorías el corte
        # dejaba una fuera de cada página, y siempre la misma — la de menos
        # productos, que es justo la que más necesita que la enlacen.
        other_cats_html = " ".join(
            f'<a href="{SITE}/c/{slugs[c]}.html">{escape(category_display_name(c))}'
            f'<small>{disponibles[c]}</small></a>'
            for c in cat_names if c != cat
        )
        wa_url = f"https://wa.me/{wa_num}?text=" + urllib.parse.quote(
            f"Hola, busco algo de {nombre.lower()} que no vi en la página: {page_url}")

        html = CATEGORY_PAGE_TEMPLATE.format(
            title=title,
            desc=desc,
            page_url=page_url,
            json_title=json.dumps(f"{cat} — TiendaMax"),
            json_desc=json.dumps(desc),
            items_jsonld=",\n    ".join(items_jsonld),
            site=SITE,
            html_name=html_name,
            h1_html=h1_html,
            sub_html=sub_html,
            subs_html=subs_html,
            secciones_html="\n  ".join(secciones),
            agotados_html=agotados_html,
            app_url=app_url,
            wa_url=escape(wa_url, quote=True),
            ico_wa=_ico("wa"),
            ico_bag=_ico("bag"),
            other_cats_html=other_cats_html,
        )

        fp = C_DIR / f"{slug}.html"
        valid_files.add(fp.name)
        if write_text(fp, html):
            written += 1

    removed = []
    for fname in os.listdir(C_DIR):
        if fname.endswith(".html") and fname not in valid_files:
            (C_DIR / fname).unlink(missing_ok=True)
            removed.append(fname)
            print(f"🗑️  Borrado huérfano: c/{fname}")

    return written, removed


CATS_INICIO = "<!-- tm:cats-inicio -->"
CATS_FIN = "<!-- tm:cats-fin -->"


def regenerate_home_nav(cat_names: list[str], slugs: dict[str, str]) -> bool:
    """Reescribe la lista de categorías del pie de index.html.

    Estaba a mano y se quedó desfasada: 8 enlaces para 13 categorías. Las cinco
    que faltaban (audio, gym, juegos, pc-y-laptops, ropa) tenían su página y
    estaban en el sitemap, pero nada en el sitio las enlazaba — y una página a
    la que no apunta nadie es una página de segunda para Google, aunque exista.

    Generarla evita que vuelva a pasar: la próxima categoría se enlaza sola.
    """
    if not INDEX.exists():
        return False
    html = INDEX.read_text(encoding="utf-8")
    i, j = html.find(CATS_INICIO), html.find(CATS_FIN)
    if i == -1 or j == -1 or j < i:
        # Sin marcas no se toca nada: es preferible una lista desfasada a
        # reescribir a ciegas un index.html de 2000 líneas.
        print("⚠️  index.html sin las marcas tm:cats-*; no se actualiza el pie", file=sys.stderr)
        return False

    estilo = "color:rgba(255,255,255,.45);font-size:12px;margin:0 8px;display:inline-block;"
    enlaces = [
        f'<a href="/c/{slugs[c]}.html" style="{estilo}">{escape(category_display_name(c))}</a>'
        for c in cat_names
    ]
    # Solo categorías. «Preguntas frecuentes» iba aquí y se leía como una
    # categoría más; ahora vive en el bloque «Ayuda» de index.html, fuera de
    # las marcas porque no depende del catálogo.
    nav = (
        CATS_INICIO + "\n"
        '            <nav aria-label="Categorías" class="footer-nav" style="text-align:center;padding:14px 0;'
        'border-top:1px solid rgba(255,255,255,.06);margin-top:8px;">\n                '
        '<h4 class="footer-nav-tit">Categorías</h4>\n                '
        '<div class="footer-nav-links">\n                '
        + "\n                ".join(enlaces)
        + "\n                </div>\n            </nav>\n            " + CATS_FIN
    )
    nuevo = html[:i] + nav + html[j + len(CATS_FIN):]
    if nuevo == html:
        return False
    _atomic_write(INDEX, nuevo)
    print(f"✏️  Actualizado: index.html (pie con {len(cat_names)} categorías)")
    return True


def regenerate_sitemap(products: list[dict], category_slugs: list[str] | None = None) -> bool:
    today = date.today().isoformat()
    urls = [(f"{SITE}/", "daily", "1.0"), (f"{SITE}/faq.html", "weekly", "0.6")]
    for slug in (category_slugs or []):
        urls.append((f"{SITE}/c/{slug}.html", "weekly", "0.9"))
    for p in products:
        pid = p.get("id")
        if pid:
            stock = int(p.get("stock") or 0)
            prio = "0.8" if stock > 0 else "0.5"
            urls.append((url_producto(p), "weekly", prio))

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

    rtdb = rtdb_url(config)
    if not rtdb:
        print("⚠️  Sin databaseURL en config.json: el 'avísame' de las fichas "
              "agotadas no podrá guardar nada.", file=sys.stderr)

    # Lo apagado en el panel no sale en la tienda, y tampoco aquí: sin página
    # /p/ ni /c/, sin enlace en el pie y fuera del sitemap. Una /p/ que
    # siguiera viva sería una puerta a comprar lo que el dueño retiró. Al
    # encender la categoría, la siguiente pasada las vuelve a crear.
    # subcategorias.json y comisiones sí van con el catálogo entero: son
    # datos, no páginas, y el panel los necesita todos.
    apagadas = categorias_apagadas.leer(CATS)
    visibles = apagadas.visibles(products)
    if apagadas.hay:
        print(f"⏸️  {len(products) - len(visibles)} producto(s) en categorías o "
              f"subcategorías apagadas: fuera de /p/, /c/ y el sitemap")

    n_written, removed = regenerate_pages(visibles, wa_num, rtdb)
    print(f"   Páginas /p/ actualizadas: {n_written}, borradas: {len(removed)}")

    n_cat_written, cat_removed = regenerate_category_pages(visibles, wa_num)
    print(f"   Páginas /c/ actualizadas: {n_cat_written}, borradas: {len(cat_removed)}")
    category_slugs = sorted({slugify((p.get("categoria") or "").strip()) for p in visibles if p.get("categoria")})

    # Mismo orden que las páginas /c/: más productos primero.
    por_cat: dict[str, int] = {}
    for p in visibles:
        c = (p.get("categoria") or "").strip()
        if c:
            por_cat[c] = por_cat.get(c, 0) + 1
    cats_ordenadas = sorted(por_cat, key=lambda c: -por_cat[c])
    regenerate_home_nav(cats_ordenadas, {c: slugify(c) for c in cats_ordenadas})

    if regenerate_sitemap(visibles, category_slugs):
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
