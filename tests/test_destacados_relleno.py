"""«Productos Destacados» con pocos marcados se completa: tests/destacados_relleno_check.mjs."""
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


class DestacadosRellenoTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "destacados_relleno_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=200)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
