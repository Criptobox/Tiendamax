"""
Tests para el resumen de Web Vitals de scripts/web_health_agent.py — lo que
alimenta el agente con las muestras que mandan los navegadores reales.

Corre sin red ni Firebase: se le pasa un doble de `db` que devuelve diccionarios
en memoria, igual que haría firebase_admin.db.
"""
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import web_health_agent as wha  # noqa: E402

UTC = ZoneInfo("UTC")


class _RefFalsa:
    """Imita firebase_admin.db.reference() lo justo para estos tests."""

    def __init__(self, store, path):
        self._store = store
        self._path = path

    def get(self, shallow=False):
        val = self._store.get(self._path)
        if shallow and isinstance(val, dict):
            return {k: True for k in val}
        return val

    def child(self, key):
        return _RefFalsa(self._store, f"{self._path}/{key}")

    def delete(self):
        self._store.pop(self._path, None)


class _DbFalsa:
    def __init__(self, store):
        self._store = store

    def reference(self, path):
        return _RefFalsa(self._store, path)


def _dia(offset=0):
    return (datetime.now(tz=UTC) - timedelta(days=offset)).strftime("%Y-%m-%d")


def _muestras(n, lcp=2000, cls=0.05, inp=100, ttfb=400):
    return {f"k{i}": {"lcp": lcp, "cls": cls, "inp": inp, "ttfb": ttfb, "ts": 1} for i in range(n)}


class P75Test(unittest.TestCase):
    def test_lista_vacia_no_revienta(self):
        self.assertEqual(wha._p75([]), 0.0)

    def test_toma_la_cola_lenta_no_el_promedio(self):
        # 3 rápidas y 1 lentísima: el promedio la disimularía, el p75 no.
        self.assertEqual(wha._p75([100, 100, 100, 8000]), 8000)

    def test_valor_unico(self):
        self.assertEqual(wha._p75([1234]), 1234)


class RevisarWebVitalsTest(unittest.TestCase):
    def test_sin_db_no_reporta(self):
        res, resumen = wha.revisar_web_vitals(None)
        self.assertIsNone(res)
        self.assertEqual(resumen, {})

    def test_pocas_muestras_no_se_evalua(self):
        db = _DbFalsa({f"web_vitals/{_dia()}": _muestras(3)})
        res, resumen = wha.revisar_web_vitals(db)
        self.assertEqual(res.level, "ok")
        self.assertIn("pocas", res.detail)
        self.assertEqual(resumen["muestras"], 3)

    def test_metricas_sanas_dan_ok(self):
        db = _DbFalsa({f"web_vitals/{_dia()}": _muestras(20, lcp=2200)})
        res, resumen = wha.revisar_web_vitals(db)
        self.assertEqual(res.level, "ok")
        self.assertEqual(resumen["lcp_p75"], 2200)
        self.assertEqual(resumen["muestras"], 20)

    def test_lcp_malo_avisa(self):
        db = _DbFalsa({f"web_vitals/{_dia()}": _muestras(20, lcp=9000)})
        res, resumen = wha.revisar_web_vitals(db)
        self.assertEqual(res.level, "warn")
        self.assertIn("LCP", res.detail)
        self.assertEqual(resumen["lcp_p75"], 9000)

    def test_cls_malo_avisa(self):
        db = _DbFalsa({f"web_vitals/{_dia()}": _muestras(20, cls=0.8)})
        res, _ = wha.revisar_web_vitals(db)
        self.assertEqual(res.level, "warn")
        self.assertIn("CLS", res.detail)

    def test_detalle_estable_entre_corridas_parecidas(self):
        # El detalle entra en la firma anti-spam: si cambiara con cada variación
        # mínima, Telegram sonaría cada media hora por el mismo problema.
        a, _ = wha.revisar_web_vitals(_DbFalsa({f"web_vitals/{_dia()}": _muestras(20, lcp=9000)}))
        b, _ = wha.revisar_web_vitals(_DbFalsa({f"web_vitals/{_dia()}": _muestras(20, lcp=9180)}))
        self.assertEqual(a.detail, b.detail)

    def test_junta_varios_dias(self):
        db = _DbFalsa({
            f"web_vitals/{_dia(0)}": _muestras(5),
            f"web_vitals/{_dia(1)}": _muestras(5),
            f"web_vitals/{_dia(2)}": _muestras(5),
        })
        _, resumen = wha.revisar_web_vitals(db)
        self.assertEqual(resumen["muestras"], 15)

    def test_ignora_dias_fuera_de_la_ventana(self):
        db = _DbFalsa({
            f"web_vitals/{_dia(0)}": _muestras(10),
            f"web_vitals/{_dia(9)}": _muestras(50),
        })
        _, resumen = wha.revisar_web_vitals(db)
        self.assertEqual(resumen["muestras"], 10)

    def test_muestras_corruptas_no_rompen(self):
        bucket = _muestras(10)
        bucket["basura1"] = "no soy un dict"
        bucket["basura2"] = {"lcp": "texto", "cls": None, "ts": 1}
        db = _DbFalsa({f"web_vitals/{_dia()}": bucket})
        res, resumen = wha.revisar_web_vitals(db)
        self.assertEqual(res.level, "ok")
        self.assertEqual(resumen["muestras"], 11)  # el dict corrupto sí cuenta como entrada
        self.assertEqual(resumen["lcp_p75"], 2000)  # pero su lcp no contamina el p75


class ContratoClienteReglasTest(unittest.TestCase):
    """El guard general (test_llamadas_vs_reglas) no ve esta ruta: el cliente
    arma la URL en una variable y encima usa sendBeacon, que no es un fetch.
    Sin esto, endurecer la regla dejaría al snippet escribiendo contra un 403
    silencioso — que es exactamente el modo de fallo de este repo."""

    @classmethod
    def setUpClass(cls):
        import json
        cls.snippet = (ROOT / "js" / "web-vitals-snippet.js").read_text(encoding="utf-8")
        cls.reglas = json.loads((ROOT / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]

    def test_la_ruta_del_cliente_existe_en_las_reglas(self):
        self.assertIn("/web_vitals/", self.snippet)
        self.assertIn("web_vitals", self.reglas)

    def test_la_regla_es_de_solo_alta(self):
        # Append-only: sin esto cualquiera podría reescribir muestras ajenas.
        muestra = self.reglas["web_vitals"]["$dia"]["$muestraId"]
        self.assertEqual(muestra[".write"], "!data.exists()")

    def test_los_campos_que_manda_el_cliente_estan_validados(self):
        muestra = self.reglas["web_vitals"]["$dia"]["$muestraId"]
        for campo in ("lcp", "cls", "inp", "ttfb", "ts", "conn"):
            self.assertIn(campo, muestra, f"la regla no valida '{campo}'")

    def test_no_se_aceptan_campos_extra(self):
        muestra = self.reglas["web_vitals"]["$dia"]["$muestraId"]
        self.assertIn("$otro", muestra)
        self.assertIs(muestra["$otro"][".validate"], False)

    def test_el_cliente_no_reporta_si_es_el_admin(self):
        # Las visitas de prueba del admin falsearían el p75.
        self.assertIn("githubToken", self.snippet)

    def test_el_cliente_muestrea(self):
        self.assertIn("MUESTREO", self.snippet)


class PodarWebVitalsTest(unittest.TestCase):
    def test_borra_viejos_y_conserva_recientes(self):
        viejo = (datetime.now(tz=UTC) - timedelta(days=wha.VITALS_RETENCION + 5)).strftime("%Y-%m-%d")
        store = {
            "web_vitals": {_dia(0): 1, _dia(1): 1, viejo: 1},
            f"web_vitals/{_dia(0)}": _muestras(2),
            f"web_vitals/{viejo}": _muestras(2),
        }
        wha.podar_web_vitals(_DbFalsa(store))
        self.assertIn(f"web_vitals/{_dia(0)}", store)
        self.assertNotIn(f"web_vitals/{viejo}", store)

    def test_sin_db_no_revienta(self):
        wha.podar_web_vitals(None)  # no debe lanzar


if __name__ == "__main__":
    unittest.main()
