"""
La reseña desde el seguimiento post-venta: resena.html y los botones de
Clientes (⭐ Pedir reseña, ✍️ Publicar su reseña).

El comportamiento se comprueba en el navegador (tests/resena_check.mjs).
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PAGINA = (RAIZ / "resena.html").read_text(encoding="utf-8")


class ResenaTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "resena_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=240)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_la_pagina_es_ligera(self):
        # Es la página que se promete «de un minuto» en 3G: ni bundle, ni catálogo, ni Google.
        self.assertNotIn("tm-bundle", PAGINA)
        self.assertNotIn("productos-lite.json", PAGINA)
        self.assertNotIn("googleapis", PAGINA)
        # 24 KB: las frases completas (en vez de etiquetas) añadieron ~2 KB de texto.
        self.assertLess(len(PAGINA.encode("utf-8")), 24000)

    def test_no_se_indexa(self):
        self.assertIn('name="robots" content="noindex"', PAGINA)

    def test_la_hora_la_pone_el_servidor(self):
        # La regla rechaza ts fuera de ±5 min: con la hora del móvil, un reloj mal
        # puesto perdía la reseña sin que el cliente supiera por qué.
        self.assertIn("'.sv': 'timestamp'", PAGINA)


if __name__ == "__main__":
    unittest.main()
