"""Borrar una reseña desde el panel: tests/resena_borrar_check.mjs corre en un navegador real
(botón, confirmación, DELETE firmado, caché) y lee la regla de Firebase."""
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


class ResenaBorrarTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "resena_borrar_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


if __name__ == "__main__":
    unittest.main()
