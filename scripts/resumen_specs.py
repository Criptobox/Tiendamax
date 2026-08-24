#!/usr/bin/env python3
"""
Rearma el resumen de arriba (`specs`, los chips bajo el precio) a partir de la
`ficha` del producto, cuando los chips son solo frases de venta.

Por qué: migrada la ficha, quedaban productos con "Tecnología Duradera y
Resistente" arriba —donde el cliente busca el dato— y "Voltaje nominal: 12V"
abajo. El resumen tiene que ser el titular de la ficha, no un eslogan.

Solo actúa si NINGUNA spec tiene etiqueta: si el admin ya escribió aunque sea
una "Etiqueta: Valor", el resumen está curado a mano y no se toca.

    python3 scripts/resumen_specs.py --categoria ENERGIA
    python3 scripts/resumen_specs.py --categoria ENERGIA --aplicar
"""
import argparse, importlib.util, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_s = importlib.util.spec_from_file_location(
    'extraer_ficha', os.path.join(ROOT, 'scripts', 'extraer_ficha.py'))
_ex = importlib.util.module_from_spec(_s); _s.loader.exec_module(_ex)

# Identidad, no especificación: nadie compara dos productos por su marca.
NO_RESUMEN = {'marca', 'modelo', 'tipo', 'aplicación', 'aplicacion',
              'categoría', 'categoria'}
CON_DATO = re.compile(r'\d')


def etiquetada(s):
    _, t = _ex._partir_emoji(s)
    i = t.find(':')
    return 0 < i < len(t) - 1


def partes(fila):
    """(emoji, etiqueta sin emoji) — _limpiar deja el emoji pegado, y compararlo
    así hacía que 'Modelo' no matcheara NO_RESUMEN y que el emoji se duplicara
    al rearmar la spec."""
    emoji, texto = _ex._partir_emoji(fila.get('k'))
    return emoji, _ex._limpiar(texto).rstrip(':')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--categoria', required=True)
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()

    full = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    objetivo = [p for p in full if p.get('categoria') == a.categoria]
    if not objetivo:
        sys.exit(f'No hay productos en {a.categoria}')

    cambios, curados = {}, 0
    for p in objetivo:
        specs, ficha = p.get('specs') or [], p.get('ficha') or []
        if not ficha:
            continue
        if any(etiquetada(s) for s in specs):
            curados += 1                 # ya curado a mano
            continue
        filas = [f for f in ficha
                 if partes(f)[1].lower() not in NO_RESUMEN
                 and str(f.get('v') or '').strip()]
        filas.sort(key=lambda f: 0 if CON_DATO.search(str(f['v'])) else 1)
        nuevas = []
        for fila in filas[:4]:
            emoji, etq = partes(fila)
            txt = f"{etq}: {str(fila['v']).strip()}"
            nuevas.append(f'{emoji} {txt}' if emoji else txt)
        if nuevas and nuevas != specs:
            cambios[p['id']] = (specs, nuevas)

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"} · '
          f'{a.categoria}\n' + '=' * 68)
    for p in objetivo:
        if p['id'] not in cambios:
            continue
        viejas, nuevas = cambios[p['id']]
        print(f"\n{p['nombre'][:56]}")
        for s in viejas: print(f'   -  {_ex._limpiar(s)[:60]}')
        for s in nuevas: print(f'   +  {_ex._limpiar(s)[:60]}')

    print('\n' + '=' * 68)
    print(f'  resúmenes rearmados        : {len(cambios)}')
    print(f'  curados a mano (intactos)  : {curados}')

    if not a.aplicar:
        print(f'\n  Para aplicar:  python3 scripts/resumen_specs.py --categoria {a.categoria} --aplicar')
        return

    for path in ('productos.json', 'productos-lite.json'):
        ruta = os.path.join(ROOT, path)
        datos = json.load(open(ruta, encoding='utf-8'))
        for p in datos:
            if p['id'] in cambios:
                p['specs'] = cambios[p['id']][1]
        tmp = ruta + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2); f.write('\n')
        os.replace(tmp, ruta)
    print(f'\n  ✅ escritos ({len(cambios)} productos)')


if __name__ == '__main__':
    main()
