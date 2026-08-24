#!/usr/bin/env python3
"""
Importa las fichas del catálogo HTML que arma el dueño y las vuelca en
`ficha`, `caracteristicas`, `idealPara` e `incluye` de cada producto.

El HTML trae una tarjeta por producto precedida por un comentario
"<!-- Product ID: 123 -->", que es lo que permite emparejar sin adivinar por
nombre (hay nombres casi idénticos entre los controladores MPPT).

NO toca precio, stock ni garantía: eso lo maneja el admin. La garantía del
HTML es un pie genérico igual en las 130 tarjetas, no un dato del producto.

    python3 scripts/importar_catalogo_html.py <archivo.html>
    python3 scripts/importar_catalogo_html.py <archivo.html> --aplicar
"""
import argparse, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TARJETA = re.compile(
    r'<!--\s*Product ID:\s*(\d+)\s*-->\s*(<article class="product-card".*?</article>)',
    re.S)
ETIQUETA = re.compile(r'<div class="section-label">([^<]+)</div>', re.I)
SPEC = re.compile(
    r'<li class="spec-item">\s*'
    r'(?:<span class="spec-icon">([^<]*)</span>\s*)?'
    r'<span class="spec-name">([^<]*)</span>\s*'
    r'<span class="spec-value">(.*?)</span>\s*</li>', re.S)
FEATURE = re.compile(
    r'<li class="feature-item">\s*(?:<span class="feature-icon">([^<]*)</span>\s*)?'
    r'<span>(.*?)</span>\s*</li>', re.S)
INCLUYE = re.compile(
    r'<li class="includes-item">\s*(?:<span class="includes-icon">[^<]*</span>)?\s*(.*?)</li>', re.S)
IDEAL = re.compile(r'<p class="ideal-text">(.*?)</p>', re.S)
RESUMEN = re.compile(r'<p class="summary-text">(.*?)</p>', re.S)
TITULO = re.compile(r'<h2 class="product-title">(.*?)</h2>', re.S)

# Los iconos del HTML son de relleno (📋 en todas las specs, ✨ en todas las
# features): no aportan nada y en el sitio se convierten en el mismo dibujo.
GENERICOS = {'📋', '✨', '📦', '🏠', ''}

# Relleno de plantilla: el HTML se lo pone a casi todo. Una creatina no trae
# "accesorios de conexión" ni "manual del fabricante", y publicarlo es prometer
# algo que la caja no tiene.
INCLUYE_RELLENO = {
    'accesorios de conexión / instalación',
    'manual de instrucciones del fabricante',
}
# "Usuarios que buscan máxima calidad y durabilidad en productos de Ropa":
# la plantilla con el nombre de la categoría pegado, no dice nada del producto.
IDEAL_RELLENO = re.compile(
    r'^usuarios que buscan m[áa]xima calidad y durabilidad en productos de\b', re.I)


def es_relleno_incluye(t):
    limpio = re.sub(r'^\d+\s*x\s*', '', t, flags=re.I).strip().rstrip('.').lower()
    return limpio in INCLUYE_RELLENO


def limpiar(t):
    t = re.sub(r'<[^>]+>', '', t or '')
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


def parsear(archivo):
    s = open(archivo, encoding='utf-8').read()
    fichas = {}
    for pid, card in TARJETA.findall(s):
        # La aclaración entre paréntesis al final se guarda aparte, para que el
        # valor siga siendo comparable entre productos.
        ficha = []
        for icono, nombre, valor in SPEC.findall(card):
            k, v = limpiar(nombre).rstrip(':'), limpiar(valor)
            if not k or not v:
                continue
            fila = {'k': k, 'v': v}
            m = re.match(r'^(.*?)\s*\(\s*([^()]{4,})\)\s*\.?$', v)
            if m and m.group(1).strip():
                fila['v'], fila['nota'] = m.group(1).strip(), m.group(2).strip()
            ico = limpiar(icono)
            if ico and ico not in GENERICOS:
                fila['k'] = f'{ico} {fila["k"]}'
            ficha.append(fila)

        cars = [{'d': limpiar(txt)} for _, txt in FEATURE.findall(card) if limpiar(txt)]
        incluye = [limpiar(x) for x in INCLUYE.findall(card)
                   if limpiar(x) and not es_relleno_incluye(limpiar(x))]
        ideal = [limpiar(x) for x in IDEAL.findall(card)
                 if limpiar(x) and not IDEAL_RELLENO.match(limpiar(x))]
        resumen = [limpiar(x) for x in RESUMEN.findall(card) if limpiar(x)]

        fichas[int(pid)] = {
            'nombre': limpiar((TITULO.search(card) or [None, ''])[1] if False
                              else (TITULO.search(card).group(1) if TITULO.search(card) else '')),
            'ficha': ficha, 'caracteristicas': cars,
            'idealPara': ideal, 'incluye': incluye,
            'resumen': resumen[0] if resumen else '',
        }
    _quitar_caracteristicas_de_plantilla(fichas)
    return fichas


def _quitar_caracteristicas_de_plantilla(fichas, umbral=8):
    """Saca las frases que se repiten en muchos productos y no traen ningún dato.

    Una frase compartida por varios productos puede ser cierta ("doble banda
    AC1200..." en siete routers), pero si además no tiene un solo número es
    plantilla: "Fabricado bajo estrictos estándares para máxima durabilidad"
    aparece en 21 productos distintos y no dice nada de ninguno."""
    from collections import Counter
    veces = Counter(c['d'] for f in fichas.values() for c in f['caracteristicas'])
    plantilla = {t for t, n in veces.items()
                 if n >= umbral and not re.search(r'\d', t)}
    for f in fichas.values():
        f['descartadas'] = [c['d'] for c in f['caracteristicas'] if c['d'] in plantilla]
        f['caracteristicas'] = [c for c in f['caracteristicas'] if c['d'] not in plantilla]
    fichas['_plantilla'] = plantilla


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('archivo')
    ap.add_argument('--aplicar', action='store_true')
    ap.add_argument('--categoria', help='limitar a una categoría del catálogo')
    a = ap.parse_args()

    if not os.path.exists(a.archivo):
        sys.exit(f'No existe: {a.archivo}')
    fichas = parsear(a.archivo)
    plantilla = fichas.pop('_plantilla', set())
    full = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    porId = {p['id']: p for p in full}

    encontrados = {i: f for i, f in fichas.items() if i in porId}
    huerfanos = sorted(set(fichas) - set(porId))
    sin_ficha = [p['id'] for p in full if p['id'] not in fichas]

    if a.categoria:
        encontrados = {i: f for i, f in encontrados.items()
                       if porId[i].get('categoria') == a.categoria}

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"}\n' + '=' * 68)
    print(f'  tarjetas en el HTML          : {len(fichas)}')
    print(f'  emparejadas con productos.json: {len(encontrados)}')
    print(f'  en el HTML pero no en el catálogo: {len(huerfanos)}')
    if huerfanos:
        for i in huerfanos[:10]:
            print(f'      · {i}  {fichas[i]["nombre"][:46]}')
    print(f'  en el catálogo pero no en el HTML: {len(sin_ficha)}')
    for i in sin_ficha[:10]:
        print(f'      · {i}  {porId[i]["nombre"][:46]}')

    vacios = [i for i, f in encontrados.items()
              if not f['ficha'] and not f['caracteristicas'] and not f['incluye']]
    print(f'\n  tarjetas sin nada que cargar : {len(vacios)}')
    for i in vacios[:10]:
        print(f'      · {porId[i]["nombre"][:52]}')

    descartadas = sum(len(f.get('descartadas', [])) for f in encontrados.values())
    if plantilla:
        print(f'\n  frases de plantilla descartadas: {descartadas} '
              f'({len(plantilla)} distintas, repetidas en muchos productos y sin ningún dato)')
        for t in sorted(plantilla)[:6]:
            print(f'      · {t[:70]}')

    tot = lambda k: sum(len(f[k]) for f in encontrados.values())
    print(f'\n  filas de ficha   : {tot("ficha")}')
    print(f'  características  : {tot("caracteristicas")}')
    print(f'  ideal para       : {tot("idealPara")}')
    print(f'  incluye          : {tot("incluye")}')

    if not a.aplicar:
        print(f'\n  Para aplicar:  python3 scripts/importar_catalogo_html.py {a.archivo} --aplicar')
        return

    for path in ('productos.json', 'productos-lite.json'):
        ruta = os.path.join(ROOT, path)
        datos = json.load(open(ruta, encoding='utf-8'))
        n = 0
        for p in datos:
            f = encontrados.get(p['id'])
            if not f:
                continue
            for campo in ('ficha', 'caracteristicas', 'idealPara', 'incluye'):
                if f[campo]:
                    p[campo] = f[campo]
            n += 1
        tmp = ruta + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(datos, fh, ensure_ascii=False, indent=2); fh.write('\n')
        os.replace(tmp, ruta)
        print(f'  {path}: {n} productos')


if __name__ == '__main__':
    main()
