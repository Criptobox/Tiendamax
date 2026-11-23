"""Reservas: escanear la Tarjeta TiendaMax antes de «Ejecutar venta».

El recorrido lo comprueba tests/reserva_tarjeta_check.mjs en un navegador; aquí
van los contratos que se leen en el código.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "reserva_tarjeta_check.mjs"
ADMIN = (ROOT / "admin.html").read_text(encoding="utf-8")
TARJETA = (ROOT / "js" / "tarjeta-cliente.js").read_text(encoding="utf-8")


class EnNavegadorTest(unittest.TestCase):
    def test_de_punta_a_punta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class SelectorCatalogoDelValeTest(unittest.TestCase):
    def test_las_categorias_no_se_aplastan(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(ROOT / "tests" / "vale_catalogo_check.mjs")], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_ejecutar_venta_pasa_la_tarjeta_escaneada(self):
        i = ADMIN.index("function reservaVender(id)")
        cuerpo = ADMIN[i:i + 2500]
        self.assertIn("tmTarjetaPreguntar(telV, items, esc1&&esc1.c)", cuerpo)

    def test_el_escaner_se_reutiliza_sin_tocar_el_formulario_de_venta(self):
        self.assertIn("opts.alCodigo", TARJETA)
        self.assertIn("window.tmTarjetaValidar", TARJETA)


if __name__ == "__main__":
    unittest.main()
