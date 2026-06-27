#!/usr/bin/env python3
"""
Recupera la `descripcion` de cada producto desde su página generada
p/producto-{id}.html (JSON-LD > bloque .tm-desc > meta description) y la
escribe SOLO en productos.json (el completo).

productos-lite.json se regenera como productos.json SIN descripcion (igual que
hace el admin), para que el grid siga cargando ligero.

Uso: python3 scripts/fill_descriptions.py   (idempotente; respeta las que ya hay)
"""
import json, os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LD_RE = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.I | re.S)
DESC_BLOCK_RE = re.compile(r'<[^>]*class="[^"]*tm-desc[^"]*"[^>]*>(.*?)</', re.I | re.S)
META_RE = re.compile(r'<meta\s+name="description"\s+content="([^"]*)"', re.I)
TAG_RE = re.compile(r'<[^>]+>')


def _clean(t):
    t = html.unescape(t or '')
    t = TAG_RE.sub('', t)
    return re.sub(r'[ \t]+', ' ', t).strip()


def descripcion_de(pid):
    f = os.path.join(ROOT, 'p', f'producto-{pid}.html')
    if not os.path.exists(f):
        return ''
    txt = open(f, encoding='utf-8').read()
    # 1) JSON-LD (la más completa)
    best = ''
    for block in LD_RE.findall(txt):
        try:
            data = json.loads(block)
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for it in items:
            if isinstance(it, dict) and it.get('description'):
                d = _clean(it['description'])
                if len(d) > len(best):
                    best = d
    if best:
        return best
    # 2) bloque visible .tm-desc
    m = DESC_BLOCK_RE.search(txt)
    if m and _clean(m.group(1)):
        return _clean(m.group(1))
    # 3) meta (truncada, último recurso)
    m = META_RE.search(txt)
    return _clean(m.group(1)) if m else ''


def main():
    pj = os.path.join(ROOT, 'productos.json')
    data = json.load(open(pj, encoding='utf-8'))
    cambiados = sin_fuente = 0
    for p in data:
        if (p.get('descripcion') or '').strip():
            continue
        d = descripcion_de(p.get('id'))
        if d:
            p['descripcion'] = d
            cambiados += 1
        else:
            sin_fuente += 1
            print(f"  ⚠ sin descripción en /p/: {p.get('nombre','?')[:42]}")

    out = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    open(pj, 'w', encoding='utf-8').write(out)
    # lite = full SIN descripcion (igual que el admin)
    lite = [{k: v for k, v in p.items() if k != 'descripcion'} for p in data]
    open(os.path.join(ROOT, 'productos-lite.json'), 'w', encoding='utf-8').write(
        json.dumps(lite, ensure_ascii=False, indent=2) + '\n')

    con = sum(1 for p in data if (p.get('descripcion') or '').strip())
    print(f"\nListo: +{cambiados} descripciones · {con}/{len(data)} con descripción · "
          f"{sin_fuente} sin fuente en /p/")
    print("productos-lite.json regenerado SIN descripcion.")


if __name__ == '__main__':
    main()
