"""
Corre tests/publicar_check.mjs dentro de unittest, que es lo que ejecuta CI.

El fallo que motiva esto estuvo meses en producción sin dar la cara: había dos
historiales de publicación que no se hablaban. El tab Compartir escribía en
'tmPubHist'; el Historial, el aviso de "21 días sin publicar" y la columna
"hace X d" leían 'tm_publog_v1', donde Compartir no escribía nunca. El
Historial se quedaba vacío para siempre y el aviso decía "119 productos llevan
21 días o más" publicaras lo que publicaras. Nada fallaba: los dos lados
funcionaban perfectamente por separado.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "publicar_check.mjs"


class PublicarTabTest(unittest.TestCase):
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
