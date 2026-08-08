"""
Corre tests/reservas_check.mjs dentro de unittest, que es lo que ejecuta CI.

Una reserva es lo que hay entre mandar el vale y cobrar la venta: el cliente
pasa otro día, la unidad ya está comprometida, pero la venta todavía no
existe. Todo lo que puede salir mal aquí sale mal en silencio y con dinero de
por medio — el catálogo enseña un número, nadie ve un error, y te enteras
cuando el segundo cliente viene a buscar algo que ya no está.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "reservas_check.mjs"


class ReservasTest(unittest.TestCase):
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
