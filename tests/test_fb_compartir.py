"""«Copiar y elegir el grupo en Facebook»: abre Compartir con la imagen y deja
el texto copiado, en vez de abrir la portada de Facebook. Ver
tests/fb_compartir_check.mjs."""
import os
import shutil
import subprocess
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class FbCompartirTest(unittest.TestCase):
    def test_en_navegador(self):
        if not shutil.which("node"):
            self.skipTest("sin node")
        r = subprocess.run(["node", os.path.join(RAIZ, "tests", "fb_compartir_check.mjs")],
                           capture_output=True, text=True, timeout=400)
        self.assertEqual(0, r.returncode, r.stdout[-3000:] + r.stderr[-3000:])


if __name__ == "__main__":
    unittest.main()
