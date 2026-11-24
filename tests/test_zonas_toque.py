"""Zonas de toque de 44 px en los botones pequeños de la portada (zonas_toque_check.mjs)."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI = (ROOT / "js/src/tm-ui.src.js").read_text(encoding="utf-8")


class ZonasToqueTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible")
        r = subprocess.run([node, str(ROOT / "tests" / "zonas_toque_check.mjs")], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_la_foto_de_la_tarjeta_declara_su_tamano(self):
        """width/height en la foto: el navegador reserva el sitio aunque el CSS o la foto tarden."""
        self.assertIn('width="480" height="480" loading="', UI)


if __name__ == "__main__":
    unittest.main()
