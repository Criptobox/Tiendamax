"""
Tests para scripts/revertir_ofertas.py — el bot que corre cada 30 min y
restaura el precio original cuando vence una oferta con fecha de fin.

Corre sin red: solo lee/escribe un productos.json temporal (nunca el real).
"""
import importlib
import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import revertir_ofertas  # noqa: E402


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class RevertirOfertasTest(unittest.TestCase):
    def setUp(self):
        # Aislar SRC a un archivo temporal por test; nunca tocar productos.json real.
        self.tmp = ROOT / f".test_productos_{id(self)}.json"
        self._orig_src = revertir_ofertas.SRC
        revertir_ofertas.SRC = str(self.tmp)
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        revertir_ofertas.SRC = self._orig_src
        if self.tmp.exists():
            self.tmp.unlink()

    def _write(self, productos):
        self.tmp.write_text(json.dumps(productos), encoding="utf-8")

    def _read(self):
        return json.loads(self.tmp.read_text(encoding="utf-8"))

    def test_oferta_vencida_se_revierte(self):
        vencida = _iso(datetime.now(timezone.utc) - timedelta(hours=1))
        self._write([
            {"id": 1, "nombre": "Router X", "precioActual": 80, "precioOriginal": 130,
             "ofertaFin": vencida, "descuento": 38},
        ])
        revertir_ofertas.main()
        p = self._read()[0]
        self.assertEqual(p["precioActual"], 130)
        self.assertNotIn("precioOriginal", p)
        self.assertNotIn("ofertaFin", p)
        self.assertEqual(p["descuento"], 0)

    def test_oferta_futura_no_se_toca(self):
        futura = _iso(datetime.now(timezone.utc) + timedelta(hours=1))
        original = {"id": 2, "nombre": "Batería Y", "precioActual": 90, "precioOriginal": 130,
                    "ofertaFin": futura, "descuento": 31}
        self._write([dict(original)])
        revertir_ofertas.main()
        self.assertEqual(self._read()[0], original)

    def test_producto_sin_oferta_no_se_toca(self):
        original = {"id": 3, "nombre": "Cargador Z", "precioActual": 25}
        self._write([dict(original)])
        revertir_ofertas.main()
        self.assertEqual(self._read()[0], original)

    def test_fecha_malformada_se_ignora_sin_romper(self):
        original = {"id": 4, "nombre": "Malo", "precioActual": 10, "ofertaFin": "no-es-una-fecha"}
        self._write([dict(original)])
        # No debe lanzar excepción; el producto queda intacto.
        revertir_ofertas.main()
        self.assertEqual(self._read()[0], original)

    def test_sin_precio_original_solo_limpia_flags(self):
        vencida = _iso(datetime.now(timezone.utc) - timedelta(minutes=5))
        self._write([
            {"id": 5, "nombre": "Sin original", "precioActual": 50, "ofertaFin": vencida, "descuento": 20},
        ])
        revertir_ofertas.main()
        p = self._read()[0]
        # Sin precioOriginal > 0 no se puede restaurar el precio: se mantiene el actual.
        self.assertEqual(p["precioActual"], 50)
        self.assertEqual(p["descuento"], 0)
        self.assertNotIn("ofertaFin", p)

    def test_formato_objeto_con_clave_productos(self):
        vencida = _iso(datetime.now(timezone.utc) - timedelta(hours=2))
        self._write({"productos": [
            {"id": 6, "nombre": "Formato dict", "precioActual": 40, "precioOriginal": 60,
             "ofertaFin": vencida, "descuento": 33},
        ]})
        revertir_ofertas.main()
        p = self._read()["productos"][0]
        self.assertEqual(p["precioActual"], 60)

    def test_mezcla_vencidas_y_vigentes_en_el_mismo_catalogo(self):
        vencida = _iso(datetime.now(timezone.utc) - timedelta(hours=1))
        futura = _iso(datetime.now(timezone.utc) + timedelta(hours=1))
        self._write([
            {"id": 7, "nombre": "A", "precioActual": 70, "precioOriginal": 100, "ofertaFin": vencida, "descuento": 30},
            {"id": 8, "nombre": "B", "precioActual": 45, "precioOriginal": 60, "ofertaFin": futura, "descuento": 25},
            {"id": 9, "nombre": "C", "precioActual": 15},
        ])
        revertir_ofertas.main()
        a, b, c = self._read()
        self.assertEqual(a["precioActual"], 100)
        self.assertNotIn("ofertaFin", a)
        self.assertEqual(b["precioActual"], 45)  # sin tocar
        self.assertIn("ofertaFin", b)
        self.assertEqual(c["precioActual"], 15)  # sin tocar


if __name__ == "__main__":
    unittest.main()
