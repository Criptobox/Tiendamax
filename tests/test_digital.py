"""Productos digitales (categoría TARJETAS): tarjetas regalo y recargas.

Ver js/src/tm-digital.src.js y scripts/precios_digitales.py. Lo que se
vigila aquí falla sin error:

- El precio vive en dos sitios (Python para los scripts, JavaScript para el
  panel). Si se separan, el panel calcula un precio y la tienda enseña otro.
- Un digital no se cobra en MN y no se paga al recibir: si un cambio lo
  devuelve al camino de los productos normales, la tarjeta sale con «Pago al
  recibir» y el precio en pesos a la tasa del dólar.
- Al darlos de alta, cada uno sería un push y un mensaje en el canal de
  Telegram como «producto nuevo». El dueño los anuncia una vez, a mano.
- El catálogo es público: dónde se compra cada código y a cuánto no puede
  estar en productos.json.

El comportamiento en la tienda lo prueba tests/digital_check.mjs en un
navegador de verdad, que se corre desde aquí.
"""
import json
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

import precios_digitales as pd  # noqa: E402

PRODUCTOS = json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))
DIGITALES = [p for p in PRODUCTOS if p.get("digital")]
FUENTE_JS = (RAIZ / "js" / "src" / "tm-digital.src.js").read_text(encoding="utf-8")


def _node():
    return shutil.which("node")


class EnNavegadorTest(unittest.TestCase):
    def test_la_tienda_se_comporta(self):
        if not _node():
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([_node(), str(RAIZ / "tests" / "digital_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class LaReglaDePrecioTest(unittest.TestCase):
    def test_ejemplos_acordados(self):
        # Los que se acordaron con el dueño, comparando con la competencia (+30 %).
        self.assertEqual(24, pd.precio_usdt(20, 20.5))          # Mastercard $20
        self.assertEqual(60, pd.precio_usdt(50, 51.26))         # Mastercard $50
        self.assertEqual(12, pd.precio_usdt(10, 10))            # PSN $10
        self.assertEqual(2, pd.precio_usdt(100, 1, recarga=True))   # 100 diamantes: el mínimo
        self.assertEqual(6, pd.precio_usdt(520, 5, recarga=True))
        self.assertEqual(25.5, pd.precio_usd(24))

    def test_python_y_javascript_pasan_igual_a_usd(self):
        if not _node():
            self.skipTest("node no está disponible en este entorno")
        casos = [2, 4, 6, 12, 18, 24, 30, 36, 60, 120]
        cuerpo = FUENTE_JS[FUENTE_JS.index("function tmDigitalPrecioUSD"):FUENTE_JS.index("function _tmDigUsd")]
        js = cuerpo + ";console.log(JSON.stringify(" + json.dumps(casos) + ".map(tmDigitalPrecioUSD)))"
        r = subprocess.run([_node(), "-e", js], capture_output=True, text=True, timeout=30)
        self.assertEqual(0, r.returncode, r.stderr)
        self.assertEqual([pd.precio_usd(u) for u in casos], json.loads(r.stdout),
                         "el paso de USDT a USD de Python y el de tm-digital.src.js se separaron")


class ElCatalogoTest(unittest.TestCase):
    def test_hay_productos_digitales(self):
        self.assertTrue(DIGITALES, "no queda ningún producto digital en productos.json")

    def test_cada_importe_tiene_precio_valido(self):
        for p in DIGITALES:
            imps = p.get("importes") or []
            self.assertTrue(imps, f"{p['nombre']} no tiene importes")
            for x in imps:
                self.assertGreaterEqual(x["usdt"], pd.PEDIDO_MIN, f"{p['nombre']} {x['v']}: menos del pedido mínimo")
                self.assertEqual(int(x["usdt"]), x["usdt"], f"{p['nombre']} {x['v']}: el precio en USDT va redondeado")
                self.assertEqual(pd.precio_usd(x["usdt"]), x["usd"],
                                 f"{p['nombre']} {x['v']}: el precio en USD no es USDT × 1,05")
            self.assertEqual(min(x["usd"] for x in imps), p["precioActual"],
                             f"{p['nombre']}: precioActual tiene que ser el «desde» en USD (ordenar, Max, Google)")

    def test_nunca_en_mn_y_con_comision(self):
        for p in DIGITALES:
            self.assertNotEqual("MN", p.get("moneda"), f"{p['nombre']}: un digital no se cobra en MN")
            self.assertEqual("USD", p.get("comisionMoneda"), f"{p['nombre']}: la ganancia se cuenta en USD")
            self.assertGreater(float(p.get("comision") or 0), 0,
                               f"{p['nombre']}: sin comisión sale en la agenda como «sin comisión»")

    def test_el_catalogo_publico_no_dice_donde_se_compra(self):
        prohibidos = re.compile(r"bitrefill|cryptorefills|coinsbee", re.I)
        for p in DIGITALES:
            self.assertFalse({"coste", "proveedor"} & set(p), f"{p['nombre']}: coste o proveedor en el catálogo público")
            for x in p.get("importes") or []:
                self.assertFalse({"coste", "proveedor"} & set(x), f"{p['nombre']}: coste en un importe público")
            self.assertIsNone(prohibidos.search(json.dumps(p, ensure_ascii=False)),
                              f"{p['nombre']}: nombra al proveedor en el catálogo público")

    def test_tienen_imagen_y_categoria(self):
        cats = json.loads((RAIZ / "categorias.json").read_text(encoding="utf-8"))
        subs = json.loads((RAIZ / "subcategorias.json").read_text(encoding="utf-8"))
        for p in DIGITALES:
            self.assertIn(p["categoria"], cats["nombres"])
            self.assertIn(p["subcategoria"], subs.get(p["categoria"], []))
            nombre = p["imagen"].rsplit("/", 1)[-1]
            self.assertTrue((RAIZ / "imagenes" / nombre).exists(), f"falta {nombre}")
            self.assertTrue((RAIZ / "imagenes" / "thumbs" / nombre).exists(), f"falta la miniatura de {nombre}")


class SinAvisosTest(unittest.TestCase):
    def test_el_push_no_los_anuncia(self):
        import send_notifications as sn
        cambios = {"nuevos": [{"id": 1}, {"id": 2}], "rebajas": [{"id": 2}], "restock": [{"id": 1}]}
        prods = [{"id": 1, "digital": True}, {"id": 2}]
        self.assertEqual({"nuevos": [{"id": 2}], "rebajas": [{"id": 2}], "restock": []},
                         sn.sin_digitales(cambios, prods))
        fuente = (RAIZ / "scripts" / "send_notifications.py").read_text(encoding="utf-8")
        self.assertIn("cambios = sin_digitales(cambios, p_act)", fuente)

    def test_el_canal_de_telegram_no_los_anuncia(self):
        fuente = (RAIZ / "bot" / "publish_producto.py").read_text(encoding="utf-8")
        i_filtro = fuente.index('if not p.get("digital")')
        i_nuevos = fuente.index("# ── 1. Productos nuevos")
        self.assertLess(i_filtro, i_nuevos, "el filtro de digitales tiene que ir antes de anunciar nuevos")


class LaPaginaTest(unittest.TestCase):
    def test_precio_y_vista_previa(self):
        import regenerate_artifacts as ra
        p = DIGITALES[0]
        desde = min(int(x["usdt"]) for x in p["importes"])
        self.assertEqual(f"desde {desde} USDT", ra.precio_pagina(p.get("precioActual"), p))
        vp = ra.descripcion_vista_previa(p, "")
        self.assertNotIn("Pagas al recibirlo", vp)
        self.assertNotIn("disponible", vp)


if __name__ == "__main__":
    unittest.main()
