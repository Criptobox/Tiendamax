"""Max armando sistemas solares: tests/max_solar_check.mjs, con el catálogo
real y con una variante sin estaciones de energía (armado por piezas)."""
import os
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_solar_check.mjs"


class MaxSolarTest(unittest.TestCase):
    def _correr(self, sin_estacion):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        env = dict(os.environ, TM_SIN_ESTACION="1" if sin_estacion else "0")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), env=env,
                           capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_con_el_catalogo_real(self):
        self._correr(False)

    def test_sin_estaciones(self):
        self._correr(True)


if __name__ == "__main__":
    unittest.main()
