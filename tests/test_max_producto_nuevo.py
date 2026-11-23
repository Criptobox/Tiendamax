"""Un producto nuevo se reconoce solo, sin sinónimos escritos a mano.

El dueño añadió un panel solar y Max decía «no lo manejo» hasta que alguien lo
apuntó en max-sinonimos.json. tests/max_producto_nuevo_check.mjs prueba con
productos inventados y sin archivo de sinónimos; aquí se fija la estructura.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_producto_nuevo_check.mjs"
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")


class ProductoNuevoTest(unittest.TestCase):
    def test_con_productos_inventados(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True,
                           text=True, timeout=180)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_el_reconocimiento_no_depende_del_archivo(self):
        # _sinInfo combina el archivo (si cargó) con lo automático; la mención de
        # producto no puede quedar detrás de «si hay archivo».
        i = CEREBRO.index("function _sinInfo(")
        self.assertIn("_autoInfo(p, q)", CEREBRO[i:i + 400])
        j = CEREBRO.index("Cómo LLAMA la gente al producto")
        self.assertNotIn("if(_SIN.prod.size){", CEREBRO[j:j + 500])

    def test_solo_con_dos_o_mas_palabras_y_en_el_arranque_del_nombre(self):
        i = CEREBRO.index("function _autoInfo(")
        cuerpo = CEREBRO[i:i + 700]
        self.assertIn("qw.length < 2", cuerpo)
        self.assertIn("slice(0, 5)", CEREBRO[CEREBRO.index("function _lead("):CEREBRO.index("function _lead(") + 500])


if __name__ == "__main__":
    unittest.main()
