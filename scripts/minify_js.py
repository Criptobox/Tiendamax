#!/usr/bin/env python3
"""
Minifica cada js/src/*.src.js → js/src/*.js usando esbuild (vía npx).

Los módulos tm-*.src.js son scripts clásicos (no ES modules): sus funciones
top-level son globales y se llaman desde atributos HTML (onclick, data-action)
y entre archivos. esbuild NO renombra identificadores top-level en scripts
clásicos, así que no hace falta lista de reservados.

IMPORTANTE: se elimina el "use strict" que esbuild inyecta al inicio, porque
el código original usa semántica no estricta (asignaciones a globals bareword
como `productos = ...`); en modo estricto eso lanzaría ReferenceError.

Uso:
  python scripts/minify_js.py            # todos los módulos
  python scripts/minify_js.py tm-ui      # solo uno
"""

import subprocess
import sys
from pathlib import Path

SRC_DIR = Path('js/src')
ESBUILD_VERSION = '0.21.5'   # fija la versión: mismo output en CI y local


def fmt(n: int) -> str:
    return f'{n:,} bytes ({n / 1024:.1f} KB)'


def minify(src: Path, dest: Path) -> tuple[int, int]:
    tmp = dest.with_suffix('.js.tmp')
    result = subprocess.run(
        ['npx', '--yes', f'esbuild@{ESBUILD_VERSION}', str(src),
         '--minify', '--target=es2017', f'--outfile={tmp}'],
        capture_output=True, text=True, timeout=180,
    )
    if result.returncode != 0:
        print(f'\n  ERROR al minificar {src}:')
        print(result.stderr or result.stdout)
        tmp.unlink(missing_ok=True)
        sys.exit(1)

    code = tmp.read_text(encoding='utf-8')
    tmp.unlink()
    # Quitar el "use strict" inyectado (preservar semántica no estricta)
    if code.startswith('"use strict";'):
        code = code[len('"use strict";'):]
    dest.write_text(code, encoding='utf-8')
    return src.stat().st_size, dest.stat().st_size


def main() -> None:
    solo = sys.argv[1] if len(sys.argv) > 1 else None
    fuentes = sorted(SRC_DIR.glob('*.src.js'))
    if solo:
        fuentes = [f for f in fuentes if f.name == f'{solo}.src.js']
    if not fuentes:
        print(f'  ERROR: no hay fuentes {"para " + solo if solo else ""} en {SRC_DIR}/')
        sys.exit(1)

    print(f'Minificando {len(fuentes)} módulo(s) JS…\n')
    total_orig = total_min = 0
    for src in fuentes:
        dest = SRC_DIR / src.name.replace('.src.js', '.js')
        original, minified = minify(src, dest)
        total_orig += original
        total_min += minified
        print(f'[OK] {src.name} → {dest.name}: {fmt(original)} → {fmt(minified)}')

    ahorro = total_orig - total_min
    pct = (ahorro / total_orig * 100) if total_orig else 0
    print('=' * 60)
    print(f'Total: {fmt(total_orig)} → {fmt(total_min)}  (ahorro {pct:.1f}%)')


if __name__ == '__main__':
    main()
