#!/usr/bin/env python3
"""
Genera `seoTitle` y `seoDescription` HONESTOS para cada producto que no los
tenga, a partir de datos reales (nombre, categoría y descripción). No inventa
nada: el título es el nombre + marca; la descripción son las primeras frases
limpias de la descripción real (o un texto neutro con nombre/categoría si la
descripción es muy corta).

Escribe en productos.json (completo) y regenera productos-lite.json = completo
SIN `descripcion` (igual que el admin), conservando specs/radar/seo*.

`regenerate_artifacts.py` ya consume seoTitle/seoDescription para el <title> y
los <meta> de las páginas /p/.

Uso: python3 scripts/fill_seo.py   (idempotente; respeta los que ya tienen seo)
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLE_MAX = 60
DESC_MAX = 155

# limpia viñetas (* y • usadas como marcadores de lista) y espacios/saltos
BULLET_RE = re.compile(r'\s*[*•]+\s*')
WS_RE = re.compile(r'\s+')


def limpiar(t):
    t = BULLET_RE.sub(' ', t or '')
    return WS_RE.sub(' ', t).strip()


def recortar(t, n):
    """Recorta a n caracteres por límite de palabra, con … si se cortó."""
    t = (t or '').strip()
    if len(t) <= n:
        return t
    cut = t[:n].rsplit(' ', 1)[0].rstrip(' ,.;:-')
    return (cut or t[:n]).rstrip() + '…'


def _atomic_write(path, text):
    """Escribe text en path de forma atómica (temp file + os.replace) para no
    dejar el JSON truncado si el proceso se corta a mitad de escritura."""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, path)


def seo_title(p):
    nombre = (p.get('nombre') or '').strip()
    if not nombre:
        return 'TiendaMax'
    for cand in (f"{nombre} en Cuba | TiendaMax", f"{nombre} | TiendaMax", nombre):
        if len(cand) <= TITLE_MAX:
            return cand
    # nombre demasiado largo: recorta el nombre para que entre con la marca
    sufijo = " | TiendaMax"
    return recortar(nombre, TITLE_MAX - len(sufijo)) + sufijo


def seo_desc(p):
    desc = limpiar(p.get('descripcion') or '')
    if len(desc) >= 40:
        return recortar(desc, DESC_MAX)
    # descripción muy corta o ausente: texto neutro y veraz
    nombre = (p.get('nombre') or 'Producto').strip()
    cat = (p.get('categoria') or '').strip()
    base = f"{nombre} disponible en TiendaMax"
    if cat:
        base += f" · {cat.title()}"
    base += ". Compra en Cuba con pago contra entrega."
    return recortar(base, DESC_MAX)


def main():
    pj = os.path.join(ROOT, 'productos.json')
    data = json.load(open(pj, encoding='utf-8'))
    cambiados = 0
    for p in data:
        toco = False
        if not (p.get('seoTitle') or '').strip():
            p['seoTitle'] = seo_title(p); toco = True
        if not (p.get('seoDescription') or '').strip():
            p['seoDescription'] = seo_desc(p); toco = True
        if toco:
            cambiados += 1
            print(f"  + {(p.get('nombre') or '?')[:34]:34} · {p['seoTitle']}")

    if not cambiados:
        print('Nada que rellenar (todos tienen seo).')
        return

    out = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    _atomic_write(pj, out)
    # lite = completo SIN descripcion (igual que el admin)
    lite = [{k: v for k, v in p.items() if k != 'descripcion'} for p in data]
    _atomic_write(os.path.join(ROOT, 'productos-lite.json'),
                  json.dumps(lite, ensure_ascii=False, indent=2) + '\n')

    ct = sum(1 for p in data if (p.get('seoTitle') or '').strip())
    cd = sum(1 for p in data if (p.get('seoDescription') or '').strip())
    print(f"\nListo: +{cambiados} productos con SEO · {ct}/{len(data)} seoTitle · "
          f"{cd}/{len(data)} seoDescription")
    print("productos-lite.json regenerado SIN descripcion.")


if __name__ == '__main__':
    main()
