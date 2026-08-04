"""
Corre la regresión de la cotización imprimible de Max
(tests/cotizacion_check.mjs) dentro de unittest, que es lo que ejecuta CI.

La lógica vive en js/src/tm-bot-cerebro.src.js, así que las comprobaciones
están escritas en Node contra ese mismo archivo — reimplementarlas en Python
las dejaría desincronizadas del código real a la primera modificación.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "cotizacion_check.mjs"
CEREBRO = ROOT / "js" / "src" / "tm-bot-cerebro.src.js"


class CotizacionTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class BotonCotizarTest(unittest.TestCase):
    """El documento puede estar perfecto y ser inalcanzable: si el botón sale
    de las respuestas o el manejador deja de reconocerlo, no falla nada — la
    función simplemente se vuelve invisible para el cliente."""

    @classmethod
    def setUpClass(cls):
        cls.src = CEREBRO.read_text(encoding="utf-8")

    def test_los_tres_armadores_ofrecen_la_cotizacion(self):
        # Un armador sin el botón deja ese tipo de sistema sin propuesta.
        armadores = re.findall(
            r"R\.sistema(\w+)\s*=.*?quickReplies:\s*\[(.*?)\]",
            self.src, re.S,
        )
        self.assertEqual(
            3, len(armadores),
            "se esperaban los tres armadores (solar, seguridad, internet)",
        )
        for nombre, replies in armadores:
            self.assertIn(
                "cotización", replies.lower(),
                f"R.sistema{nombre} no ofrece el botón de cotización",
            )

    def test_el_manejador_reconoce_el_boton(self):
        m = re.search(r"function handleQuickReply\(reply\)\{(.*?)\n  \}", self.src, re.S)
        self.assertIsNotNone(m, "no se encontró handleQuickReply()")
        self.assertIn(
            "abrirCotizacion()", m.group(1),
            "handleQuickReply no llama a abrirCotizacion: el botón no haría nada",
        )

    def test_no_se_carga_ninguna_libreria_de_pdf(self):
        # El PDF lo hace el navegador con window.print(). Meter jsPDF o
        # html2canvas aquí serían cientos de KB en el cerebro del bot, que se
        # baja entero en 3G la primera vez que alguien abre el chat.
        for libreria in ("jspdf", "jsPDF", "html2canvas", "pdfmake"):
            self.assertNotIn(libreria, self.src, f"el cerebro no debe cargar {libreria}")


if __name__ == "__main__":
    unittest.main()
