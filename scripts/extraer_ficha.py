#!/usr/bin/env python3
"""
Extrae la ficha estructurada que YA está escrita dentro de `descripcion`, en
texto plano, y la separa en los bloques de la plantilla nueva.

NO inventa nada y NO escribe productos.json. Solo produce un archivo de
trabajo (scripts/ficha-datos.json) que alimenta al editor
scripts/ficha-editor.html, donde el admin confirma y completa a mano.

Cada dato sale etiquetado con su ORIGEN para que se vea qué está verificado:
  repo      -> venía en la descripción del propio catálogo
  (el editor agrega 'web' y 'mano' cuando el admin los carga)

Uso: python3 scripts/extraer_ficha.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EMOJI = re.compile(r'^[\U0001F000-\U0001FAFF☀-➿️‍←-⇿⬀-⯿]+\s*')
# Un "dato duro" es un valor corto que trae número+unidad, un porcentaje,
# una temperatura, un IP-rating o simplemente es muy corto (una marca, un color).
UNIDAD = re.compile(
    r'\d+\s*(?:W|VA|V|Ah|mAh|A|Wh|kWh|kW|GB|TB|MB|Mbps|Gbps|GHz|MHz|HP|KV|rpm|cc|km|kg|g|mm|cm|m|L|ml|°C|%|"|pulg|dBi|lm|px|Hz)\b'
    r'|\bIP\d{2}\b|\b\d{3,4}p\b|\b\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+',
    re.I)

CABECERAS = re.compile(r'^\s*(?:⚙️|📊|⚡|🎯|📦|🔧)?\s*(ficha t[eé]cnica|especificaciones(?:\s*\(specs\))?|caracter[ií]sticas(?:\s+principales)?|ideal para|qu[eé] incluye|contenido de la caja)\s*:?\s*$',
                       re.I)


def _limpiar(s):
    s = re.sub(r'​', '', str(s or '')).strip()
    return re.sub(r'\s+', ' ', s)


def _sin_punto(s):
    """Quita el punto final: 'Tataliken.' es una frase, 'Tataliken' es un dato."""
    return re.sub(r'\s*\.\s*$', '', _limpiar(s))


def _partir_emoji(s):
    """Separa el emoji inicial del texto, como hace tmPartirEmoji en el front."""
    s = _limpiar(s)
    m = EMOJI.match(s)
    return (m.group(0).strip(), s[m.end():].strip()) if m else ('', s)


def _es_dato_duro(valor):
    """¿Este valor es un dato comparable o es una frase de venta?"""
    v = _limpiar(valor)
    if not v:
        return False
    if len(v) > 60:                 # una oración, no un dato
        return False
    if UNIDAD.search(v):
        return True
    return len(v) <= 28 and v.count(' ') <= 3   # "Tataliken", "Sinusoidal Modificada"


def parsear(desc):
    """descripcion -> (pitch, ficha[], caracteristicas[])."""
    lineas = [l for l in (_limpiar(x) for x in str(desc or '').split('\n')) if l]
    pitch, ficha, cars = [], [], []
    en_bloque = False
    for l in lineas:
        if CABECERAS.match(l):
            en_bloque = True
            continue
        m = re.match(r'^([^:]{2,44}):\s*(.+)$', l)
        if not m:
            if not en_bloque:
                pitch.append(l)
            continue
        etq_ico, etiqueta = _partir_emoji(m.group(1))
        val_ico, valor = _partir_emoji(m.group(2))
        if not etiqueta or not valor:
            continue
        item = {'k': _sin_punto(etiqueta), 'v': _sin_punto(valor), 'origen': 'repo'}
        if etq_ico or val_ico:
            item['ico'] = etq_ico or val_ico
        if _es_dato_duro(valor):
            if not any(f['k'].lower() == etiqueta.lower() for f in ficha):
                ficha.append(item)
        else:
            cars.append({'t': etiqueta, 'd': valor, 'origen': 'repo'})
    return ' '.join(pitch).strip(), ficha, cars


def specs_normalizadas(p):
    """Pasa el campo specs actual al formato 'Etiqueta: Valor' cuando se puede."""
    out = []
    for s in (p.get('specs') or []):
        ico, txt = _partir_emoji(s)
        i = txt.find(':')
        if 0 < i < len(txt) - 1:
            out.append({'k': txt[:i].strip(), 'v': txt[i + 1:].strip(), 'origen': 'repo'})
        else:
            # formato viejo: solo el valor, sin etiqueta -> queda para completar
            out.append({'k': '', 'v': txt, 'origen': 'repo', 'sinEtiqueta': True})
    return out


def main():
    prods = json.load(open(os.path.join(ROOT, 'productos.json'), encoding='utf-8'))
    salida, stats = [], {'ficha': 0, 'cars': 0, 'specs_sin_etiqueta': 0, 'vacios': 0}
    for p in prods:
        pitch, ficha, cars = parsear(p.get('descripcion'))
        clave = specs_normalizadas(p)
        stats['ficha'] += bool(ficha)
        stats['cars'] += bool(cars)
        stats['specs_sin_etiqueta'] += sum(1 for c in clave if c.get('sinEtiqueta'))
        if not ficha and not cars:
            stats['vacios'] += 1
        salida.append({
            'id': p['id'],
            'nombre': _limpiar(p.get('nombre')),
            'categoria': p.get('categoria', ''),
            'subcategoria': p.get('subcategoria', ''),
            'precio': p.get('precioActual'),
            'imagen': p.get('imagen', ''),
            'pitch': pitch,
            'clave': clave,          # bloque 1  (specs)
            'ficha': ficha,          # bloque 2
            'caracteristicas': cars, # bloque 3
            'idealPara': [],         # bloque 4 - no existe en el catálogo
            'incluye': [],           # bloque 5 - no existe en el catálogo
        })

    dest = os.path.join(ROOT, 'scripts', 'ficha-datos.json')
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)

    # Copia como .js: el editor se abre con file:// y ahí fetch() está bloqueado
    # por CORS, pero un <script src> carga igual.
    with open(os.path.join(ROOT, 'scripts', 'ficha-datos.js'), 'w', encoding='utf-8') as f:
        f.write('window.FICHA_DATOS = ')
        json.dump(salida, f, ensure_ascii=False, indent=1)
        f.write(';\n')

    print(f"{len(salida)} productos -> scripts/ficha-datos.json")
    print(f"  con ficha extraída      : {stats['ficha']}")
    print(f"  con características     : {stats['cars']}")
    print(f"  specs sin etiqueta      : {stats['specs_sin_etiqueta']}")
    print(f"  sin nada que extraer    : {stats['vacios']}")


if __name__ == '__main__':
    main()
