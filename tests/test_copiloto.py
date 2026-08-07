"""
Corre tests/copiloto_check.mjs dentro de unittest, que es lo que ejecuta CI.

Dos fallos que no rompían nada y por eso duraron: getJson() devolvía null en
los cuatro modos de fallo (sin config, 401, timeout, red) y arriba eso se
contaba como "no hay datos", así que el panel enseñaba 0 vistas igual que si
de verdad no hubiera ninguna; y los KPI del Asesor llevaban el número de
columnas en un style inline, que gana a la media query, así que en un móvil
el importe del inventario se salía de su tarjeta.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "copiloto_check.mjs"


class CopilotoTest(unittest.TestCase):
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
