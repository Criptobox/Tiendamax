"""
Corre la regresión del cartel promo (tests/cartel_titulos_check.mjs) dentro
de unittest, que es lo que ejecuta CI (run-tests.yml).

La lógica del cartel vive en js/admin-copilot.js, así que las comprobaciones
están escritas en Node contra ese mismo archivo — reimplementarlas en Python
las dejaría desincronizadas del código real a la primera modificación.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "cartel_titulos_check.mjs"


class CartelTitulosTest(unittest.TestCase):
    def test_titulos_y_features_del_cartel(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        # El .mjs imprime cada fallo con el producto concreto; se propaga tal
        # cual para no tener que abrir el log de Node aparte.
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


if __name__ == "__main__":
    unittest.main()
