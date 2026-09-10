#!/usr/bin/env python3
"""
Regenera artefactos derivados de productos.json:
  1) /p/producto-<id>.html  (páginas estáticas para previews ricas en WhatsApp/Facebook)
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

<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0C0806;color:#fff;min-height:100vh}}
  a{{color:inherit;text-decoration:none}}
  .tm-hdr{{display:flex;align-items:center;padding:14px 20px;background:#0D0806;border-bottom:1px solid rgba(201,169,110,.15)}}
  .tm-logo{{font-size:20px;font-weight:800;letter-spacing:-.5px}}
  .tm-logo .t{{color:#C9A96E}}.tm-logo .m{{color:#FF6B35}}
  .tm-back{{margin-left:auto;font-size:13px;color:#C9A96E;border:1px solid rgba(201,169,110,.3);padding:6px 14px;border-radius:20px;white-space:nowrap}}
  .tm-wrap{{max-width:1100px;margin:0 auto;padding:28px 16px 60px}}
  h1{{font-size:clamp(22px,4vw,30px);font-weight:800;margin-bottom:8px}}
  .tm-sub{{color:#a09080;font-size:14px;margin-bottom:24px}}
  .tm-cta{{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:12px;font-size:14px;font-weight:700;background:linear-gradient(135deg,#FF6B35,#E8501E);color:#2B0E00;margin-bottom:28px}}
  .tm-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}}
  .tm-card{{background:#181310;border:1px solid rgba(255,255,255,.06);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}}
  .tm-card img{{width:100%;aspect-ratio:1/1;object-fit:cover;background:#1a1410}}
  .tm-card-body{{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;flex:1}}
  .tm-card-name{{font-size:12.5px;font-weight:600;line-height:1.3;min-height:32px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
  .tm-card-price{{font-size:15px;font-weight:800;color:#FF6B35;margin-top:auto}}
  .tm-card-out{{font-size:10.5px;color:#9a9088}}
  .tm-nav-cats{{margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08)}}
  .tm-nav-cats h2{{font-size:13px;color:#9a9088;font-weight:600;margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em}}
  .tm-nav-cats a{{display:inline-block;font-size:12.5px;color:#C9A96E;border:1px solid rgba(201,169,110,.25);padding:5px 12px;border-radius:20px;margin:0 6px 6px 0}}
  .tm-ftr{{text-align:center;padding:24px 16px;color:#8a8078;font-size:12px;border-top:1px solid rgba(255,255,255,.06)}}
  .tm-ftr a{{color:#C9A96E;text-decoration:underline}}
</style>

<!-- ═══ Google Analytics ═══
     Estas páginas son el destino de los enlaces que se comparten en Facebook,
     Revólico, Estado de WhatsApp, etc. Sin gtag aquí, los ?utm_source= de esos
     enlaces no medían nada y no había forma de saber qué canal trae compradores.
     Mismo ID que index.html; carga async, no bloquea el render. -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-KG43FHTCDF"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', 'G-KG43FHTCDF');
</script>
</head>
<body>

<header class="tm-hdr">
  <a href="https://tiendamax.org" class="tm-logo"><span class="t">TIENDA</span><span class="m">MAX</span></a>
  <a href="https://tiendamax.org" class="tm-back">← Ver catálogo</a>
</header>

<main class="tm-wrap">
  <h1>{icon} {html_name}</h1>
  <p class="tm-sub">{sub}</p>
  <a href="{app_url}" class="tm-cta">🛍️ Ver todo {html_name} en la tienda</a>
  <div class="tm-grid">
    {cards_html}
  </div>
  <nav class="tm-nav-cats">
    <h2>Otras categorías</h2>
    {other_cats_html}
  </nav>
</main>

<footer class="tm-ftr">
  <a href="https://tiendamax.org">tiendamax.org</a> &middot; Todos los derechos reservados
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
<meta name="description" content="{og_desc}">
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
<meta name="twitter:image" content="{og_image}">
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
  /* Texto oscuro sobre el coral: blanco a 11px daba 2.83:1, por debajo del
     minimo AA. #241100 da 6.41:1 y el coral de marca se queda igual. */
  .tm-cat{{display:inline-block;background:#FF6B35;color:#241100;font-size:11px;font-weight:800;letter-spacing:.5px;padding:4px 12px;border-radius:20px;margin-bottom:14px;text-transform:uppercase}}
  h1{{font-size:clamp(20px,4vw,26px);font-weight:800;line-height:1.25;margin-bottom:18px}}
  .tm-prices{{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:18px}}
  .tm-price{{font-size:30px;font-weight:800;color:#FF6B35}}
  .tm-orig{{font-size:17px;color:#8a8078;text-decoration:line-through}}
  .tm-badge{{background:rgba(255,107,53,.15);color:#FF6B35;border:1px solid rgba(255,107,53,.3);font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px}}
  .tm-desc{{font-size:14px;line-height:1.75;color:#a09080;margin-bottom:22px;white-space:pre-line}}
  .tm-stok-y{{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#4ade80;margin-bottom:22px}}
  .tm-stok-y::before{{content:'';width:8px;height:8px;border-radius:50%;background:#4ade80;flex-shrink:0}}
  .tm-stok-n{{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#9a9088;margin-bottom:22px}}
  .tm-stok-n::before{{content:'';width:8px;height:8px;border-radius:50%;background:#666;flex-shrink:0}}
  .tm-actions{{display:flex;flex-direction:column;gap:12px}}
  .tm-btn{{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 20px;border-radius:12px;font-size:15px;font-weight:700;transition:opacity .2s}}
  .tm-btn:hover{{opacity:.85}}
  .tm-btn-p{{background:linear-gradient(135deg,#FF6B35,#E8501E);color:#2B0E00}}
  .tm-btn-w{{background:#25D366;color:#062B14}}
  /* Botón secundario. Con stock lo lleva "Ver más en TiendaMax", porque la
     acción de la página es pedir; agotado lo lleva el de WhatsApp, porque no
     se puede pedir lo que no hay y queda como "por si quieres preguntar". */
  .tm-btn-s{{background:transparent;color:#C9A96E;border:1px solid rgba(201,169,110,.35)}}
  /* Avísame cuando vuelva (solo fichas agotadas; el porqué, en el script). */
  .tm-aviso{{display:none;flex-direction:column;gap:10px;background:rgba(255,107,53,.07);
    border:1px solid rgba(255,107,53,.28);border-radius:12px;padding:14px}}
  .tm-aviso.abierto{{display:flex}}
  .tm-aviso p{{font-size:13px;color:#c4b5a4;line-height:1.5}}
  .tm-aviso-row{{display:flex;gap:8px}}
  .tm-aviso input{{flex:1;min-width:0;background:#161010;border:1px solid rgba(201,169,110,.28);
    border-radius:10px;padding:12px 13px;color:#fff;font-size:15px;font-family:inherit}}
  .tm-aviso input:focus{{outline:2px solid #FF6B35;outline-offset:1px;border-color:transparent}}
  .tm-aviso button{{background:linear-gradient(135deg,#FF6B35,#E8501E);color:#2B0E00;border:none;
    border-radius:10px;padding:12px 18px;font-size:14px;font-weight:800;cursor:pointer;
    font-family:inherit;white-space:nowrap}}
  .tm-aviso button:disabled{{opacity:.55;cursor:default}}
  .tm-aviso .msg{{font-size:13px;line-height:1.5}}
  .tm-aviso .msg.ok{{color:#4ade80}}
  .tm-aviso .msg.err{{color:#ff8a6b}}
  .tm-aviso .luego{{font-size:12px;color:#8a8078}}
  .tm-aviso .luego a{{color:#C9A96E;text-decoration:underline}}
{css_extra}  @media (prefers-reduced-motion:reduce){{*{{transition:none !important}}}}
  .tm-ftr{{text-align:center;padding:24px 16px;color:#8a8078;font-size:12px;border-top:1px solid rgba(255,255,255,.06)}}
  .tm-ftr a{{color:#C9A96E;text-decoration:underline}}
  /* Migas de pan: además de orientar al visitante, son el enlace de vuelta a
     la categoría. Sin ellas la ficha era un callejón sin salida — solo se
     podía salir al home o a WhatsApp. */
  .tm-migas{{max-width:900px;margin:0 auto;padding:14px 16px 0;font-size:12.5px;color:#8a7b6c;display:flex;flex-wrap:wrap;gap:6px;align-items:center}}
  .tm-migas a{{color:#C9A96E}}
  .tm-migas a:hover{{text-decoration:underline}}
  .tm-migas .sep{{opacity:.5}}
  .tm-migas .actual{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(46vw,340px)}}
  /* Productos relacionados: convierten 118 fichas sueltas en una malla que se
     puede recorrer, tanto por un cliente como por un rastreador. */
  .tm-rel{{max-width:900px;margin:0 auto;padding:8px 16px 48px}}
  .tm-rel h2{{font-size:16px;font-weight:800;margin-bottom:16px;color:#e8dcc8}}
  .tm-rel-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px}}
  .tm-rel-card{{background:#141010;border:1px solid rgba(201,169,110,.14);border-radius:12px;overflow:hidden;display:block;transition:border-color .2s}}
  .tm-rel-card:hover{{border-color:rgba(201,169,110,.4)}}
  .tm-rel-card img{{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#1a1410}}
  .tm-rel-body{{padding:9px 10px 11px}}
  .tm-rel-name{{font-size:12.5px;line-height:1.35;color:#d8cbb8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:5px;min-height:34px}}
  .tm-rel-price{{font-size:14px;font-weight:800;color:#FF6B35}}
  .tm-rel-mas{{display:inline-block;margin-top:18px;font-size:13px;color:#C9A96E;border:1px solid rgba(201,169,110,.3);padding:8px 16px;border-radius:20px}}
</style>

<!-- ═══ Google Analytics ═══
     Estas páginas son el destino de los enlaces que se comparten en Facebook,
     Revólico, Estado de WhatsApp, etc. Sin gtag aquí, los ?utm_source= de esos
     enlaces no medían nada y no había forma de saber qué canal trae compradores.
     Mismo ID que index.html; carga async, no bloquea el render. -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-KG43FHTCDF"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', 'G-KG43FHTCDF');
</script>
</head>
<body>

<header class="tm-hdr">
  <a href="https://tiendamax.org" class="tm-logo"><span class="t">TIENDA</span><span class="m">MAX</span></a>
  <a href="https://tiendamax.org" class="tm-back">← Ver catálogo</a>
</header>

{breadcrumb_html}
<main class="tm-wrap">
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
    {stock_html}{garantia_html}
    <div class="tm-actions">
      {acciones_html}
    </div>
  </div>
</main>

{resenas_html}
{related_html}

<footer class="tm-ftr">
  <a href="https://tiendamax.org">tiendamax.org</a> &middot; Todos los derechos reservados
</footer>
{medir_js}
{aviso_js}
</body>
</html>
"""


# Estilos que solo necesitan unas pocas fichas. La hoja va en línea dentro
# de cada página, así que dejarlos fijos sería mandarle a las 132 —y a cada
# visita— reglas para un bloque que no existe en esa página.
CSS_GARANTIA = """
  /* Garantía (solo si el producto la trae escrita). */
  .tm-gar{display:flex;gap:8px;font-size:13px;color:#C9A96E;background:rgba(201,169,110,.08);
    border:1px solid rgba(201,169,110,.26);border-radius:10px;padding:10px 13px;
    margin-bottom:20px;line-height:1.55}
"""

CSS_RESENAS = """
  /* Reseñas reales, pintadas al generar (ver _resenas_html). */
  .tm-res{max-width:1100px;margin:0 auto 44px;padding:0 20px}
  .tm-res h2{font-size:18px;margin-bottom:14px;color:#f0e6d8}
  .tm-res-item{background:#161010;border:1px solid rgba(201,169,110,.18);border-radius:12px;
    padding:14px 16px;margin-bottom:10px}
  .tm-res-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
  .tm-res-autor{font-size:14px;font-weight:700;color:#f0e6d8}
  .tm-res-est{font-size:13px;color:#FFC857;letter-spacing:1px}
  .tm-res-fecha{font-size:12px;color:#8a8078;margin-left:auto}
  .tm-res-texto{font-size:14px;line-height:1.65;color:#a09080;white-space:pre-line}
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
MEDIR_JS = """
<script>
(function(){{
var B={rtdb_json},ID={pid_json},C=30*60*1000,n=Date.now();if(!B)return;
function g(k){{try{{return sessionStorage.getItem(k);}}catch(e){{return null;}}}}
function p(k,v){{try{{sessionStorage.setItem(k,v);}}catch(e){{}}}}
try{{if(localStorage.getItem('githubToken')||localStorage.getItem('tm_auth_hash_v3')||localStorage.getItem('tm_es_admin'))return;}}catch(e){{}}
var F={{whatsapp:'whatsapp',wa:'whatsapp','whatsapp-estado':'whatsapp-estado',story:'whatsapp-estado',estado:'whatsapp-estado',facebook:'facebook',fb:'facebook',instagram:'instagram',ig:'instagram',revolico:'revolico',rev:'revolico',copiado:'copiado',copy:'copiado','lote-categoria':'lote-categoria'}};
var q='';try{{q=(new URLSearchParams(location.search).get('utm_source')||'').trim().toLowerCase();}}catch(e){{}}
var c=F[q]||'',h=new Date().toISOString().slice(0,10);
function mas(r){{var u=B+r+'.json',o={{method:'PUT',headers:{{'Content-Type':'application/json'}},keepalive:true}};
fetch(u,Object.assign({{body:'{{".sv":{{"increment":1}}}}'}},o)).then(function(x){{if(x.ok)return;
return fetch(u).then(function(y){{return y.ok?y.json():0;}}).then(function(v){{return fetch(u,Object.assign({{body:JSON.stringify((typeof v==='number'?v:0)+1)}},o));}});}}).catch(function(){{}});}}
function frio(k){{var t=parseInt(g('tm_an_'+k)||'0',10)||0;if(t&&n-t<C)return false;p('tm_an_'+k,String(n));return true;}}
if(frio('vistas_'+ID))mas('/analytics/vistas/'+ID+'/count');
if(!g('tm_visita_contada')){{p('tm_visita_contada','1');
mas('/analytics/visitas/count');mas('/analytics/visitas/dias/'+h);
if(c){{mas('/analytics/fuentes/'+c+'/count');mas('/analytics/fuentes/'+c+'/dias/'+h);}}}}
var a=document.getElementById('tmWa');
if(a){{if(c)a.href=a.href+encodeURIComponent('?utm_source='+c);
a.addEventListener('click',function(){{if(frio('whatsapp_'+ID))mas('/analytics/whatsapp/'+ID+'/count');}});}}
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
        nombre = (p.get("nombre") or "").strip()
        precio = f"{float(p.get('precioActual') or 0):.2f}"
        img = escape(p.get("imagen") or f"{SITE}/og-image.jpg", quote=True)
        tarjetas.append(
            f'<a class="tm-rel-card" href="{SITE}/p/producto-{pid}.html">'
            f'<img src="{img}" alt="{escape(nombre)}" loading="lazy" decoding="async">'
            f'<div class="tm-rel-body">'
            f'<div class="tm-rel-name">{escape(nombre)}</div>'
            f'<div class="tm-rel-price">${precio} USD</div>'
            f'</div></a>'
        )

    ver_mas = (
        f'<a class="tm-rel-mas" href="{SITE}/c/{slug}.html">Ver toda la categoría →</a>'
        if slug else ""
    )
    return (
        '<section class="tm-rel">\n'
        '  <h2>También te puede interesar</h2>\n'
        '  <div class="tm-rel-grid">\n    '
        + "\n    ".join(tarjetas)
        + f'\n  </div>\n  {ver_mas}\n</section>'
    )


def _garantia_html(producto: dict) -> str:
    """La garantía del producto, si la tiene escrita.

    La rellena el gestor a mano y solo 8 productos la traen; no se deduce ni se
    rellena por defecto, porque aquí una garantía inventada es una promesa que
    quien la lee viene luego a cobrar. Los textos cortos ("3 meses") se
    presentan con su etiqueta; los largos ya vienen redactados y se imprimen
    tal cual.
    """
    texto = (producto.get("garantia") or "").strip()
    if not texto:
        return ""
    if len(texto) > 40:
        # Los largos ya vienen redactados, con su propio icono a veces; añadirle
        # el escudo delante deja dos emojis pegados.
        return f'\n    <div class="tm-gar"><span>{escape(texto)}</span></div>'
    return ('\n    <div class="tm-gar"><span aria-hidden="true">\U0001F6E1\uFE0F</span>'
            f'<span>Garantía: {escape(texto)}</span></div>')


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
        name  = (p.get("nombre") or "").strip()
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

        # ── Los botones dependen del stock ──────────────────────────────────
        # Antes eran los mismos hubiera existencias o no: sobre un "Agotado" se
        # ofrecía "Ver en TiendaMax" —que no promete nada a quien acaba de leer
        # que no lo tienes— y un WhatsApp escrito como "me interesa", o sea
        # pedir algo que no se puede vender. El dueño recibía la pregunta de
        # cuándo vuelve, que tampoco sabe contestar.
        if stock > 0:
            wa_msg = urllib.parse.quote(f"Hola, me interesa: {name}. {page_url}")
            wa_link = f"https://wa.me/{wa_num}?text={wa_msg}"
            # WhatsApp va primero y es el botón principal: aquí no hay carrito
            # ni pago, el pedido ES el mensaje. "Ver en TiendaMax" mandaba al
            # catálogo entero a quien ya estaba mirando justo el producto que
            # quería, así que pasa a segundo plano.
            acciones_html = (
                f'<a href="{wa_link}" class="tm-btn tm-btn-w" id="tmWa" target="_blank" '
                f'rel="noopener noreferrer">💬 Pedir por WhatsApp</a>\n'
                f'      <a href="{app_url}" class="tm-btn tm-btn-s">🛍️ Ver más en TiendaMax</a>'
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
                f'aria-expanded="false" aria-controls="tmAviso">🔔 Avísame cuando vuelva</button>\n'
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
                f'target="_blank" rel="noopener noreferrer">💬 Escríbeme</a>'
            )

        # El formulario de aviso solo viaja en las fichas agotadas: es lo único
        # que necesitan y no tiene sentido en las que sí se pueden vender.
        aviso_js = "" if stock > 0 else AVISO_JS.format(
            rtdb_json=json.dumps(rtdb), pid_json=json.dumps(str(pid)))
        # El contador, en cambio, va en todas: medir solo las agotadas sería
        # medir justo las que no venden.
        medir_js = MEDIR_JS.format(
            rtdb_json=json.dumps(rtdb), pid_json=json.dumps(str(pid))) if rtdb else ""

        garantia_html = _garantia_html(p)
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
            image=image,
            og_image=og_image,
            og_image_type=og_image_type,
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


def regenerate_category_pages(products: list[dict]) -> tuple[int, list[str]]:
    """Crea/actualiza /c/<slug>.html por categoría: hoy las categorías solo
    existen como #hash en la SPA (invisibles para Google) — estas páginas dan
    contenido real e indexable para búsquedas como 'router wifi cuba'."""
    C_DIR.mkdir(exist_ok=True)
    icons = category_icons()

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

    written = 0
    valid_files = set()

    for cat in cat_names:
        prods = sorted(by_cat[cat], key=lambda p: (int(p.get("stock") or 0) <= 0, -(float(p.get("precioActual") or 0) > 0)))
        en_stock = sum(1 for p in prods if int(p.get("stock") or 0) > 0)
        icon = icons.get(cat, "🛍️")
        html_name = escape(category_display_name(cat))
        slug = slugs[cat]
        page_url = f"{SITE}/c/{slug}.html"
        app_url = f"{SITE}/?categoria={urllib.parse.quote(cat)}"

        title = escape(f"{category_display_name(cat)} en Cuba — Envío a domicilio | TiendaMax")
        desc = escape(
            f"{en_stock} producto{'s' if en_stock != 1 else ''} de {cat.lower()} disponibles en TiendaMax. "
            f"Envío a toda Cuba, pago contra entrega en USD o MN."
        )

        cards = []
        items_jsonld = []
        for i, p in enumerate(prods):
            pid = p.get("id")
            if not pid:
                continue
            name = (p.get("nombre") or "").strip()
            price = f"{float(p.get('precioActual') or 0):.2f}"
            img = escape(p.get("imagen") or f"{SITE}/og-image.jpg", quote=True)
            stock = int(p.get("stock") or 0)
            prod_url = f"{SITE}/p/producto-{pid}.html"
            out_html = '<div class="tm-card-out">Agotado</div>' if stock <= 0 else ""
            cards.append(
                f'<a class="tm-card" href="{prod_url}">'
                f'<img src="{img}" alt="{escape(name)}" loading="lazy">'
                f'<div class="tm-card-body">'
                f'<div class="tm-card-name">{escape(name)}</div>'
                f'<div class="tm-card-price">${price} USD</div>'
                f'{out_html}'
                f'</div></a>'
            )
            items_jsonld.append(json.dumps({
                "@type": "ListItem", "position": i + 1,
                "url": prod_url,
                "name": name,
            }, ensure_ascii=False))

        # Todas las hermanas, no las 11 primeras: con 13 categorías el corte
        # dejaba una fuera de cada página, y siempre la misma — la de menos
        # productos, que es justo la que más necesita que la enlacen.
        other_cats = [c for c in cat_names if c != cat]
        other_cats_html = " ".join(
            f'<a href="{SITE}/c/{slugs[c]}.html">{icons.get(c, "🛍️")} {escape(category_display_name(c))}</a>'
            for c in other_cats
        )

        html = CATEGORY_PAGE_TEMPLATE.format(
            title=title,
            desc=desc,
            page_url=page_url,
            json_title=json.dumps(f"{cat} — TiendaMax"),
            json_desc=json.dumps(desc),
            items_jsonld=",\n    ".join(items_jsonld),
            icon=icon,
            html_name=html_name,
            sub=desc,
            app_url=app_url,
            cards_html="\n    ".join(cards),
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
    enlaces.append(f'<a href="/faq.html" style="{estilo}">Preguntas frecuentes</a>')
    nav = (
        CATS_INICIO + "\n"
        '            <nav aria-label="Categorías" style="text-align:center;padding:14px 0;'
        'border-top:1px solid rgba(255,255,255,.06);margin-top:8px;">\n                '
        + "\n                ".join(enlaces)
        + "\n            </nav>\n            " + CATS_FIN
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

    rtdb = rtdb_url(config)
    if not rtdb:
        print("⚠️  Sin databaseURL en config.json: el 'avísame' de las fichas "
              "agotadas no podrá guardar nada.", file=sys.stderr)

    n_written, removed = regenerate_pages(products, wa_num, rtdb)
    print(f"   Páginas /p/ actualizadas: {n_written}, borradas: {len(removed)}")

    n_cat_written, cat_removed = regenerate_category_pages(products)
    print(f"   Páginas /c/ actualizadas: {n_cat_written}, borradas: {len(cat_removed)}")
    category_slugs = sorted({slugify((p.get("categoria") or "").strip()) for p in products if p.get("categoria")})

    # Mismo orden que las páginas /c/: más productos primero.
    por_cat: dict[str, int] = {}
    for p in products:
        c = (p.get("categoria") or "").strip()
        if c:
            por_cat[c] = por_cat.get(c, 0) + 1
    cats_ordenadas = sorted(por_cat, key=lambda c: -por_cat[c])
    regenerate_home_nav(cats_ordenadas, {c: slugify(c) for c in cats_ordenadas})

    if regenerate_sitemap(products, category_slugs):
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
