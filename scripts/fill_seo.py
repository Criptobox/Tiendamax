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
     python3 scripts/fill_seo.py --titulos   (rehace TODOS los seoTitle desde el
         nombre actual: los viejos venían de nombres anteriores —«PROTEGE TU
         HOGAR» para un timbre— y 48 estaban en mayúsculas)
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLE_MAX = 60
DESC_MAX = 155

# limpia viñetas (* y • usadas como marcadores de lista) y espacios/saltos
BULLET_RE = re.compile(r'\s*[*•]+\s*')
WS_RE = re.compile(r'\s+')
# emoji/zero-width inicial del nombre (mismo criterio que _cStrip en
# js/admin-copilot.js): no pinta nada en un <title>/<meta> de texto plano.
EMOJI_INICIAL_RE = re.compile(
    r'^[\s​﻿]*(?:[\U0001F300-\U0001FAFF☀-➿️‍]+\s*)+'
)


def limpiar(t):
    t = BULLET_RE.sub(' ', t or '')
    return WS_RE.sub(' ', t).strip()


def sin_emoji_inicial(t):
    return EMOJI_INICIAL_RE.sub('', t or '').strip()


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


# Cualquier emoji, no solo el del principio ("Beat Boom F10! 🎶🔥"): mismo
# criterio que nombre_limpio() en regenerate_artifacts.py.
EMOJI_RE = re.compile(r"[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D\u2B00-\u2BFF\u2190-\u21FF\u2900-\u297F]")


def nombre_titulo(nombre):
    """El nombre tal cual lo escribió el gestor, sin emoji ni espacios de
    más ("( V380 PRO )" → "(V380 PRO)"). No cambia mayúsculas: una marca o un
    modelo en mayúsculas (POWMR, AC1200) tiene que seguir así."""
    t = EMOJI_RE.sub(' ', nombre or '')
    t = re.sub(r'\(\s+', '(', t)
    t = re.sub(r'\s+\)', ')', t)
    return WS_RE.sub(' ', t).strip()


def seo_title(p):
    nombre = nombre_titulo(p.get('nombre') or '')
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
    nombre = sin_emoji_inicial(p.get('nombre') or '') or 'Producto'
    cat = (p.get('categoria') or '').strip()
    base = f"{nombre} disponible en TiendaMax"
    if cat:
        base += f" · {cat.title()}"
    base += ". Compra en Cuba con pago contra entrega."
    return recortar(base, DESC_MAX)


def main(argv=None):
    import sys
    rehacer = '--titulos' in (sys.argv[1:] if argv is None else argv)
    pj = os.path.join(ROOT, 'productos.json')
    data = json.load(open(pj, encoding='utf-8'))
    cambiados = 0
    for p in data:
        toco = False
        if rehacer and p.get('nombre') and p.get('seoTitle') != seo_title(p):
            p['seoTitle'] = seo_title(p); toco = True
        elif not (p.get('seoTitle') or '').strip():
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
