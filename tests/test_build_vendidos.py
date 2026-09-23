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
import os
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_vendidos as bv  # noqa: E402


class AgregacionVentasTest(unittest.TestCase):
    def setUp(self):
        self.tmp_out = ROOT / "tests" / "_tmp_vendidos.json"
        self._orig_out = bv.OUT_PATH
        bv.OUT_PATH = self.tmp_out
        # Estos casos prueban el camino anónimo (mock de _fetch_json).
        self._sa = os.environ.pop("FIREBASE_SERVICE_ACCOUNT", None)

    def tearDown(self):
        if self._sa is not None:
            os.environ["FIREBASE_SERVICE_ACCOUNT"] = self._sa
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

    def test_sin_ventas_nuevas_no_reescribe_el_fichero(self):
        """`actualizado` cambia en cada pasada: si se comparaba el texto
        entero, cada 3 horas había commit y despliegue sin vender nada."""
        ventas = {"v1": {"productoId": 9, "cantidad": 2, "producto": "E",
                         "precio": 1, "total": 2, "fecha": "x"}}
        self._run(ventas)
        antes = self.tmp_out.read_text(encoding="utf-8")
        self._run(ventas)
        self.assertEqual(self.tmp_out.read_text(encoding="utf-8"), antes)


class VentasPrivadasTest(unittest.TestCase):
    """/ventas solo lo lee el dueño. Leído sin credenciales, Firebase contesta
    401 y vendidos.json se queda congelado (pasó durante semanas)."""

    def test_la_regla_de_ventas_sigue_cerrada(self):
        reglas = json.loads((ROOT / "firebase-rules.json").read_text(encoding="utf-8"))
        self.assertNotEqual(reglas["rules"]["ventas"][".read"], True)

    def test_el_workflow_le_pasa_la_cuenta_de_servicio(self):
        wf = (ROOT / ".github" / "workflows" / "build-vendidos.yml").read_text(encoding="utf-8")
        paso = wf[:wf.index("run: python scripts/build_vendidos.py")]
        paso = paso[paso.rindex("- name:"):]
        self.assertIn("FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}", paso)

    def test_con_cuenta_de_servicio_no_lee_anonimo(self):
        tmp = ROOT / "tests" / "_tmp_vendidos_sa.json"
        orig = bv.OUT_PATH
        bv.OUT_PATH = tmp
        try:
            with patch.dict(os.environ, {"FIREBASE_SERVICE_ACCOUNT": "{}"}), \
                 patch.object(bv, "_leer_ventas_admin",
                              return_value={"v": {"productoId": 3, "cantidad": 4}}), \
                 patch.object(bv, "_fetch_json", side_effect=AssertionError("lectura anónima")):
                self.assertEqual(bv.main(), 0)
            self.assertEqual(json.loads(tmp.read_text(encoding="utf-8"))["por_producto"], {"3": 4})
        finally:
            bv.OUT_PATH = orig
            tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
