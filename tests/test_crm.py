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
    """El nombre y el teléfono del cliente son datos personales y se quedan en
    el aparato donde se escribieron.

    Dos salidas a Firebase, y las dos se vigilan aquí:

      · **/pedidos/$id** es ".read": true — lo lee cualquiera. Obvio.
      · **/ventas/$id** solo lo lee la cuenta del dueño… y aun así. Durante
        meses subió el objeto `venta` ENTERO, con nombre y teléfono, tres
        líneas debajo de un comentario que decía que se quedaban aquí. No era
        público, pero en este mismo proyecto /tokens, /avisos_stock y
        /wishlist_avisos estuvieron abiertos por descuido, y una regla que se
        republica floja no devuelve lo que ya subió. Además ese nodo es
        inmutable (".write": "!data.exists()"): lo que entra no se corrige
        desde el panel.

    Los dos payloads se arman con lista blanca, no borrando campos: con una
    lista negra, el próximo campo del formulario sube solo.
    """

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

    def test_la_venta_que_va_a_firebase_no_lleva_al_cliente(self):
        cuerpo = self.ui[self.ui.index("function _ventaParaFirebase"):]
        cuerpo = cuerpo[:cuerpo.index("\n}")]
        for prohibido in ("cliente", "telefono"):
            self.assertNotIn(
                prohibido, cuerpo,
                f"'{prohibido}' no puede viajar a /ventas: ese nodo es inmutable, "
                "lo que sube no se corrige después",
            )

    def test_la_venta_sube_por_lista_blanca(self):
        # El fallo original fue JSON.stringify(venta) a pelo. Que el payload se
        # construya campo a campo es lo único que impide que el próximo campo
        # nuevo del formulario suba sin que nadie lo decida.
        m = re.search(r"/ventas/\$\{venta\.id\}\.json.*?body:\s*JSON\.stringify\((.*?)\)\s*\n",
                      self.ui, re.S)
        self.assertIsNotNone(m, "no se encontró el envío de /ventas a Firebase")
        self.assertEqual("_ventaParaFirebase(venta)", m.group(1).strip(),
                         "el cuerpo tiene que pasar por la lista blanca, no ser `venta`")
        self.assertIn("if (venta.origen)", self.ui,
                      "el canal sí va: no es del cliente y sin él el cruce de "
                      "canales solo contaría las ventas de un teléfono")

    def test_la_venta_captura_nombre_y_telefono(self):
        # Sin esto el tab Clientes vuelve a estar siempre vacío, que es
        # justamente el estado del que venimos.
        self.assertIn('id="venta-cliente"', self.admin, "falta el campo de nombre en la venta")
        self.assertIn('id="venta-tel"', self.admin, "falta el campo de WhatsApp en la venta")
        self.assertRegex(
            self.admin, r"registrarVentaPedido\(\s*vendidos\s*,\s*cliente\s*[,)]",
            "ventaRegistrar debe pasarle el cliente al motor",
        )

    def test_el_seguimiento_vive_dentro_de_la_tabla_de_clientes(self):
        # Estuvo un rato como pestaña aparte y era el mismo dato en dos sitios.
        self.assertNotIn(
            "pill('seguimiento'", self.admin,
            "el seguimiento se muestra dentro de Clientes, no en una pestaña propia",
        )
        self.assertRegex(
            self.admin, r"CLI_VIEW==='clientes'[\s\S]{0,3000}segEnviar\(",
            "la vista de Clientes debe traer el botón para escribirle al cliente",
        )

    def test_los_clientes_se_agrupan_por_numero(self):
        # Agrupando por nombre, la misma persona salía en dos filas si una venta
        # llevaba el nombre y otra solo el teléfono: compras repartidas y dos
        # botones apuntando al mismo número.
        self.assertRegex(
            self.admin, r"const k\s*=\s*tel\s*\?\s*\('tel:'\s*\+\s*tel\)",
            "la identidad del cliente debe ser el teléfono cuando lo hay",
        )

    def test_escribir_apunta_el_descanso(self):
        # Sin esto, marcar un seguimiento repinta y saca al instante el
        # siguiente hito del mismo cliente, con su botón listo.
        m = re.search(r"function segEnviar\(ventaId\)\{(.*?)\n\}", self.admin, re.S)
        self.assertIsNotNone(m, "no se encontró segEnviar()")
        self.assertIn("tmRegistrarContacto", m.group(1),
                      "al escribirle hay que apuntar el contacto para el descanso")
        s = re.search(r"function segSaltar\(ventaId\)\{(.*?)\n\}", self.admin, re.S)
        self.assertIsNotNone(s, "no se encontró segSaltar()")
        self.assertNotIn("tmRegistrarContacto", s.group(1),
                         "saltar no es contactar: no debe abrir descanso")

    def test_no_vuelve_la_pestana_muerta_de_whatsapp(self):
        # Solo servía para explicar que no había nada que enseñar.
        self.assertNotIn("pill('whatsapp'", self.admin)

    def test_el_motor_guarda_lo_que_recibe(self):
        # Lo que importa es que reciba el cliente, no cuántos parámetros tenga:
        # las ventas que salen de una reserva pasan un tercero para que no se
        # vuelva a descontar el stock (ya salió al mandar el vale).
        m = re.search(r"function registrarVentaPedido\(items,\s*cliente\b[^)]*\)", self.ui)
        self.assertIsNotNone(m, "registrarVentaPedido debe aceptar el cliente")
        self.assertIn("venta.cliente", self.ui, "el nombre debe guardarse en la venta")
        self.assertIn("venta.telefono", self.ui, "el teléfono debe guardarse en la venta")


if __name__ == "__main__":
    unittest.main()
