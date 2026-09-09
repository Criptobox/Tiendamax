"""
Corre la regresión de la imagen de anuncio (tests/anuncio_check.mjs) dentro de
unittest, que es lo que ejecuta CI (run-tests.yml).

Sustituye a test_cartel_titulos.py: el generador de carteles con cuatro
plantillas HTML se quitó y las tres imágenes que publica la tienda —Revólico,
Facebook y el Estado de WhatsApp— salen ahora de un solo lienzo en
js/revolico_integration.js. Las comprobaciones siguen viviendo en Node porque
dependen de measureText(), que no existe fuera del navegador.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "anuncio_check.mjs"


class AnuncioTest(unittest.TestCase):
    def test_reparto_titulo_y_foto_del_anuncio(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=300,
        )
        # El .mjs imprime cada fallo con el producto concreto; se propaga tal
        # cual para no tener que abrir el log de Node aparte.
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


if __name__ == "__main__":
    unittest.main()
