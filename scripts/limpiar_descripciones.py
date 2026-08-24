#!/usr/bin/env python3
"""
Saca de `descripcion` el bloque "Ficha Técnica:"/"Especificaciones" en los
productos que ya tienen el campo `ficha`, para que el dato no salga dos veces
en la pantalla: la ficha nueva arriba y el mismo texto viejo abajo.

Antes de borrar, rescata lo que el bloque dice y la ficha no. Al importar el
catálogo HTML se cargó la ficha pero se dejó el texto intacto, y ese texto
tenía cosas que el HTML no traía (el "Botón Turbo" de un router, el "Plug &
Play" de un switch): borrarlo a secas las perdía.

    python3 scripts/limpiar_descripciones.py
    python3 scripts/limpiar_descripciones.py --aplicar
"""
import argparse, importlib.util, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_s = importlib.util.spec_from_file_location(
    'extraer_ficha', os.path.join(ROOT, 'scripts', 'extraer_ficha.py'))
_ex = importlib.util.module_from_spec(_s); _s.loader.exec_module(_ex)

CORTE = re.compile(r'\n\s*[​\s]*(?:⚙️|📊)?\s*(?:ficha t[eé]cnica|especificaciones)', re.I)
A_IDEAL = {'uso', 'usos', 'aplicaciones'}
# Debajo de este porcentaje de palabras nuevas se considera que la frase ya
# está dicha en la ficha y no hace falta rescatarla.
UMBRAL_NUEVO = 0.34


def _norm(t):
    t = unicodedata.normalize('NFD', str(t or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


def _cubierta_por(texto, ya):
    w = set(_norm(texto).split())
    if not w:
        return True
    return len(w - ya) / len(w) < UMBRAL_NUEVO


def _vocabulario(p):
    partes = [f"{x.get('k','')} {x.get('v','')} {x.get('nota','')}" for x in (p.get('ficha') or [])]
    for c in (p.get('caracteristicas') or []):
        partes.append(c if isinstance(c, str) else c.get('d', ''))
    for t in (p.get('idealPara') or []):
        partes.append(t)
    return set(_norm(' '.join(partes)).split())


def rescatar(p):
    """(caracteristicas nuevas, idealPara nuevos, descripcion sin el bloque)."""
    desc = p.get('descripcion') or ''
    m = CORTE.search(desc)
    if not m:
        return [], [], desc
    _, fich, cars = _ex.parsear(desc)
    ya = _vocabulario(p)
    nuevas, ideales = [], []
    # Las filas de la ficha del texto también cuentan: si el HTML no trajo ese
    # dato, la frase del catálogo viejo es lo único que lo dice.
    for c in list(cars) + [{'t': x['k'], 'd': x['v']} for x in fich]:
        etq = _ex._limpiar(c['t']).lower().rstrip(':')
        txt = _ex._limpiar(c['d'])
        if not txt or _cubierta_por(f"{etq} {txt}", ya):
            continue
        if etq in A_IDEAL:
            ideales.append(txt)
        else:
            nuevas.append({'t': c['t'], 'd': txt})
    return nuevas, ideales, desc[:m.start()].strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()

    full = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    cambios = {}
    for p in full:
        if not p.get('ficha') or not CORTE.search(p.get('descripcion') or ''):
            continue
        nuevas, ideales, pitch = rescatar(p)
        if not pitch:
            # Sin párrafo de venta antes del bloque no se toca: dejaría al
            # producto sin ninguna descripción.
            continue
        c = {'descripcion': pitch}
        if nuevas:
            c['caracteristicas'] = list(p.get('caracteristicas') or []) + nuevas
        if ideales:
            c['idealPara'] = list(p.get('idealPara') or []) + ideales
        cambios[p['id']] = (c, nuevas, ideales)

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"}\n' + '=' * 68)
    porId = {p['id']: p for p in full}
    for i, (c, nuevas, ideales) in list(cambios.items())[:8]:
        print(f"\n{porId[i]['nombre'][:54]}")
        for n in nuevas[:3]:
            print(f"   rescata caract  {_ex._limpiar(n['t'])[:22]:24} = {n['d'][:40]}…")
        for t in ideales[:2]:
            print(f"   rescata ideal   {t[:62]}")
    print('\n' + '=' * 68)
    print(f'  descripciones a limpiar : {len(cambios)}')
    print(f'  características rescatadas: {sum(len(n) for _, n, _ in cambios.values())}')
    print(f'  ideal para rescatados     : {sum(len(i) for _, _, i in cambios.values())}')
    sin_tocar = sum(1 for p in full
                    if p.get('ficha') and CORTE.search(p.get('descripcion') or '')
                    and p['id'] not in cambios)
    if sin_tocar:
        print(f'  sin párrafo de venta (no se tocan): {sin_tocar}')

    if not a.aplicar:
        print('\n  Para aplicar:  python3 scripts/limpiar_descripciones.py --aplicar')
        return

    for path in ('productos.json', 'productos-lite.json'):
        ruta = os.path.join(ROOT, path)
        datos = json.load(open(ruta, encoding='utf-8'))
        n = 0
        for p in datos:
            if p['id'] not in cambios:
                continue
            for k, v in cambios[p['id']][0].items():
                # productos-lite.json no lleva `descripcion`: ese es su contrato
                if k == 'descripcion' and 'descripcion' not in p:
                    continue
                p[k] = v
            n += 1
        tmp = ruta + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2); f.write('\n')
        os.replace(tmp, ruta)
        print(f'  {path}: {n} productos')


if __name__ == '__main__':
    main()
