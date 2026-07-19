"""
Tests para scripts/build_vendidos.py — agrega /ventas de Firebase a
vendidos.json (unidades reales vendidas por producto, para el badge
"🔥 N vendidos" en las tarjetas, en vez del flag manual "masVendido").
Corre sin red real: mockea _fetch_json y _database_url.
"""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_vendidos as bv  # noqa: E402


class AgregacionVentasTest(unittest.TestCase):
    def setUp(self):
        self.tmp_out = ROOT / "tests" / "_tmp_vendidos.json"
        self._orig_out = bv.OUT_PATH
        bv.OUT_PATH = self.tmp_out

    def tearDown(self):
        bv.OUT_PATH = self._orig_out
        self.tmp_out.unlink(missing_ok=True)
        Path(str(self.tmp_out) + ".tmp").unlink(missing_ok=True)

    def _run(self, ventas):
        with patch.object(bv, "_database_url", return_value="https://x-default-rtdb.firebaseio.com"), \
             patch.object(bv, "_fetch_json", return_value=ventas):
            rc = bv.main()
        return rc

    def test_suma_cantidades_por_productoId(self):
        rc = self._run({
            "v1": {"productoId": 100, "cantidad": 2, "producto": "A", "precio": 10, "total": 20, "fecha": "x"},
            "v2": {"productoId": 100, "cantidad": 3, "producto": "A", "precio": 10, "total": 30, "fecha": "x"},
            "v3": {"productoId": 200, "cantidad": 1, "producto": "B", "precio": 5, "total": 5, "fecha": "x"},
        })
        self.assertEqual(rc, 0)
        out = json.loads(self.tmp_out.read_text(encoding="utf-8"))
        self.assertEqual(out["por_producto"]["100"], 5)
        self.assertEqual(out["por_producto"]["200"], 1)

    def test_venta_sin_cantidad_cuenta_como_1(self):
        rc = self._run({
            "v1": {"productoId": 7, "producto": "C", "precio": 1, "total": 1, "fecha": "x"},
        })
        self.assertEqual(rc, 0)
        out = json.loads(self.tmp_out.read_text(encoding="utf-8"))
        self.assertEqual(out["por_producto"]["7"], 1)

    def test_venta_sin_productoId_se_ignora(self):
        rc = self._run({
            "v1": {"producto": "Migrada sin id", "precio": 1, "cantidad": 1, "total": 1, "fecha": "x"},
        })
        self.assertEqual(rc, 0)
        out = json.loads(self.tmp_out.read_text(encoding="utf-8"))
        self.assertEqual(out["por_producto"], {})

    def test_cantidad_negativa_se_ignora(self):
        rc = self._run({
            "v1": {"productoId": 5, "cantidad": -3, "producto": "D", "precio": 1, "total": 1, "fecha": "x"},
        })
        self.assertEqual(rc, 0)
        out = json.loads(self.tmp_out.read_text(encoding="utf-8"))
        self.assertEqual(out["por_producto"], {})

    def test_sin_ventas_escribe_diccionario_vacio(self):
        rc = self._run({})
        self.assertEqual(rc, 0)
        out = json.loads(self.tmp_out.read_text(encoding="utf-8"))
        self.assertEqual(out["por_producto"], {})

    def test_fetch_fallido_retorna_error(self):
        with patch.object(bv, "_database_url", return_value="https://x-default-rtdb.firebaseio.com"), \
             patch.object(bv, "_fetch_json", return_value=None):
            rc = bv.main()
        self.assertEqual(rc, 1)

    def test_sin_database_url_retorna_error(self):
        with patch.object(bv, "_database_url", return_value=None):
            rc = bv.main()
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
