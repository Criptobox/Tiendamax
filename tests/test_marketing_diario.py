"""
Tests para scripts/marketing_diario.py — pack diario rotativo + checklist
Revolico. Corre sin red: solo funciones puras (la parte Telegram no se toca).
"""
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import marketing_diario as md  # noqa: E402


def _prod(i, stock=5, **kw):
    p = {"id": 1000 + i, "nombre": f"Producto {i}", "precioActual": 10 + i,
         "stock": stock, "categoria": "ENERGIA", "imagen": f"imagenes/x{i}.webp"}
    p.update(kw)
    return p


class SeleccionPackTest(unittest.TestCase):
    def test_solo_productos_con_stock(self):
        prods = [_prod(1), _prod(2, stock=0), _prod(3), _prod(4, stock=0), _prod(5)]
        pack = md.seleccionar_pack(prods, datetime(2026, 7, 20))
        self.assertTrue(all(int(p["stock"]) > 0 for p in pack))
        self.assertEqual(len(pack), 3)

    def test_excluye_inactivos(self):
        prods = [_prod(1, activo=False), _prod(2), _prod(3), _prod(4)]
        pack = md.seleccionar_pack(prods, datetime(2026, 7, 20))
        self.assertNotIn("Producto 1", [p["nombre"] for p in pack])

    def test_deterministico_mismo_dia(self):
        prods = [_prod(i) for i in range(10)]
        a = md.seleccionar_pack(prods, datetime(2026, 7, 20))
        b = md.seleccionar_pack(prods, datetime(2026, 7, 20))
        self.assertEqual([p["id"] for p in a], [p["id"] for p in b])

    def test_rota_dias_distintos(self):
        prods = [_prod(i) for i in range(10)]
        hoy = md.seleccionar_pack(prods, datetime(2026, 7, 20))
        manana = md.seleccionar_pack(prods, datetime(2026, 7, 21))
        self.assertNotEqual([p["id"] for p in hoy], [p["id"] for p in manana])

    def test_catalogo_completo_cicla(self):
        prods = [_prod(i) for i in range(9)]  # 9 productos, pack de 3 → ciclo de 3 días
        vistos = set()
        base = datetime(2026, 7, 20)
        for d in range(3):
            for p in md.seleccionar_pack(prods, base + timedelta(days=d)):
                vistos.add(str(p["id"]))
        self.assertEqual(len(vistos), 9)

    def test_catalogo_chico_sin_duplicados(self):
        prods = [_prod(1), _prod(2)]
        pack = md.seleccionar_pack(prods, datetime(2026, 7, 20))
        ids = [p["id"] for p in pack]
        self.assertEqual(len(ids), len(set(ids)))

    def test_sin_stock_devuelve_vacio(self):
        prods = [_prod(1, stock=0), _prod(2, stock=0)]
        self.assertEqual(md.seleccionar_pack(prods, datetime(2026, 7, 20)), [])


class CaptionTest(unittest.TestCase):
    def test_caption_contenido_basico(self):
        p = _prod(1, stock=2, precioOriginal=20)
        cap = md.armar_caption(p, tasa=400)
        self.assertIn("Producto 1", cap)
        self.assertIn("$11.00 USD", cap)
        self.assertIn("MN", cap)
        self.assertIn("rebaja", cap)          # precioOriginal > precioActual
        self.assertIn("Últimas 2", cap)       # escasez
        self.assertIn(f"/p/producto-{p['id']}.html", cap)
        self.assertIn("#TiendaMax", cap)
        self.assertIn("#Energia", cap)

    def test_caption_sin_tasa_no_pone_mn(self):
        cap = md.armar_caption(_prod(1), tasa=0)
        self.assertNotIn("MN", cap)

    def test_caption_limpia_zero_width(self):
        p = _prod(1, nombre="​🔌 Cargador X")
        cap = md.armar_caption(p, tasa=0)
        self.assertNotIn("​", cap)

    def test_imagen_absoluta(self):
        self.assertTrue(md.imagen_absoluta(_prod(1)).startswith("https://tiendamax.org/imagenes/"))
        self.assertEqual(md.imagen_absoluta({"imagen": "https://x.com/a.jpg"}), "https://x.com/a.jpg")
        self.assertEqual(md.imagen_absoluta({}), "")


class RevolicoTest(unittest.TestCase):
    def test_listas_separan_stock_y_agotados(self):
        prods = [_prod(1), _prod(2, stock=0), _prod(3, activo=False, stock=0)]
        renovar, no_renovar = md.listas_revolico(prods)
        self.assertEqual(renovar, ["Producto 1"])
        self.assertEqual(no_renovar, ["Producto 2"])  # el inactivo no aparece

    def test_mensaje_revolico(self):
        prods = [_prod(1), _prod(2, stock=0)]
        msg = md.mensaje_revolico(prods)
        self.assertIn("✅ Renovar (en stock, 1):", msg)
        self.assertIn("⛔ NO renovar (agotados, 1):", msg)
        self.assertIn("Producto 1", msg)
        self.assertIn("Producto 2", msg)

    def test_tasa_mn(self):
        self.assertEqual(md.tasa_mn({"tasaMN": 400, "margenMN": 10}), 410)
        self.assertEqual(md.tasa_mn({"tasaMN": 400}), 410)   # margen por defecto 10
        self.assertEqual(md.tasa_mn({}), 0)


if __name__ == "__main__":
    unittest.main()
