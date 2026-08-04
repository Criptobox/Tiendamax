"""
Corre la regresión del seguimiento post-venta (tests/crm_check.mjs) dentro de
unittest, y comprueba las dos costuras que el motor no puede ver por sí solo:
que la venta capture al cliente, y que ese dato NO acabe en Firebase.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "crm_check.mjs"
UI = ROOT / "js" / "src" / "tm-ui.src.js"
ADMIN = ROOT / "admin.html"


class SeguimientoTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class DatosDelClienteTest(unittest.TestCase):
    """El nombre y el teléfono del cliente son datos personales, y este repo no
    tiene autenticación: /pedidos/$id es ".read": true, así que lo que se suba
    ahí lo lee cualquiera. Se quedan en localStorage."""

    @classmethod
    def setUpClass(cls):
        cls.ui = UI.read_text(encoding="utf-8")
        cls.admin = ADMIN.read_text(encoding="utf-8")

    def test_el_pedido_que_va_a_firebase_no_lleva_al_cliente(self):
        # El payload se arma campo a campo; el fallo sería que alguien lo
        # cambiara por el objeto `venta` entero, que sí trae cliente/teléfono.
        m = re.search(r"/pedidos/.*?body:\s*JSON\.stringify\((\{.*?\})\)",
                      self.ui, re.S)
        self.assertIsNotNone(m, "no se encontró el envío de /pedidos a Firebase")
        payload = m.group(1)
        for prohibido in ("cliente", "telefono", "tel:"):
            self.assertNotIn(
                prohibido, payload,
                f"'{prohibido}' no puede viajar a /pedidos: ese nodo lo lee cualquiera",
            )
        self.assertNotRegex(
            payload, r"\.\.\.venta|Object\.assign\(\s*\{\s*\}\s*,\s*venta",
            "no vuelques el objeto `venta` entero en el payload: arrastra los datos del cliente",
        )

    def test_la_venta_captura_nombre_y_telefono(self):
        # Sin esto el tab Clientes vuelve a estar siempre vacío, que es
        # justamente el estado del que venimos.
        self.assertIn('id="venta-cliente"', self.admin, "falta el campo de nombre en la venta")
        self.assertIn('id="venta-tel"', self.admin, "falta el campo de WhatsApp en la venta")
        self.assertRegex(
            self.admin, r"registrarVentaPedido\(\s*vendidos\s*,\s*cliente\s*\)",
            "ventaRegistrar debe pasarle el cliente al motor",
        )

    def test_el_motor_guarda_lo_que_recibe(self):
        m = re.search(r"function registrarVentaPedido\(items,\s*cliente\)", self.ui)
        self.assertIsNotNone(m, "registrarVentaPedido debe aceptar el cliente")
        self.assertIn("venta.cliente", self.ui, "el nombre debe guardarse en la venta")
        self.assertIn("venta.telefono", self.ui, "el teléfono debe guardarse en la venta")


if __name__ == "__main__":
    unittest.main()
