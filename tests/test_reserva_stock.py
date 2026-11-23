"""Reserva → stock → venta: cada unidad sale del stock exactamente una vez.

El recorrido completo (cuatro caminos de crear, confirmar, publicar, panel
abierto aparte y reserva hecha en otro dispositivo) lo comprueba
tests/reserva_stock_check.mjs en un navegador de verdad. Aquí van los
contratos que se leen en el código.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "reserva_stock_check.mjs"
ADMIN = (ROOT / "admin.html").read_text(encoding="utf-8")
RESERVAS = (ROOT / "js" / "reservas.js").read_text(encoding="utf-8")


class EnNavegadorTest(unittest.TestCase):
    def test_de_punta_a_punta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=600)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_la_reserva_apunta_quien_la_descontó(self):
        """Sin `disp`, una reserva de otro dispositivo parecía descontada aquí."""
        self.assertIn("disp: dispositivo()", RESERVAS)
        self.assertIn("function descontadaAqui(", RESERVAS)
        self.assertIn("descontadaAqui: descontadaAqui", RESERVAS)

    def test_confirmar_descuenta_solo_si_no_salio(self):
        cuerpo = RESERVAS[RESERVAS.index("function _cerrar("):RESERVAS.index("function marcarVendida(")]
        self.assertIn("estado === 'vendida' && !aqui", cuerpo)
        self.assertIn("devolverStock && aqui", cuerpo)

    def test_cancelar_en_otro_dispositivo_devuelve_la_unidad_donde_salio(self):
        cuerpo = RESERVAS[RESERVAS.index("async function sincronizar("):RESERVAS.index("function movimientosDesde(")]
        self.assertIn("x.estado === 'cancelada' && descontadaAqui(mio)", cuerpo)

    def test_el_panel_publica_y_trae_el_descuento_a_los_dos_arrays(self):
        vender = ADMIN[ADMIN.index("function reservaVender(id){"):ADMIN.index("function reservaCancelar(id){")]
        self.assertIn("sincronizarConGitHub", vender)
        self.assertIn("m.descontado", vender)
        self.assertIn("stockYaDescontado:true", vender)
        traer = ADMIN[ADMIN.index("function reservasTraerStock(){"):ADMIN.index("window.addEventListener('focus', reservasTraerStock)")]
        self.assertIn("productos!==PRODUCTOS", traer)


if __name__ == "__main__":
    unittest.main()
