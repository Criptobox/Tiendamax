#!/usr/bin/env python3
"""
Mueve a los campos `ficha`, `caracteristicas` e `idealPara` los datos que ya
estaban escritos como texto dentro de `descripcion`, y le saca a la descripción
ese bloque para que el dato no quede escrito en dos lugares (que es lo que hacía
que se contradijeran).

NO inventa nada: solo reubica. Los productos que ya tienen `ficha` cargada a
mano no se tocan.

    python3 scripts/migrar_ficha.py --categoria ENERGIA
    python3 scripts/migrar_ficha.py --categoria ENERGIA --aplicar
"""
import argparse, importlib.util, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    'extraer_ficha', os.path.join(ROOT, 'scripts', 'extraer_ficha.py'))
_ex = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ex)

# "Tipo"/"Aplicación" son clasificaciones cortas: son dato de ficha, no una
# característica. "Uso" describe a quién le sirve: eso es `idealPara`.
A_FICHA = {'tipo', 'aplicación', 'aplicacion', 'categoría', 'categoria'}
A_IDEAL = {'uso', 'usos', 'aplicaciones'}

CORTE = re.compile(r'\n\s*[​\s]*(?:⚙️|📊)?\s*(?:ficha t[eé]cnica|especificaciones)', re.I)


def solo_pitch(desc):
    m = CORTE.search(desc or '')
    return (desc[:m.start()] if m else desc or '').strip()


def repartir(desc):
    """descripcion -> (ficha, caracteristicas, idealPara)."""
    _, ficha, cars = _ex.parsear(desc)
    fichas, otras, ideal = list(ficha), [], []
    for c in cars:
        etq = _ex._limpiar(c['t']).lower().rstrip(':')
        if etq in A_IDEAL:
            ideal.append(_ex._limpiar(c['d']))
        elif etq in A_FICHA and len(_ex._limpiar(c['d'])) <= 60:
            fichas.append({'k': c['t'], 'v': _ex._limpiar(c['d']).rstrip('.')})
        else:
            otras.append(c)
    return fichas, otras, ideal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--categoria', required=True)
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()

    full = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    objetivo = [p for p in full if p.get('categoria') == a.categoria]
    if not objetivo:
        sys.exit(f'No hay productos en {a.categoria}')

    cambios, ya, vacios = {}, 0, 0
    for p in objetivo:
        if p.get('ficha'):          # cargado a mano: no se toca
            ya += 1
            continue
        f, c, i = repartir(p.get('descripcion'))
        if not f and not c and not i:
            vacios += 1
            continue
        nuevo = {}
        if f: nuevo['ficha'] = f
        if c: nuevo['caracteristicas'] = c
        if i: nuevo['idealPara'] = i
        pitch = solo_pitch(p.get('descripcion'))
        if pitch:
            nuevo['descripcion'] = pitch
        cambios[p['id']] = nuevo

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"} · '
          f'{a.categoria} · {len(objetivo)} productos\n' + '=' * 68)
    for p in objetivo:
        n = cambios.get(p['id'])
        if not n:
            continue
        print(f"\n{p['nombre'][:58]}")
        for f in n.get('ficha', []):
            print(f"   ficha   {_ex._limpiar(f['k'])[:30]:32} = {f['v'][:38]}")
        for c in n.get('caracteristicas', []):
            print(f"   caract  {_ex._limpiar(c['t'])[:30]:32} = {c['d'][:38]}…")
        for t in n.get('idealPara', []):
            print(f"   ideal   {t[:70]}")

    print('\n' + '=' * 68)
    print(f'  productos que cambian      : {len(cambios)}')
    print(f'  ya tenían ficha (intactos) : {ya}')
    print(f'  sin nada que extraer       : {vacios}')
    print(f'  filas de ficha             : {sum(len(v.get("ficha", [])) for v in cambios.values())}')
    print(f'  características            : {sum(len(v.get("caracteristicas", [])) for v in cambios.values())}')
    print(f'  ideal para                 : {sum(len(v.get("idealPara", [])) for v in cambios.values())}')

    if not a.aplicar:
        print(f'\n  Para aplicar:  python3 scripts/migrar_ficha.py --categoria {a.categoria} --aplicar')
        return

    for path in ('productos.json', 'productos-lite.json'):
        ruta = os.path.join(ROOT, path)
        datos = json.load(open(ruta, encoding='utf-8'))
        for p in datos:
            n = cambios.get(p['id'])
            if not n:
                continue
            for k, v in n.items():
                # productos-lite.json no lleva `descripcion`: ese es su contrato
                if k == 'descripcion' and 'descripcion' not in p:
                    continue
                p[k] = v
        tmp = ruta + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2); f.write('\n')
        os.replace(tmp, ruta)
    print(f'\n  ✅ escritos productos.json y productos-lite.json ({len(cambios)} productos)')


if __name__ == '__main__':
    main()
