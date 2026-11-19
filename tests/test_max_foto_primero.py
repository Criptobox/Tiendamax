"""Ficha de un producto en Max: la foto primero, los datos debajo.

La ficha larga salía antes y la tarjeta con la foto quedaba al final, y el chat se
desplazaba al final del texto, fuera de vista. tests/max_foto_primero_check.mjs lo
comprueba en un navegador (orden, que se vea sin desplazarse, que las listas
sigan con el texto primero y que el siguiente mensaje suelte el anclaje); aquí se
fija además la estructura que lo sostiene.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_foto_primero_check.mjs"
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")
SHELL = (ROOT / "js" / "src" / "tm-bot.src.js").read_text(encoding="utf-8")


class FotoPrimeroTest(unittest.TestCase):
    def test_en_un_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True,
                           text=True, timeout=240)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_la_ficha_de_un_producto_pide_la_foto_primero(self):
        i = CEREBRO.index("function buildDetalle(")
        cuerpo = CEREBRO[i:i + 9000]
        self.assertGreaterEqual(cuerpo.count("productosPrimero: true"), 1)
        # La del digital también.
        j = CEREBRO.index("function buildDetalleDigital(")
        self.assertIn("productosPrimero: true", CEREBRO[j:j + 2500])

    def test_todos_los_sitios_que_enseñan_un_detalle_usan_el_mismo_ayudante(self):
        # Cada copia de «texto y luego tarjetas» deshacía el orden en su camino.
        import re
        sueltos = re.findall(r"if\((\w+)\.response\) addMessageTyped\(\1\.response, 'bot'\);\s*if\(\1\.products\) addProducts\(\1\.products\);", CEREBRO)
        self.assertEqual(sueltos, [], "queda un sitio que pinta texto y luego tarjetas sin pasar por _mostrarRespuestaProductos")
        self.assertIn("function _mostrarRespuestaProductos(", CEREBRO)

    def test_la_tarjeta_grande_ancla_el_desplazamiento_y_se_suelta(self):
        self.assertIn("if(grande) _ancla = wrap;", CEREBRO)
        i = CEREBRO.index("async function sendMessage(")
        self.assertIn("_ancla = null;", CEREBRO[i:i + 600])

    def test_la_tarjeta_grande_tiene_su_estilo(self):
        self.assertIn(".tm-bot-product.grande", SHELL)


if __name__ == "__main__":
    unittest.main()
