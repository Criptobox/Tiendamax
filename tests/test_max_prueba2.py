"""Segunda prueba del dueño a Max (nov-2026).

tests/max_prueba2_check.mjs corre el cerebro con el catálogo de hoy; aquí se
fija la estructura que lo sostiene (la tasa sale de TASA_MN, el tipo sin stock
solo existe para lo apagado, «tienda» sola no es un producto).
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_prueba2_check.mjs"
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")


class Prueba2Test(unittest.TestCase):
    def test_con_el_catalogo_de_hoy(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True,
                           text=True, timeout=240)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_toda_conversion_a_mn_usa_la_tasa_del_sitio(self):
        self.assertEqual(CEREBRO.count("* TASA_MN"), 1, "una sola conversión USD→MN (fmtMN)")
        self.assertNotIn("* TASA_BASE_MN", CEREBRO, "la base sola nunca convierte")

    def test_la_composicion_sale_de_base_y_margen(self):
        i = CEREBRO.index("function _composicionTasa(")
        cuerpo = CEREBRO[i:i + 600]
        self.assertIn("TASA_BASE_MN", cuerpo)
        self.assertIn("MARGEN_MN", cuerpo)

    def test_el_tipo_sin_stock_solo_mira_lo_oculto(self):
        i = CEREBRO.index("function _tipoOcultoPedido(")
        cuerpo = CEREBRO[i:i + 1200]
        self.assertIn("_productosOcultos()", cuerpo)
        self.assertIn("visibles.has(base)", cuerpo, "si la subcategoría está visible (aunque agotada) no se toca")
        j = CEREBRO.index("R.tipoSinStock = ")
        self.assertNotIn("products:", CEREBRO[j:j + 700], "lo apagado no enseña tarjetas ni «Avísame»")

    def test_ubicacion_reconoce_la_tienda_sin_buscarla_como_producto(self):
        self.assertIn("(la |su |vuestra )?(tienda|local|negocio)", CEREBRO)


if __name__ == "__main__":
    unittest.main()
