"""Un producto que la tienda tiene apagado: «no está disponible ahora», no «no te entendí».

Con una categoría apagada en el panel, la tienda quita sus productos de la memoria
pero guarda el catálogo ENTERO en localStorage. Max lo usa solo para reconocer
el nombre de lo que no se puede vender y decirlo; nunca para enseñarlo.
tests/max_no_disponible_check.mjs lo prueba con el catálogo de hoy; aquí se fija la
estructura que lo sostiene.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_no_disponible_check.mjs"
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")


class NoDisponibleTest(unittest.TestCase):
    def test_con_el_catalogo_de_hoy(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True,
                           text=True, timeout=180)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_solo_cuenta_si_lo_visible_no_reconoce_el_mensaje(self):
        i = CEREBRO.index("function _mencionOculto(")
        cuerpo = CEREBRO[i:i + 900]
        # Primero lo que está a la venta; lo oculto solo después.
        self.assertLess(cuerpo.index("detectProductMentions(text).length"), cuerpo.index("PRODUCTOS = ocultos"))

    def test_nunca_se_enseña_lo_oculto(self):
        i = CEREBRO.index("R.noDisponible = ")
        cuerpo = CEREBRO[i:i + 900]
        self.assertNotIn("products:", cuerpo, "lo apagado se nombra, no se enseña ni se ofrece su «Avísame»")

    def test_la_regla_va_justo_despues_de_la_charla_en_detectintent(self):
        j = CEREBRO.index("function detectIntent(")
        cuerpo = CEREBRO[j:j + 6000]
        self.assertLess(cuerpo.index("_charlaIntent(m)"), cuerpo.index("_mencionOculto(text)"))

    def test_el_titulo_repetido_se_quita_de_la_ficha_con_tarjeta(self):
        self.assertIn("function _sinTituloRepetido(", CEREBRO)
        self.assertGreaterEqual(CEREBRO.count("_sinTituloRepetido(body)"), 2)


if __name__ == "__main__":
    unittest.main()
