"""
Comisión por cobrar: el dueño paga la comisión al mes, no al vender.

El detalle (por mes, USD y MN aparte, deshacer sin borrar, la marca fuera de
/ventas que es inmutable) se comprueba en el navegador: tests/comis_check.mjs.
Aquí, lo que se puede ver sin navegador.
"""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")


class ComisionPorCobrarTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "comis_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=240)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_la_marca_vive_en_privado_y_no_dentro_de_la_venta(self):
        # /ventas es inmutable (".write": "!data.exists()"): una marca dentro de la venta no se podria cambiar.
        self.assertIn("/privado/comisiones_cobradas.json", ADMIN)
        reglas = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]
        self.assertIn("admin_uid", reglas["privado"][".write"])
        self.assertIn("admin_uid", reglas["privado"][".read"])

    def test_deshacer_no_borra(self):
        # Si deshacer borrara la clave, el otro telefono (que aun la tiene cobrada) la volveria a subir.
        self.assertIn("{p:pagada?1:0, ts}", ADMIN.replace(" ", " "))


if __name__ == "__main__":
    unittest.main()
