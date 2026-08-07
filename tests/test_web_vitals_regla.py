"""
Corre tests/web_vitals_regla_check.mjs dentro de unittest, que es lo que
ejecuta CI.

Cruza el payload EXACTO que arma js/web-vitals-snippet.js con las reglas
EXACTAS de firebase-rules.json, evaluándolas. El guard general
(test_llamadas_vs_reglas) no ve esta ruta porque el cliente arma la URL en una
variable, y el agente de salud solo puede avisar de "0 muestras" sin poder
decir por qué. Esto impide que cliente y reglas se separen sin que nadie lo
note, que es como se llega a una métrica muerta durante meses.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "web_vitals_regla_check.mjs"


class WebVitalsReglaTest(unittest.TestCase):
    def test_el_payload_del_navegador_pasa_las_reglas(self):
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
