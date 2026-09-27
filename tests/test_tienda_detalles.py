"""Buscador, conteo de categoría, título de la pestaña y pie de la tienda.

El comportamiento lo comprueba tests/tienda_detalles_check.mjs en un
navegador de verdad, que se corre desde aquí. Lo de este fichero son los
contratos que se leen en el código.
"""
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "tienda_detalles_check.mjs"


class EnNavegadorTest(unittest.TestCase):
    def test_tienda(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_la_pestana_vuelve_a_lo_que_decia_la_pagina(self):
        """El título de vuelta se lee de la página, no de una copia a mano:
        la copia decía «Tu tienda online en Cuba» y el <title> real otra cosa."""
        src = (ROOT / "js" / "seo-dynamico.js").read_text(encoding="utf-8")
        self.assertNotIn("document.title = 'TiendaMax", src)
        self.assertIn("document.title = _tmSEOAntes.title", src)

    def test_preguntas_frecuentes_no_es_una_categoria(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        import regenerate_artifacts as ra
        import inspect
        self.assertNotIn("faq", inspect.getsource(ra.regenerate_home_nav))
        idx = (ROOT / "index.html").read_text(encoding="utf-8")
        cats = idx[idx.index("<!-- tm:cats-inicio -->"):idx.index("<!-- tm:cats-fin -->")]
        self.assertNotIn("faq", cats)
        self.assertIn('<nav aria-label="Ayuda"', idx)


if __name__ == "__main__":
    unittest.main()
