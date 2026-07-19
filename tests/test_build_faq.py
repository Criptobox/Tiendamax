"""
Tests para scripts/build_faq.py — combina las 5 preguntas fijas de
TiendaMax con las preguntas reales aprendidas por el agente de ventas
(/agente/faq en Firebase), filtrando ruido conversacional.
Corre sin red real: mockea _fetch_json y _database_url donde aplica.
"""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_faq as bf  # noqa: E402


class BuildPreguntasTest(unittest.TestCase):
    def test_siempre_incluye_las_5_preguntas_fijas(self):
        preguntas = bf.build_preguntas(None)
        fijas = [p for p in preguntas if p["fuente"] == "fija"]
        self.assertEqual(len(fijas), 5)

    def test_incluye_pregunta_real_con_suficiente_repeticion_e_intent_valido(self):
        raw = {
            "cuanto_cuesta_el_envio": {
                "query": "cuanto cuesta el envio a santiago",
                "intent": "SHIPPING",
                "lastResponse": "El envío se coordina por WhatsApp según tu zona.",
                "count": 5,
                "lastUpdated": 1,
            }
        }
        preguntas = bf.build_preguntas(raw)
        reales = [p for p in preguntas if p["fuente"] == "real"]
        self.assertEqual(len(reales), 1)
        self.assertIn("envio", reales[0]["pregunta"].lower())
        self.assertTrue(reales[0]["pregunta"].startswith("¿"))
        self.assertTrue(reales[0]["pregunta"].endswith("?"))

    def test_ignora_pregunta_con_pocas_repeticiones(self):
        raw = {
            "algo_raro": {
                "query": "una consulta cualquiera larga",
                "intent": "SHIPPING",
                "lastResponse": "Respuesta.",
                "count": 1,
                "lastUpdated": 1,
            }
        }
        preguntas = bf.build_preguntas(raw)
        self.assertEqual(len([p for p in preguntas if p["fuente"] == "real"]), 0)

    def test_ignora_intent_que_no_es_pregunta_general(self):
        raw = {
            "hola": {
                "query": "hola buenas tardes",
                "intent": "GREETING",
                "lastResponse": "¡Hola! ¿En qué te ayudo?",
                "count": 50,
                "lastUpdated": 1,
            }
        }
        preguntas = bf.build_preguntas(raw)
        self.assertEqual(len([p for p in preguntas if p["fuente"] == "real"]), 0)

    def test_ignora_query_muy_corta(self):
        raw = {
            "x": {
                "query": "envio",
                "intent": "SHIPPING",
                "lastResponse": "Respuesta.",
                "count": 10,
                "lastUpdated": 1,
            }
        }
        preguntas = bf.build_preguntas(raw)
        self.assertEqual(len([p for p in preguntas if p["fuente"] == "real"]), 0)

    def test_no_duplica_pregunta_ya_cubierta_por_las_fijas(self):
        raw = {
            "x": {
                "query": "que metodos de pago aceptan",
                "intent": "PAYMENT",
                "lastResponse": "Pago contra entrega.",
                "count": 10,
                "lastUpdated": 1,
            }
        }
        preguntas = bf.build_preguntas(raw)
        self.assertEqual(len([p for p in preguntas if p["fuente"] == "real"]), 0)

    def test_ordena_aprendidas_por_count_descendente_y_limita(self):
        raw = {}
        for i in range(20):
            raw[f"q{i}"] = {
                "query": f"pregunta de prueba numero {i} bastante larga",
                "intent": "SHIPPING",
                "lastResponse": "Respuesta genérica.",
                "count": i + 3,
                "lastUpdated": 1,
            }
        preguntas = bf.build_preguntas(raw)
        reales = [p for p in preguntas if p["fuente"] == "real"]
        self.assertEqual(len(reales), bf.MAX_LEARNED)
        counts = [p["count"] for p in reales]
        self.assertEqual(counts, sorted(counts, reverse=True))

    def test_entrada_invalida_no_rompe(self):
        raw = {"x": "no es un dict", "y": {"intent": "SHIPPING"}}
        preguntas = bf.build_preguntas(raw)
        self.assertEqual(len([p for p in preguntas if p["fuente"] == "real"]), 0)


class MainIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.tmp_json = ROOT / "tests" / "_tmp_faq.json"
        self.tmp_html = ROOT / "tests" / "_tmp_faq.html"
        self._orig_json = bf.JSON_OUT
        self._orig_html = bf.HTML_OUT
        bf.JSON_OUT = self.tmp_json
        bf.HTML_OUT = self.tmp_html

    def tearDown(self):
        bf.JSON_OUT = self._orig_json
        bf.HTML_OUT = self._orig_html
        for p in (self.tmp_json, self.tmp_html):
            p.unlink(missing_ok=True)
            Path(str(p) + ".tmp").unlink(missing_ok=True)

    def test_main_escribe_json_y_html_con_las_fijas(self):
        with patch.object(bf, "_database_url", return_value="https://x-default-rtdb.firebaseio.com"), \
             patch.object(bf, "_fetch_json", return_value={}):
            rc = bf.main()
        self.assertEqual(rc, 0)
        out = json.loads(self.tmp_json.read_text(encoding="utf-8"))
        self.assertEqual(len(out["preguntas"]), 5)
        html = self.tmp_html.read_text(encoding="utf-8")
        self.assertIn("¿Cómo compro en TiendaMax?", html)
        self.assertIn("FAQPage", html)

    def test_main_sin_database_url_igual_escribe_las_fijas(self):
        with patch.object(bf, "_database_url", return_value=None):
            rc = bf.main()
        self.assertEqual(rc, 0)
        out = json.loads(self.tmp_json.read_text(encoding="utf-8"))
        self.assertEqual(len(out["preguntas"]), 5)


if __name__ == "__main__":
    unittest.main()
