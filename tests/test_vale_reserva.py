"""El vale nuevo y sus reservas: imagen que reserva, nombre exacto, plazo,
«no vino» y el panel que entra con la sesión guardada.

El recorrido lo comprueba tests/vale_reserva_check.mjs en un navegador; aquí
van los contratos que se leen en el código.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "vale_reserva_check.mjs"
VALE = (ROOT / "vale.html").read_text(encoding="utf-8")
ADMIN = (ROOT / "admin.html").read_text(encoding="utf-8")
RESERVAS = (ROOT / "js" / "reservas.js").read_text(encoding="utf-8")


class EnNavegadorTest(unittest.TestCase):
    def test_de_punta_a_punta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_el_vale_no_descuenta_esta_compra(self):
        """El vale va antes de la compra: el descuento de la tarjeta se decide al
        registrar la venta. El vale solo cuenta lo de las PRÓXIMAS compras."""
        self.assertNotIn("descuentoDe(", VALE)
        self.assertNotIn("descTarjetaMN", VALE)
        prog = VALE[VALE.index("function _valeProgramaTarjeta()"):VALE.index("function textoGarantias()")]
        self.assertIn("próximas", prog)

    def test_los_tramos_del_vale_son_los_de_la_tarjeta(self):
        """El vale promete lo que el panel cobra: si se separan, el cliente reclama con razón."""
        import re
        mod = (ROOT / "js" / "tarjeta-cliente.js").read_text(encoding="utf-8")
        tramos = re.search(r"var TRAMOS = (\[\[\d+, \d+\], \[\d+, \d+\]\])", mod).group(1).replace(" ", "")
        usos = re.search(r"var USOS = (\d+), EXTRA_MAX = (\d+)", mod).groups()
        self.assertIn(f"const VALE_TARJETA={{TRAMOS:{tramos}, USOS:{usos[0]}, EXTRA_MAX:{usos[1]}}};", VALE)

    def test_la_reserva_no_caduca_sola(self):
        """Si el cliente pagó y el sistema devolviera el stock, se vendería dos
        veces la misma unidad: vencer solo avisa."""
        self.assertNotIn("_cerrar(", RESERVAS[RESERVAS.index("function vencida"):RESERVAS.index("function noVinoDe")])

    def test_el_panel_entra_solo_con_la_sesion(self):
        self.assertIn("via:'sesion'", ADMIN)
        self.assertIn("TMAuth.usuario() && panel", ADMIN)


if __name__ == "__main__":
    unittest.main()
