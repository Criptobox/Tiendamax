"""
🎁 Tarjeta de cliente: 1000 MN de descuento en cada una de las 3 compras
siguientes a la primera, que salen de la comisión del gestor.

El flujo entero se prueba en un navegador (tests/tarjeta_check.mjs). Aquí lo
que se ve sin él, y el QR leído por un lector independiente si hay OpenCV.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
REGLAS = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]
UI = (RAIZ / "js" / "src" / "tm-ui.src.js").read_text(encoding="utf-8")
T = (RAIZ / "t.html").read_text(encoding="utf-8")
MOD = (RAIZ / "js" / "tarjeta-cliente.js").read_text(encoding="utf-8")


class TarjetaClienteTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "tarjeta_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_la_regla_no_deja_listar_ni_escribir_a_cualquiera(self):
        t = REGLAS["tarjetas"]
        self.assertIs(t[".read"], False)                  # la lista entera, nunca
        self.assertIn("admin_uid", t["$codigo"][".write"])
        self.assertIs(t["$codigo"]["$otro"][".validate"], False)   # ni teléfono ni nada más

    def test_el_codigo_es_el_mismo_en_los_tres_sitios(self):
        # Alfabeto sin 0/O/1/I/L: el panel lo genera, la regla y t.html lo aceptan.
        alf = re.search(r"var ALF = '([^']+)'", MOD).group(1)
        rx = re.compile(re.search(r"/(\^TM\[[^/]+\]\{6\}\$)/", REGLAS["tarjetas"]["$codigo"][".read"]).group(1))
        self.assertTrue(rx.match("TM" + alf[:6]) and rx.match("TM" + alf[-6:]))
        for malo in "01OIL":
            self.assertFalse(rx.match("TM" + malo * 6), malo)
        self.assertIn("/^TM[2-9A-HJKMNP-Z]{6}$/", T)

    def test_los_tramos_son_los_mismos_en_el_panel_y_en_la_pagina(self):
        # La página promete lo que el panel cobra: si se separan, el cliente reclama con razón.
        tramos = re.search(r"var TRAMOS = \[\[(\d+), (\d+)\], \[(\d+), (\d+)\]\]", MOD)
        self.assertIsNotNone(tramos)
        alto_usd, alto_mn, medio_usd, medio_mn = tramos.groups()
        self.assertIn(f"<b>Desde ${medio_usd}</b><span>−{medio_mn} MN</span>", T)
        self.assertIn(f"<b>Desde ${alto_usd}</b><span>−{alto_mn} MN</span>", T)
        self.assertIn(f"<b>Menos de ${medio_usd}</b>", T)
        usos = re.search(r"var USOS = (\d+), EXTRA_MAX = (\d+)", MOD).groups()
        self.assertIn(f"var USOS = {usos[0]}, EXTRA_MAX = {usos[1]};", T)
        # La regla aguanta el máximo de descuentos y de premios.
        c = REGLAS["tarjetas"]["$codigo"]
        self.assertIn(f"<= {int(usos[0]) + int(usos[1])}", c["r"][".validate"])
        self.assertIn(f"<= {usos[1]}", c["g"][".validate"])

    def test_el_referido_solo_va_en_pedidos_a_la_tienda(self):
        ref = (RAIZ / "js" / "referido.js").read_text(encoding="utf-8")
        idx = (RAIZ / "index.html").read_text(encoding="utf-8")
        self.assertIn('src="js/referido.js?v=', idx)
        # Un wa.me sin número es compartir con un amigo: no se toca.
        self.assertIn("if (!m || !m[1]) return url;", ref)

    def test_la_venta_lleva_la_tarjeta_a_firebase(self):
        # Sin esto el otro teléfono cuenta la comisión entera de una venta que dejó 1000 MN menos.
        self.assertIn("v.tarjeta = venta.tarjeta; v.descTarjetaMN = venta.descTarjetaMN", UI)

    def test_la_pagina_es_ligera(self):
        self.assertNotIn("tm-bundle", T)
        self.assertNotIn("productos", T)
        self.assertIn('name="robots" content="noindex"', T)

    def test_el_qr_se_lee(self):
        # Un QR que parece un QR y no se lee es el fallo que no se ve. Con OpenCV, se lee.
        try:
            import cv2  # noqa: F401
            import numpy as np
        except Exception:
            self.skipTest("OpenCV no está instalado")
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible")
        textos = ["https://tiendamax.org/t?c=TM4VE3C8", "A", "Hola ñandú €", "https://tiendamax.org/" + "y" * 80]
        js = ("require('vm').runInThisContext(require('fs').readFileSync(%r,'utf8'));"
              "console.log(JSON.stringify(%s.map(t=>{const q=tmQR(t);const r=[];for(let f=0;f<q.n;f++){let s='';"
              "for(let c=0;c<q.n;c++)s+=q.get(f,c)?'1':'0';r.push(s)}return r})))") % (str(RAIZ / "js" / "qr-mini.js"), json.dumps(textos))
        mats = json.loads(subprocess.run([node, "-e", js], capture_output=True, text=True, timeout=60).stdout)
        for texto, filas in zip(textos, mats):
            n, e, q = len(filas), 10, 4
            img = np.full(((n + 2 * q) * e,) * 2, 255, np.uint8)
            for f, fila in enumerate(filas):
                for c, ch in enumerate(fila):
                    if ch == "1":
                        img[(f + q) * e:(f + q + 1) * e, (c + q) * e:(c + q + 1) * e] = 0
            leido, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
            self.assertEqual(leido, texto)


if __name__ == "__main__":
    unittest.main()
