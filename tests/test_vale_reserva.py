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
    def test_el_vale_no_promete_descuentos(self):
        """El vale va antes de la compra: el descuento de la tarjeta se decide
        al registrar la venta. Ninguna cifra de la tarjeta en el vale."""
        cuerpo = VALE[VALE.index("function drawValeImg()"):VALE.index("// Parte un texto en líneas")]
        sin_comentarios = "\n".join(l.split("//")[0] for l in cuerpo.splitlines())
        self.assertNotIn("1000", sin_comentarios)
        self.assertNotIn("descuento", sin_comentarios.lower())

    def test_la_reserva_no_caduca_sola(self):
        """Si el cliente pagó y el sistema devolviera el stock, se vendería dos
        veces la misma unidad: vencer solo avisa."""
        self.assertNotIn("_cerrar(", RESERVAS[RESERVAS.index("function vencida"):RESERVAS.index("function noVinoDe")])

    def test_el_panel_entra_solo_con_la_sesion(self):
        self.assertIn("via:'sesion'", ADMIN)
        self.assertIn("TMAuth.usuario() && panel", ADMIN)


if __name__ == "__main__":
    unittest.main()
