"""«✅ Entregado → registrar venta» del vale.

El recorrido de punta a punta (vale → panel → venta) lo comprueba
tests/vale_venta_check.mjs en un navegador de verdad, que se corre desde
aquí. Lo de este fichero son los contratos que se leen en el código.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "vale_venta_check.mjs"
VALE = (ROOT / "vale.html").read_text(encoding="utf-8")
ADMIN = (ROOT / "admin.html").read_text(encoding="utf-8")


class EnNavegadorTest(unittest.TestCase):
    def test_de_punta_a_punta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_el_vale_no_registra_ventas_por_su_cuenta(self):
        """Un segundo camino de venta acabaría contando distinto: la comisión,
        el cliente, el seguimiento y el «no descontar dos veces» viven en
        reservaVender → registrarVentaPedido, en el panel."""
        self.assertNotIn("registrarVentaPedido(", VALE)
        self.assertNotIn("registroVentas", VALE)
        self.assertIn("location.href='admin.html#reservas'", VALE)

    def test_el_panel_usa_el_apunte_y_lo_borra(self):
        self.assertIn("tm_vale_vender", VALE)
        cuerpo = ADMIN[ADMIN.index("function reservaVender(id){"):ADMIN.index("function reservaCancelar(id){")]
        self.assertIn("stockYaDescontado:true", cuerpo)
        self.assertIn("localStorage.removeItem('tm_vale_vender')", cuerpo)


if __name__ == "__main__":
    unittest.main()
