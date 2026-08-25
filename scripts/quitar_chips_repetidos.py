#!/usr/bin/env python3
"""
Quita los chips que repiten el nombre del producto.

Bajo el precio, "⚡ Generador Solar Portátil BLUETTI AC180" en un producto que
se llama así ocupa el sitio de un dato y no dice nada nuevo. Un chip vale por
lo que añade al nombre que el cliente acaba de leer.

Se borra solo el que no aporta NI UNA palabra nueva Y además es una frase
(tres palabras o más). Los cortos se quedan aunque repitan —"🚀 1200 Mbps",
"⚡ 80A MPPT"—: ahí la repetición es el punto, el ojo encuentra la cifra sin
leer el nombre entero.

    python3 scripts/quitar_chips_repetidos.py
    python3 scripts/quitar_chips_repetidos.py --aplicar
"""
import argparse, json, os, re, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_PALABRAS = 3


def palabras(t):
    t = unicodedata.normalize('NFD', str(t or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return [w for w in re.sub(r'[^a-z0-9 ]+', ' ', t).split() if w]


def sobra(chip, nombre):
    w = set(palabras(chip))
    if not w or len(w) < MIN_PALABRAS:
        return False
    return not (w - set(palabras(nombre)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()

    full = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    cambios = {}
    for p in full:
        specs = p.get('specs') or []
        quedan = [s for s in specs if not sobra(s, p['nombre'])]
        if len(quedan) != len(specs):
            cambios[p['id']] = (specs, quedan)

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"}\n' + '=' * 70)
    porId = {p['id']: p for p in full}
    vacios = 0
    for pid, (viejas, nuevas) in cambios.items():
        print(f'\n{porId[pid]["nombre"][:52]}')
        for s in viejas:
            print(('   -  ' if s not in nuevas else '      ') + str(s)[:56])
        if not nuevas:
            vacios += 1
            print('      ⚠️ se queda sin chips')
    print('\n' + '=' * 70)
    print(f'  productos tocados : {len(cambios)}')
    print(f'  chips quitados    : {sum(len(v) - len(n) for v, n in cambios.values())}')
    print(f'  quedan sin chips  : {vacios}')

    if not a.aplicar:
        print('\n  Para aplicar:  python3 scripts/quitar_chips_repetidos.py --aplicar')
        return

    for path in ('productos.json', 'productos-lite.json'):
        ruta = os.path.join(ROOT, path)
        datos = json.load(open(ruta, encoding='utf-8'))
        n = 0
        for p in datos:
            if p['id'] in cambios:
                p['specs'] = cambios[p['id']][1]; n += 1
        tmp = ruta + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2); f.write('\n')
        os.replace(tmp, ruta)
        print(f'  {path}: {n} productos')


if __name__ == '__main__':
    main()
