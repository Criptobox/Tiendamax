"""
Corre tests/preguntas_check.mjs dentro de unittest, que es lo que ejecuta CI.

La recogida de preguntas existía y no había producido ni una. Tres cosas lo
impedían y ninguna daba error: la regla de /agente/faq tumbaba el update
entero la segunda vez que alguien preguntaba lo mismo (contador clavado en 1,
y build_faq.py pide 3), /agente era .read:false así que el panel siempre
recibía null, y lo que escribe el cliente se guardaba tal cual aunque acabe en
faq.html, que es pública e indexada.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "preguntas_check.mjs"


class PreguntasTest(unittest.TestCase):
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
