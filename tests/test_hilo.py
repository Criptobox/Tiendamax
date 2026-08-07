"""
Corre tests/hilo_check.mjs dentro de unittest, que es lo que ejecuta CI.

Max no recordaba de qué se estaba hablando. Le enseñabas cuatro routers,
preguntabas "¿cuánto cuesta?" y contestaba "no te entendí"; "dame más info"
se buscaba como nombre de producto y salía una camioneta de $33 000. El
riesgo al arreglarlo es el contrario —que el hilo se coma preguntas con tema
propio, como "cuánto vale el envío pa Holguín"—, y eso es lo que más vigila
el check.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "hilo_check.mjs"


class HiloTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=180,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


if __name__ == "__main__":
    unittest.main()
