"""
Tests para scripts/update_rate_from_eltoque.py — el bot que actualiza la
tasa MN cada 30 min. Corre sin red real: mockea fetch_eltoque_rate() y
load_config()/save_config() para no tocar config.json ni llamar a elTOQUE.

Cubre el fallback agregado en esta sesión: si TODAS las fuentes (API/web/
Wayback) fallan pero ya hay una tasa previa, el script mantiene la última
tasa conocida y sale en verde (exit 0) en vez de romper el workflow.
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import update_rate_from_eltoque as upd  # noqa: E402


class FallbackConTasaPreviaTest(unittest.TestCase):
    def test_mantiene_ultima_tasa_y_sale_en_verde(self):
        with patch.object(upd, "fetch_eltoque_rate", side_effect=upd.RateUpdateError("todas las fuentes fallaron")), \
             patch.object(upd, "load_config", return_value={"tasaMN": 442.0, "margenMN": 10}), \
             patch.object(upd, "save_config") as mock_save:
            rc = upd.main()
        self.assertEqual(rc, 0)
        mock_save.assert_not_called()

    def test_sin_tasa_previa_falla(self):
        with patch.object(upd, "fetch_eltoque_rate", side_effect=upd.RateUpdateError("todas las fuentes fallaron")), \
             patch.object(upd, "load_config", return_value={}), \
             patch.object(upd, "save_config") as mock_save:
            rc = upd.main()
        self.assertEqual(rc, 1)
        mock_save.assert_not_called()


class ActualizacionExitosaTest(unittest.TestCase):
    def test_tasa_nueva_se_guarda(self):
        saved = {}
        with patch.object(upd, "fetch_eltoque_rate", return_value=(450.0, "2026-07-11", "elTOQUE API")), \
             patch.object(upd, "load_config", return_value={"tasaMN": 442.0, "margenMN": 10}), \
             patch.object(upd, "save_config", side_effect=lambda c: saved.update(c)):
            rc = upd.main()
        self.assertEqual(rc, 0)
        self.assertEqual(saved["tasaMN"], 450.0)
        self.assertEqual(saved["tasaMNAnterior"], 442.0)
        self.assertEqual(saved["tasaFuente"], "elTOQUE API")

    def test_tasa_sin_cambio_visible_no_reescribe(self):
        with patch.object(upd, "fetch_eltoque_rate", return_value=(442.4, "2026-07-11", "elTOQUE API")), \
             patch.object(upd, "load_config", return_value={"tasaMN": 442.0, "margenMN": 10}), \
             patch.object(upd, "save_config") as mock_save:
            rc = upd.main()
        # round(442.0) == round(442.4) -> no dispara escritura/notificación por oscilación decimal.
        self.assertEqual(rc, 0)
        mock_save.assert_not_called()

    def test_primera_escritura_sin_tasa_previa(self):
        saved = {}
        with patch.object(upd, "fetch_eltoque_rate", return_value=(500.0, "2026-07-11", "elTOQUE Web")), \
             patch.object(upd, "load_config", return_value={}), \
             patch.object(upd, "save_config", side_effect=lambda c: saved.update(c)):
            rc = upd.main()
        self.assertEqual(rc, 0)
        self.assertEqual(saved["tasaMN"], 500.0)
        self.assertNotIn("tasaMNAnterior", saved)


class ExtraccionRateTest(unittest.TestCase):
    """La función que interpreta las distintas formas en que la API puede
    devolver el precio USD — probada directo, sin red."""

    def test_estructura_directa(self):
        self.assertEqual(upd._extract_usd_rate({"USD": 442}), 442)

    def test_estructura_con_median(self):
        self.assertEqual(upd._extract_usd_rate({"USD": {"median": 450}}), 450)

    def test_estructura_anidada_tasas(self):
        self.assertEqual(upd._extract_usd_rate({"tasas": {"USD": 460}}), 460)

    def test_lista_de_filas(self):
        self.assertEqual(upd._extract_usd_rate([{"currency": "USD", "rate": 470}]), 470)

    def test_valor_fuera_de_rango_se_descarta(self):
        # MIN_TASA=100, MAX_TASA=2000 — un valor absurdo no debe aceptarse.
        self.assertIsNone(upd._extract_usd_rate({"USD": 5}))

    def test_sin_usd_reconocible(self):
        self.assertIsNone(upd._extract_usd_rate({"EUR": 100}))


if __name__ == "__main__":
    unittest.main()
