"""Los textos de venta: el problema que resuelve, no la ficha.

Lo comprueba tests/textos_venta_check.mjs en un navegador (cada gancho, cada
versión, «Por categoría» y el editor de la cola). Aquí, lo que se puede leer sin
navegador: que el gancho sobreviva a «Actualizar tienda» y que la urgencia
inventada no vuelva.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "textos_venta_check.mjs"


class TextosVentaEnNavegadorTest(unittest.TestCase):
    def test_textos_ganchos_y_categoria(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True, text=True, timeout=400)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class GanchoSobreviveTest(unittest.TestCase):
    def test_aplicar_cambios_conserva_el_gancho(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        import aplicar_cambios
        self.assertIn("gancho", aplicar_cambios.CONSERVAR)

    def test_el_panel_guarda_el_gancho_por_el_camino_de_siempre(self):
        admin = (ROOT / "admin.html").read_text(encoding="utf-8")
        self.assertIn("window.tmGuardarCampoProducto=function(id,campo,valor)", admin)
        cuerpo = admin[admin.index("window.tmGuardarCampoProducto"):][:400]
        self.assertIn("marcarProductoModificado", cuerpo)
        self.assertIn("apSaveProds()", cuerpo)


class SinUrgenciaInventadaTest(unittest.TestCase):
    def test_ni_mañana_suben_con_la_tasa_ni_quedan_pocos(self):
        admin = (ROOT / "admin.html").read_text(encoding="utf-8")
        texto = admin[admin.index("function pubCatText("):admin.index("function pubCatWrapName(")]
        self.assertNotIn("mañana suben con la tasa", texto)
        self.assertNotIn("'🔥 QUEDAN POCOS'", admin)


if __name__ == "__main__":
    unittest.main()
