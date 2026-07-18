"""
Tests de completitud para scripts/build_css.py y scripts/build_js_bundle.py.

Objetivo: que un CSS/JS fuente nuevo que se olvide de agregar al ORDEN
(como pasó con css/modal-v4.css — el bundle nunca lo incluía) se detecte
automáticamente en CI, en vez de descubrirse semanas después en producción.

Corre sin red: solo lista archivos en disco y compara contra las listas
ORDEN de cada script (no ejecuta main(), no escribe nada).
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_css  # noqa: E402
import build_js_bundle  # noqa: E402


class BuildCssCompletenessTest(unittest.TestCase):
    # css/fonts.css se carga aparte vía <link rel="preload"> — no es parte
    # del bundle a propósito. css/bundle.css es el archivo GENERADO por este
    # mismo script, tampoco debe estar en su propio ORDEN.
    EXCEPCIONES = {"fonts.css", "bundle.css"}

    def test_todos_los_css_fuente_estan_en_orden(self):
        css_dir = ROOT / "css"
        en_disco = {p.name for p in css_dir.glob("*.css")} - self.EXCEPCIONES
        en_orden = set(build_css.ORDEN)
        faltantes = en_disco - en_orden
        self.assertEqual(
            faltantes, set(),
            f"Estos CSS existen en css/ pero no están en ORDEN de build_css.py "
            f"(sus cambios nunca llegarán a bundle.css): {sorted(faltantes)}"
        )

    def test_orden_no_referencia_archivos_inexistentes(self):
        css_dir = ROOT / "css"
        en_orden = set(build_css.ORDEN)
        inexistentes = {n for n in en_orden if not (css_dir / n).exists()}
        self.assertEqual(
            inexistentes, set(),
            f"ORDEN de build_css.py referencia archivos que no existen: {sorted(inexistentes)}"
        )


class BuildJsBundleCompletenessTest(unittest.TestCase):
    def test_todos_los_js_modulo_estan_en_orden(self):
        src_dir = ROOT / "js" / "src"
        # Módulos = *.js en js/src/ que NO son el fuente legible (*.src.js)
        en_disco = {p.name for p in src_dir.glob("*.js") if not p.name.endswith(".src.js")}
        en_orden = set(build_js_bundle.ORDEN)
        faltantes = en_disco - en_orden
        self.assertEqual(
            faltantes, set(),
            f"Estos módulos existen en js/src/ pero no están en ORDEN de "
            f"build_js_bundle.py (nunca llegarán a tm-bundle.js): {sorted(faltantes)}"
        )

    def test_orden_no_referencia_archivos_inexistentes(self):
        src_dir = ROOT / "js" / "src"
        en_orden = set(build_js_bundle.ORDEN)
        inexistentes = {n for n in en_orden if not (src_dir / n).exists()}
        self.assertEqual(
            inexistentes, set(),
            f"ORDEN de build_js_bundle.py referencia módulos que no existen: {sorted(inexistentes)}"
        )


if __name__ == "__main__":
    unittest.main()
