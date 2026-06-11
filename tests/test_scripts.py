#!/usr/bin/env python3
"""
Tests unitarios para los scripts Python de TiendaMax.

Ejecutar:
    python -m pytest tests/ -v
    # o sin pytest:
    python tests/test_scripts.py
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Añadir scripts/ al path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


# ═══════════════════════════════════════════════════════════════
# regenerate_artifacts.py
# ═══════════════════════════════════════════════════════════════

class TestDescShort(unittest.TestCase):
    def setUp(self):
        from regenerate_artifacts import desc_short
        self.desc_short = desc_short

    def test_short_string_unchanged(self):
        self.assertEqual(self.desc_short("Hola"), "Hola")

    def test_truncates_at_n(self):
        s = "A" * 250
        result = self.desc_short(s, 200)
        self.assertLessEqual(len(result), 200)
        self.assertTrue(result.endswith("…"))

    def test_collapses_whitespace(self):
        result = self.desc_short("Hola   mundo\n\ntest")
        self.assertEqual(result, "Hola mundo test")

    def test_empty_string(self):
        self.assertEqual(self.desc_short(""), "")

    def test_none_input(self):
        self.assertEqual(self.desc_short(None or ""), "")


class TestRegenerateSubcategorias(unittest.TestCase):
    def setUp(self):
        from regenerate_artifacts import regenerate_subcategorias
        self.fn = regenerate_subcategorias

    def _run(self, products, manual):
        with tempfile.TemporaryDirectory() as d:
            import regenerate_artifacts as ra
            orig_root, orig_subs = ra.ROOT, ra.SUBS
            ra.ROOT = Path(d)
            ra.SUBS = Path(d) / "subcategorias.json"
            try:
                self.fn(products, manual)
                if ra.SUBS.exists():
                    return json.loads(ra.SUBS.read_text())
                return None
            finally:
                ra.ROOT, ra.SUBS = orig_root, orig_subs

    def test_preserves_manual_subcategories(self):
        manual = {"Electrónica": ["Celulares", "Laptops"]}
        result = self._run([], manual)
        self.assertEqual(result, {"Electrónica": ["Celulares", "Laptops"]})

    def test_adds_subcategories_from_products(self):
        manual = {}
        products = [
            {"id": 1, "nombre": "X", "categoria": "Ropa", "subcategoria": "Hombres"},
        ]
        result = self._run(products, manual)
        self.assertIn("Ropa", result)
        self.assertIn("Hombres", result["Ropa"])

    def test_no_duplicate_subcategories(self):
        manual = {"Ropa": ["Hombres"]}
        products = [
            {"id": 1, "nombre": "X", "categoria": "Ropa", "subcategoria": "Hombres"},
        ]
        result = self._run(products, manual)
        self.assertEqual(result["Ropa"].count("Hombres"), 1)

    def test_ignores_todas_subcategory(self):
        manual = {}
        products = [
            {"id": 1, "nombre": "X", "categoria": "Electrónica", "subcategoria": "Todas"},
        ]
        result = self._run(products, manual)
        self.assertNotIn("Todas", result.get("Electrónica", []))

    def test_product_without_subcategory(self):
        manual = {}
        products = [{"id": 1, "nombre": "X", "categoria": "Electrónica"}]
        result = self._run(products, manual)
        self.assertIn("Electrónica", result)
        self.assertEqual(result["Electrónica"], [])


class TestCleanupComisiones(unittest.TestCase):
    def setUp(self):
        from regenerate_artifacts import cleanup_comisiones
        self.fn = cleanup_comisiones

    def _run(self, products, comm):
        with tempfile.TemporaryDirectory() as d:
            import regenerate_artifacts as ra
            orig_root, orig_comm = ra.ROOT, ra.COMM
            ra.ROOT = Path(d)
            ra.COMM = Path(d) / "comisiones.json"
            ra.COMM.write_text(json.dumps(comm))
            try:
                changed = self.fn(products, comm)
                if ra.COMM.exists():
                    return changed, json.loads(ra.COMM.read_text())
                return changed, comm
            finally:
                ra.ROOT, ra.COMM = orig_root, orig_comm

    def test_removes_orphan_ids(self):
        products = [{"id": 1, "nombre": "X"}]
        comm = {"1": 0.05, "999": 0.1}
        changed, result = self._run(products, comm)
        self.assertTrue(changed)
        self.assertIn("1", result)
        self.assertNotIn("999", result)

    def test_keeps_valid_ids(self):
        products = [{"id": 1}, {"id": 2}]
        comm = {"1": 0.05, "2": 0.08}
        changed, result = self._run(products, comm)
        self.assertFalse(changed)
        self.assertEqual(set(result.keys()), {"1", "2"})

    def test_non_dict_comm_returns_false(self):
        changed = self.fn([], [])
        self.assertFalse(changed)


class TestPageTemplate(unittest.TestCase):
    """Verifica que el template de páginas /p/ genere HTML correcto."""

    def test_template_contains_required_elements(self):
        from regenerate_artifacts import PAGE_TEMPLATE
        import json as _json
        from html import escape

        html = PAGE_TEMPLATE.format(
            title=escape("Test — $9.99 USD | TiendaMax"),
            html_name=escape("Producto Test"),
            og_title=escape("Producto Test — $9.99 USD"),
            og_desc=escape("Descripción de prueba del producto"),
            image=escape("https://tiendamax.org/og-image.png", quote=True),
            keywords=escape("Producto Test, TiendaMax, Cuba", quote=True),
            page_url="https://tiendamax.org/p/producto-1.html",
            app_url="https://tiendamax.org/#producto-1",
            app_url_js="https://tiendamax.org/#producto-1",
            price="9.99",
            json_name=_json.dumps("Producto Test"),
            json_desc=_json.dumps("Descripción de prueba del producto"),
            json_img=_json.dumps("https://tiendamax.org/og-image.png"),
            availability="https://schema.org/InStock",
        )

        self.assertIn("content=\"1;url=", html)           # redirect 1s
        self.assertIn("application/ld+json", html)         # JSON-LD
        self.assertIn("schema.org/InStock", html)           # availability
        self.assertIn("Descripción de prueba", html)        # desc visible
        self.assertIn("$9.99 USD", html)                    # price visible
        self.assertIn("Producto Test", html)                # name visible


# ═══════════════════════════════════════════════════════════════
# update_rate_from_eltoque.py
# ═══════════════════════════════════════════════════════════════

class TestLoadNextData(unittest.TestCase):
    def setUp(self):
        from update_rate_from_eltoque import load_next_data, RateUpdateError
        self.load = load_next_data
        self.Error = RateUpdateError

    def test_parses_valid_next_data(self):
        payload = {"props": {"pageProps": {"data": "test"}}}
        html = f'<script id="__NEXT_DATA__">{json.dumps(payload)}</script>'
        result = self.load(html)
        self.assertEqual(result["props"]["pageProps"]["data"], "test")

    def test_raises_when_script_missing(self):
        with self.assertRaises(Exception):
            self.load("<html><body>sin script</body></html>")

    def test_raises_on_invalid_json(self):
        html = '<script id="__NEXT_DATA__">{ invalid json }</script>'
        with self.assertRaises(Exception):
            self.load(html)


class TestRateValidation(unittest.TestCase):
    """Verifica la lógica de validación de rango de tasa."""

    def setUp(self):
        import update_rate_from_eltoque as m
        self.MIN = m.MIN_TASA
        self.MAX = m.MAX_TASA

    def test_valid_range(self):
        self.assertGreater(300.0, self.MIN)
        self.assertLess(300.0, self.MAX)

    def test_min_boundary(self):
        self.assertFalse(self.MIN < self.MIN < self.MAX)

    def test_max_boundary(self):
        self.assertFalse(self.MIN < self.MAX < self.MAX)

    def test_typical_cuban_rate(self):
        # Tasa típica cubana 2024-2026: 200-400 MN/USD
        for rate in [200.0, 300.0, 350.0, 400.0]:
            self.assertTrue(self.MIN < rate < self.MAX, f"Rate {rate} debería ser válida")

    def test_obviously_wrong_rates(self):
        for rate in [0.0, 50.0, 5000.0, -100.0]:
            self.assertFalse(self.MIN < rate < self.MAX, f"Rate {rate} debería ser inválida")


class TestLoadConfig(unittest.TestCase):
    def setUp(self):
        from update_rate_from_eltoque import load_config, save_config
        self.load = load_config
        self.save = save_config

    def test_returns_empty_dict_when_file_missing(self):
        import update_rate_from_eltoque as m
        orig = m.CONFIG_PATH
        m.CONFIG_PATH = Path("/tmp/nonexistent_tiendamax_test_config.json")
        try:
            result = self.load()
            self.assertEqual(result, {})
        finally:
            m.CONFIG_PATH = orig

    def test_save_and_load_roundtrip(self):
        import update_rate_from_eltoque as m
        orig = m.CONFIG_PATH
        with tempfile.TemporaryDirectory() as d:
            m.CONFIG_PATH = Path(d) / "config.json"
            try:
                self.save({"tasaMN": 340.0, "tasaFuente": "elTOQUE"})
                loaded = self.load()
                self.assertEqual(loaded["tasaMN"], 340.0)
                self.assertEqual(loaded["tasaFuente"], "elTOQUE")
            finally:
                m.CONFIG_PATH = orig

    def test_save_is_atomic(self):
        """El archivo .tmp no debe quedar si save tiene éxito."""
        import update_rate_from_eltoque as m
        orig = m.CONFIG_PATH
        with tempfile.TemporaryDirectory() as d:
            m.CONFIG_PATH = Path(d) / "config.json"
            try:
                self.save({"tasaMN": 350.0})
                tmp = m.CONFIG_PATH.parent / f".{m.CONFIG_PATH.name}.tmp"
                self.assertFalse(tmp.exists(), ".tmp no debe existir tras save exitoso")
            finally:
                m.CONFIG_PATH = orig


# ═══════════════════════════════════════════════════════════════
# send_notifications.py — detectar_cambios
# ═══════════════════════════════════════════════════════════════

class TestDetectarCambios(unittest.TestCase):
    def setUp(self):
        from send_notifications import detectar_cambios
        self.fn = detectar_cambios

    def _prod(self, pid, precio, stock=5, nombre="Producto"):
        return {"id": pid, "precioActual": precio, "stock": stock, "nombre": nombre}

    def test_detecta_rebaja(self):
        antes = [self._prod(1, 100.0)]
        ahora = [self._prod(1, 80.0)]
        res = self.fn({}, {}, ahora, antes)
        self.assertEqual(len(res["rebajas"]), 1)
        self.assertEqual(res["rebajas"][0]["id"], 1)
        self.assertEqual(res["rebajas"][0]["antes"], 100.0)
        self.assertEqual(res["rebajas"][0]["ahora"], 80.0)

    def test_no_rebaja_si_diferencia_menor_50_centavos(self):
        antes = [self._prod(1, 100.0)]
        ahora = [self._prod(1, 99.6)]
        res = self.fn({}, {}, ahora, antes)
        self.assertEqual(res["rebajas"], [])

    def test_detecta_producto_nuevo(self):
        antes = [self._prod(1, 100.0)]
        ahora = [self._prod(1, 100.0), self._prod(2, 50.0, nombre="Nuevo")]
        res = self.fn({}, {}, ahora, antes)
        self.assertEqual(len(res["nuevos"]), 1)
        self.assertEqual(res["nuevos"][0]["id"], 2)

    def test_detecta_restock(self):
        antes = [self._prod(1, 100.0, stock=0)]
        ahora = [self._prod(1, 100.0, stock=5)]
        res = self.fn({}, {}, ahora, antes)
        self.assertEqual(len(res["restock"]), 1)
        self.assertEqual(res["restock"][0]["id"], 1)

    def test_no_restock_si_siempre_habia_stock(self):
        antes = [self._prod(1, 100.0, stock=3)]
        ahora = [self._prod(1, 100.0, stock=10)]
        res = self.fn({}, {}, ahora, antes)
        self.assertEqual(res["restock"], [])

    def test_detecta_cambio_tasa(self):
        conf_ant = {"tasaMN": 300.0}
        conf_act = {"tasaMN": 320.0}
        res = self.fn(conf_act, conf_ant, [], [])
        self.assertIsNotNone(res["tasa"])
        self.assertEqual(res["tasa"], (320.0, 300.0))

    def test_no_tasa_si_cambio_menor_1_centavo(self):
        res = self.fn({"tasaMN": 300.005}, {"tasaMN": 300.0}, [], [])
        self.assertIsNone(res["tasa"])

    def test_sin_anterior_no_hay_rebajas(self):
        ahora = [self._prod(1, 50.0)]
        res = self.fn({}, {}, ahora, None)
        self.assertEqual(res["rebajas"], [])

    def test_todo_sin_cambios(self):
        prods = [self._prod(1, 100.0), self._prod(2, 50.0)]
        res = self.fn({"tasaMN": 300.0}, {"tasaMN": 300.0}, prods, prods)
        self.assertEqual(res["tasa"], None)
        self.assertEqual(res["nuevos"], [])
        self.assertEqual(res["rebajas"], [])
        self.assertEqual(res["restock"], [])

    def test_aumento_de_precio_no_es_rebaja(self):
        antes = [self._prod(1, 80.0)]
        ahora = [self._prod(1, 100.0)]
        res = self.fn({}, {}, ahora, antes)
        self.assertEqual(res["rebajas"], [])


# ═══════════════════════════════════════════════════════════════
# Ejecutar directamente sin pytest
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    unittest.main(verbosity=2)
