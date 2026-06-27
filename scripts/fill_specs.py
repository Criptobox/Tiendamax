#!/usr/bin/env python3
"""
Rellena el campo `specs` de los productos que no lo tengan, extrayendo las
especificaciones numéricas (12V, 2000W, 128GB, IP65…) desde la descripción de
cada producto, que vive en las páginas generadas p/producto-{id}.html.

Mismo criterio que el storefront (js/src/tm-product.src.js) para que coincidan.
Uso: python3 scripts/fill_specs.py  (idempotente; solo toca productos sin specs)
"""
import json, re, os, glob, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# (?<!\d\s) evita el "000" de miles separados por espacio (10 000 mAh)
# (?![-\d]) evita grados de viscosidad de aceite (5W-30, 20W-50)
SPEC_RE = re.compile(r'(?<!\d\s)\b(\d+(?:[.,]\d+)?)\s*(W|V|Ah|A|GB|TB|Mbps|GHz|MHz|HP|mAh|KV|kW)\b(?![-\d])', re.I)
IP_RE = re.compile(r'\bIP\d{2}\b', re.I)
# Lubricantes: el "10W-40 / 20W50" es viscosidad, no una spec útil → se omiten.
OIL_RE = re.compile(r'MANNOL|FANFARO|ACEITE|LUBRICA|\bSAE\b|MOTORBIKE|TAKT', re.I)
META_RE = re.compile(r'<meta\s+name="description"\s+content="([^"]*)"', re.I)
LD_RE = re.compile(r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"')


def descripcion_de(pid):
    """Lee la descripción del producto desde su página /p/ (meta o JSON-LD)."""
    f = os.path.join(ROOT, 'p', f'producto-{pid}.html')
    if not os.path.exists(f):
        return ''
    txt = open(f, encoding='utf-8').read()
    m = META_RE.search(txt) or LD_RE.search(txt)
    if not m:
        return ''
    return html.unescape(m.group(1)).replace('\\"', '"').replace('\\n', ' ')


def extraer_specs(desc):
    out, seen = [], set()
    for m in SPEC_RE.finditer(desc or ''):
        s = re.sub(r'\s+', '', m.group(0))
        k = s.upper()
        if k not in seen:
            seen.add(k); out.append(s)
        if len(out) >= 4:
            break
    ip = IP_RE.search(desc or '')
    if ip and len(out) < 4 and ip.group(0).upper() not in seen:
        out.append(ip.group(0).upper())
    return out


def main():
    pj = os.path.join(ROOT, 'productos.json')
    data = json.load(open(pj, encoding='utf-8'))
    cambiados = 0
    for p in data:
        if p.get('specs'):          # respeta los que ya tienen specs
            continue
        desc = descripcion_de(p.get('id'))
        if OIL_RE.search((p.get('nombre', '') + ' ' + desc)):
            continue                # lubricantes: la viscosidad no es spec
        specs = extraer_specs(desc)
        if specs:
            p['specs'] = specs
            cambiados += 1
            print(f"  + {p.get('nombre','?')[:40]:40} -> {specs}")
    if not cambiados:
        print('Nada que rellenar.')
        return
    out = json.dumps(data, ensure_ascii=False, indent=2)
    open(pj, 'w', encoding='utf-8').write(out + '\n')
    # productos-lite.json es idéntico en este repo
    lite = os.path.join(ROOT, 'productos-lite.json')
    if os.path.exists(lite):
        open(lite, 'w', encoding='utf-8').write(out + '\n')
    print(f"\nListo: {cambiados} productos con specs rellenadas.")


if __name__ == '__main__':
    main()
