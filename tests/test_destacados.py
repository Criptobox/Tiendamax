"""
Corre tests/destacados_check.mjs dentro de unittest, que es lo que ejecuta CI.

El fallo que motiva esto llegó a producción y solo se veía el segundo y pico
que tarda el catálogo en llegar: renderizarMasVendidos() se llama varias veces
durante el arranque y, al llegar sin datos, borraba el esqueleto y encendía
"Pronto publicaremos nuestros destacados" — que era falso. La sección se
quedaba en 24px de alto, los tres textos pegados, y Categorías justo debajo
parecía empezar cortándola.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "destacados_check.mjs"


class DestacadosTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


if __name__ == "__main__":
    unittest.main()
