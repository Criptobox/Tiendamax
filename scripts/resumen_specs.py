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
              'categoría', 'categoria',
              # No son especificaciones del producto: valen igual para todo el
              # catálogo y ocupan el sitio de un dato que sí distingue.
              'estado', 'condición', 'condicion', 'garantía', 'garantia',
              'procedencia', 'origen'}
CON_DATO = re.compile(r'\d')


def etiquetada(s):
    _, t = _ex._partir_emoji(s)
    i = t.find(':')
    return 0 < i < len(t) - 1


# Un chip es un dato de un vistazo, no una frase. Estos son los cortes que
# hacen que "Potencia de Salida AC: 1800W continuos (Modo Power Lifting hasta
# 2700W para cargas resistivas) — Onda Senoidal Pura" quepa como "1800W
# continuos" sin dejar de ser cierto.
LARGO_VALOR = 34        # lo que entra de un vistazo en un teléfono
LARGO_CHIP  = 52        # etiqueta + valor
# Un chip suelto bajo el precio se ve pobre, así que si con el límite corto
# salen menos de dos se admite alguno más largo antes que dejar el hueco.
# Medido sobre el catálogo: con 34/52 quedan 44 productos con un solo chip;
# con este segundo intento bajan a 12 y ninguno se queda sin ninguno.
LARGO_VALOR_2 = 44
LARGO_CHIP_2  = 62
MINIMO_CHIPS  = 2
# Se corta en la primera aclaración: paréntesis, coma, raya o barra doble.
CORTE = re.compile(r'\s*[(（,;—–]|\s+/\s+\S+\s+/')


def primer_dato(v):
    """La primera parte del valor, si por sí sola sigue diciendo un dato."""
    v = str(v or '').strip()
    if len(v) <= LARGO_VALOR:
        return v
    corto = CORTE.split(v)[0].strip().rstrip('.,;')
    # Sin número, el recorte es un adjetivo suelto: no sirve como chip.
    if corto and len(corto) <= LARGO_VALOR and CON_DATO.search(corto):
        return corto
    return ''


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
        # Se respeta lo que ya está: un chip escrito "Etiqueta: Valor" está
        # curado a mano, y uno que ya trae números es un dato de verdad
        # —"⚡ Gigabit (1000 Mbps)", "🔌 8 Puertos RJ45"— aunque no lleve
        # etiqueta. Rearmar esos era cambiar un dato bueno por otro peor.
        # Solo se toca el que NINGÚN chip tiene una cifra, que es la firma del
        # eslogan: "Alta Potencia", "Tecnología Duradera y Resistente".
        if any(etiquetada(s) for s in specs) or any(CON_DATO.search(str(s)) for s in specs):
            curados += 1
            continue
        def recoger(largo_valor, largo_chip):
            global LARGO_VALOR
            previo, LARGO_VALOR = LARGO_VALOR, largo_valor
            try:
                out = []
                for f in ficha:
                    emoji, etq = partes(f)
                    if etq.lower() in NO_RESUMEN:
                        continue
                    valor = primer_dato(f.get('v'))
                    if not valor:
                        continue
                    chip = f'{etq}: {valor}'
                    if len(chip) > largo_chip:
                        continue
                    out.append((emoji, chip, bool(CON_DATO.search(valor))))
                return out
            finally:
                LARGO_VALOR = previo

        candidatas = recoger(LARGO_VALOR, LARGO_CHIP)
        if len(candidatas) < MINIMO_CHIPS:
            vistos = {c for _, c, _ in candidatas}
            candidatas += [x for x in recoger(LARGO_VALOR_2, LARGO_CHIP_2)
                           if x[1] not in vistos]
        # Primero los que traen un número: son los que el cliente compara.
        candidatas.sort(key=lambda c: 0 if c[2] else 1)
        nuevas = [f'{e} {c}' if e else c for e, c, _ in candidatas[:4]]
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
