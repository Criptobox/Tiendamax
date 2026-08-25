#!/usr/bin/env python3
"""
Corrige las fichas de aceite que dicen "Potencia: 10W".

En "10W-40" la W es el grado de viscosidad SAE en frío (W de *winter*), no
vatios. Una migración anterior leyó el número del nombre como si fuera
potencia y dejó publicado "Potencia: 5W" en un aceite de motor, que además de
falso no le sirve a nadie: quien compra aceite busca justamente la viscosidad.

El valor no se inventa — se lee del nombre del producto, que trae el grado
completo ("Mannol Safari 20W - 50 7404 5L" -> 20W-50). Si el nombre no lo
trae, el producto se deja como está y se avisa.

    python3 scripts/arreglar_viscosidad.py
    python3 scripts/arreglar_viscosidad.py --aplicar
"""
import argparse, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# "5W30", "20W - 50", "10W-40": el separador puede traer espacios del nombre.
GRADO = re.compile(r'\b(\d{1,2})\s*W\s*-?\s*(\d{2})\b', re.I)
# Solo vatios sueltos: "Potencia: 1800W" en un inversor es correcto y no se toca.
SOLO_W = re.compile(r'^\s*\d+\s*W\s*$', re.I)


def grado_del_nombre(nombre):
    m = GRADO.search(nombre or '')
    return f'{m.group(1)}W-{m.group(2)}' if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()

    full = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    cambios, sin_grado = {}, []
    for p in full:
        for i, f in enumerate(p.get('ficha') or []):
            if 'potencia' not in str(f.get('k', '')).lower():
                continue
            if not SOLO_W.match(str(f.get('v', ''))):
                continue
            grado = grado_del_nombre(p['nombre'])
            if not grado:
                # Sin grado en el nombre no hay de dónde sacarlo: puede ser
                # potencia de verdad (una linterna de 30W). No se toca.
                sin_grado.append((p['nombre'], f.get('v')))
                continue
            cambios.setdefault(p['id'], []).append((i, f.get('v'), grado))

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"}\n' + '=' * 70)
    porId = {p['id']: p for p in full}
    for pid, filas in cambios.items():
        print(f'\n{porId[pid]["nombre"][:52]}')
        for _, viejo, nuevo in filas:
            print(f'   -  Potencia: {viejo}')
            print(f'   +  Viscosidad (SAE): {nuevo}')
    print('\n' + '=' * 70)
    print(f'  fichas corregidas          : {sum(len(v) for v in cambios.values())}')
    print(f'  "Potencia: NW" que se dejan: {len(sin_grado)}  (sin grado en el nombre '
          f'= es potencia de verdad)')
    for n, v in sin_grado:
        print(f'      · {n[:46]:48} {v}')

    if not a.aplicar:
        print('\n  Para aplicar:  python3 scripts/arreglar_viscosidad.py --aplicar')
        return

    for path in ('productos.json', 'productos-lite.json'):
        ruta = os.path.join(ROOT, path)
        datos = json.load(open(ruta, encoding='utf-8'))
        n = 0
        for p in datos:
            for i, _, grado in cambios.get(p['id'], []):
                ficha = p.get('ficha') or []
                if i < len(ficha):
                    ficha[i]['k'] = 'Viscosidad (SAE)'
                    ficha[i]['v'] = grado
                    n += 1
        tmp = ruta + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(datos, fh, ensure_ascii=False, indent=2); fh.write('\n')
        os.replace(tmp, ruta)
        print(f'  {path}: {n} fichas')


if __name__ == '__main__':
    main()
