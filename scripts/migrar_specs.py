#!/usr/bin/env python3
"""
Pasa el campo `specs` al formato "Etiqueta: Valor", que es el único que el
modal dibuja como tabla (js/src/tm-product.src.js parte por el primer ':').

NO inventa datos: solo reetiqueta y reordena lo que ya está escrito. Lo que no
puede resolver con certeza lo deja intacto y lo lista para revisión manual.

    python3 scripts/migrar_specs.py --categoria ENERGIA            # dry-run
    python3 scripts/migrar_specs.py --categoria ENERGIA --aplicar

Idempotente: una spec que ya tiene "Etiqueta: Valor" solo pierde el emoji.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = os.path.join(ROOT, 'productos.json')
LITE = os.path.join(ROOT, 'productos-lite.json')

EMOJI = re.compile(r'[\U0001F000-\U0001FAFF←-⇿⌀-➿️‍​⬀-⯿]')

# Unidad -> etiqueta. El orden importa: 'Ah' y 'VA' antes que 'A'/'V'.
UNIDADES = [
    ('kWh', 'Capacidad'), ('Wh', 'Capacidad'), ('mAh', 'Capacidad'), ('Ah', 'Capacidad'),
    ('kW', 'Potencia'), ('VA', 'Potencia'), ('W', 'Potencia'),
    ('V', 'Voltaje'), ('A', 'Corriente'),
]
NUM = r'\d+(?:[.,]\d+)?'
_U = "|".join(u for u, _ in UNIDADES)
# Un "valor suelto" es exactamente número+unidad y nada más: 12.8V, 100Ah, 3.6kW.
SOLO_VALOR = re.compile(rf'^({NUM})\s*({_U})$', re.I)
# "4000W de Potencia" -> la etiqueta viene detrás del dato. Solo se acepta si esa
# etiqueta es una de las conocidas: "80A MPPT" NO es "Mppt: 80A" (MPPT es la
# tecnología, no el nombre del dato) y "100A MPPT Alta Potencia" tampoco.
ETIQUETAS_OK = {'potencia': 'Potencia', 'capacidad': 'Capacidad', 'voltaje': 'Voltaje',
                'corriente': 'Corriente', 'carga': 'Carga', 'autonomia': 'Autonomía',
                'autonomía': 'Autonomía'}
VALOR_ETIQ = re.compile(rf'^({NUM}\s*(?:{_U}))\s+(?:de\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ]+)$', re.I)


def limpiar(s):
    """Saca emojis y espacios raros, sin tocar el texto."""
    return re.sub(r'\s+', ' ', EMOJI.sub('', str(s or ''))).strip()


def partir_emoji(s):
    """('⚡ 4000W de Potencia') -> ('⚡', '4000W de Potencia').

    El emoji NO se tira: tm-product.src.js lo pasa por tmPartirEmoji/tmIconoSVG
    y lo dibuja como ícono de línea al lado de la etiqueta. El formato que espera
    ese código es exactamente "⚡ Potencia: 4000W" (así está en su comentario),
    así que hay que devolverlo al frente de la etiqueta, no borrarlo."""
    t = re.sub(r'\s+', ' ', str(s or '')).strip()
    m = re.match(r'^((?:' + EMOJI.pattern + r')+)\s*', t)
    return (m.group(1).strip(), t[m.end():].strip()) if m else ('', t)


def con_emoji(emoji, texto):
    return f'{emoji} {texto}' if emoji else texto


def normalizar_unidad(num, uni):
    """12.8v -> 12.8V ; 1,800W -> 1800W (coma de miles, no decimal)."""
    for u, _ in UNIDADES:
        if u.lower() == uni.lower():
            uni = u
            break
    if ',' in num and re.match(r'^\d{1,3},\d{3}$', num):
        num = num.replace(',', '')          # 1,800 -> 1800
    return f'{num}{uni}', uni


def etiqueta_de(uni):
    for u, et in UNIDADES:
        if u.lower() == uni.lower():
            return et
    return None


def partir_sueltos(txt):
    """'12V / 3000W' -> ['12V', '3000W']; None si no son todos valores."""
    partes = [p.strip() for p in re.split(r'\s*[/|]\s*', txt) if p.strip()]
    if len(partes) < 2:
        return None
    return partes if all(SOLO_VALOR.match(p) for p in partes) else None


def migrar(specs):
    """specs -> (nuevas, dudosas). No descarta nada: lo dudoso vuelve tal cual."""
    sueltos, hechas, dudosas = [], [], []
    for original in specs:
        emoji, t = partir_emoji(original)
        t = limpiar(t)
        if not t:
            continue
        i = t.find(':')
        if 0 < i < len(t) - 1:              # ya etiquetada: se normalizan espacios
            hechas.append(con_emoji(emoji, t))
            continue
        partes = partir_sueltos(t)
        if partes:
            sueltos.extend((p, emoji) for p in partes)
            continue
        if SOLO_VALOR.match(t):
            sueltos.append((t, emoji))
            continue
        m = VALOR_ETIQ.match(t)
        if m and m.group(2).lower() in ETIQUETAS_OK:
            num, uni = SOLO_VALOR.match(m.group(1).replace(' ', '')).groups()
            val, _ = normalizar_unidad(num, uni)
            hechas.append(con_emoji(emoji, f'{ETIQUETAS_OK[m.group(2).lower()]}: {val}'))
            continue
        dudosas.append(original)

    # Agrupar los valores sueltos por el dato que nombran.
    grupos = {}
    for txt, emoji in sueltos:
        num, uni = SOLO_VALOR.match(txt).groups()
        val, uni = normalizar_unidad(num, uni)
        grupos.setdefault(etiqueta_de(uni), []).append((val, emoji))

    nuevas = []
    for etq, pares in grupos.items():
        vals = list(dict.fromkeys(v for v, _ in pares))
        # El ícono solo sobrevive si todos los que se fusionan traían el mismo:
        # con emojis distintos, elegir uno sería inventar cuál manda.
        emojis = {e for _, e in pares if e}
        emoji = emojis.pop() if len(emojis) == 1 else ''  
        # Varios valores del mismo dato se juntan en una fila SOLO si son TODO el
        # contenido del producto — ahí son la lista de lo soportado (12V/24V/36V/
        # 48V de un controlador). Si el producto tiene además cualquier otro dato,
        # dos voltajes son roles distintos (24V de entrada vs 110V de salida) y
        # unirlos inventaría un significado: se dejan intactos para revisar.
        # Mirar solo `grupos` no alcanza: en una segunda pasada los ya etiquetados
        # salen por `hechas` y los sueltos quedarían solos, fusionándose de más.
        solo_esto = len(grupos) == 1 and not hechas and not dudosas
        if len(vals) > 1 and not solo_esto:
            dudosas.extend(f'{e} {v}'.strip() for v, e in pares)
            continue
        nuevas.append(con_emoji(emoji, f'{etq}: {" / ".join(vals)}'))
    nuevas.extend(hechas)
    nuevas.extend(dudosas)
    return nuevas, dudosas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--categoria', required=True)
    ap.add_argument('--aplicar', action='store_true')
    a = ap.parse_args()

    full = json.load(open(FULL, encoding='utf-8'))
    objetivo = [p for p in full if p.get('categoria') == a.categoria]
    if not objetivo:
        sys.exit(f'No hay productos en {a.categoria}')

    cambios, sin_tocar, revisar = [], 0, []
    for p in objetivo:
        viejas = p.get('specs') or []
        if not viejas:
            continue
        nuevas, dudosas = migrar(viejas)
        if dudosas:
            revisar.append((p['nombre'], dudosas))
        if nuevas != viejas:
            cambios.append((p, viejas, nuevas))
        else:
            sin_tocar += 1

    print(f'\n{"APLICANDO" if a.aplicar else "DRY-RUN — no se escribe nada"} · '
          f'{a.categoria} · {len(objetivo)} productos\n' + '=' * 66)
    for p, v, n in cambios:
        print(f'\n{p["nombre"][:58]}')
        for s in v:
            print(f'   -  {s}')
        for s in n:
            marca = '?' if s in (p.get('specs') or []) else '+'
            print(f'   {marca}  {s}')

    print('\n' + '=' * 66)
    print(f'  cambian        : {len(cambios)}')
    print(f'  quedan igual   : {sin_tocar}')
    print(f'  sin specs      : {sum(1 for p in objetivo if not p.get("specs"))}')
    if revisar:
        print(f'\n  ⚠️  {sum(len(d) for _, d in revisar)} specs que NO pude resolver '
              f'(quedan intactas, marcadas "?" arriba):')
        for nombre, ds in revisar:
            for d in ds:
                print(f'      · {limpiar(d)[:56]:56} — {nombre[:34]}')

    if not a.aplicar:
        print('\n  Para aplicar:  python3 scripts/migrar_specs.py '
              f'--categoria {a.categoria} --aplicar')
        return

    por_id = {p['id']: n for p, _, n in cambios}
    for p in full:
        if p['id'] in por_id:
            p['specs'] = por_id[p['id']]
    # lite = full sin 'descripcion' (contrato del repo); se reescribe el mismo
    # campo para no regenerarlo entero y arriesgar ese contrato.
    lite = json.load(open(LITE, encoding='utf-8'))
    for p in lite:
        if p['id'] in por_id:
            p['specs'] = por_id[p['id']]
    for path, datos in ((FULL, full), (LITE, lite)):
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
            f.write('\n')
        os.replace(tmp, path)
    print(f'\n  ✅ escritos productos.json y productos-lite.json ({len(por_id)} productos)')


if __name__ == '__main__':
    main()
