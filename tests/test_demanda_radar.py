"""
Tests para scripts/demanda_radar.py — el radar que busca clientes que ponen
"compro/busco X" en Revolico/Porlalivre y avisa por Telegram.

Corre sin red: solo funciones puras (detección de comprador, dedup por link,
poda por antigüedad, armado de consultas y del mensaje). La parte de scraping
y Telegram no se toca.
"""
import datetime
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import demanda_radar as dr  # noqa: E402


class EsBusquedaTest(unittest.TestCase):
    def test_detecta_comprador(self):
        for t in [
            "Compro router wifi doble banda",
            "Busco cargador de baterías 20A",
            "Necesito inversor solar 5000w",
            "Se busca cámara de seguridad",
            "Pago por audífonos inalámbricos",
            "Alguien vende batería LiFePO4?",
            "NESECITO un switch de 8 puertos",  # typo común
        ]:
            self.assertTrue(dr.es_busqueda(t), t)

    def test_ignora_vendedor(self):
        for t in [
            "Vendo router wifi Wavlink nuevo",
            "Router TP-Link AC1200 en caja",
            "Inversor solar Powmr 5000w disponible",
            "Cámara de seguridad wifi 360 barata",
        ]:
            self.assertFalse(dr.es_busqueda(t), t)


class FiltrarNuevosTest(unittest.TestCase):
    def test_omite_ya_vistos_y_duplicados_de_la_corrida(self):
        vistos = {"https://x.com/1": "2026-07-20"}
        matches = [
            {"url": "https://x.com/1", "producto": "A"},  # ya visto
            {"url": "https://x.com/2", "producto": "B"},  # nuevo
            {"url": "https://x.com/2", "producto": "B"},  # duplicado en la corrida
            {"url": "https://x.com/3", "producto": "C"},  # nuevo
        ]
        nuevos = dr.filtrar_nuevos(matches, vistos)
        self.assertEqual([m["url"] for m in nuevos], ["https://x.com/2", "https://x.com/3"])


class PodarVistosTest(unittest.TestCase):
    def test_borra_los_viejos_conserva_recientes(self):
        hoy = datetime.date(2026, 7, 20)
        vistos = {
            "u_reciente": "2026-07-19",
            "u_limite": (hoy - datetime.timedelta(days=dr.SEEN_DIAS)).isoformat(),
            "u_viejo": (hoy - datetime.timedelta(days=dr.SEEN_DIAS + 1)).isoformat(),
        }
        out = dr.podar_vistos(vistos, hoy)
        self.assertIn("u_reciente", out)
        self.assertIn("u_limite", out)      # exactamente en el límite: se conserva
        self.assertNotIn("u_viejo", out)

    def test_fecha_ilegible_no_se_borra(self):
        hoy = datetime.date(2026, 7, 20)
        out = dr.podar_vistos({"u": "basura"}, hoy)
        self.assertIn("u", out)


class ConstruirConsultasTest(unittest.TestCase):
    def _prod(self, i, stock=5, nombre=None, **kw):
        p = {"id": 1000 + i, "nombre": nombre or f"Router Modelo{i} AC1200",
             "stock": stock, "categoria": "WIFI"}
        p.update(kw)
        return p

    def test_solo_en_stock(self):
        prods = [self._prod(1, stock=0), self._prod(2, stock=3), self._prod(3, activo=False)]
        consultas = dr.construir_consultas(prods)
        nombres = [p.get("nombre") for _, p, _ in consultas]
        self.assertEqual(nombres, ["Router Modelo2 AC1200"])

    def test_deduplica_queries_iguales(self):
        # dos productos con el mismo nombre → una sola consulta
        prods = [self._prod(1, nombre="Cargador 20A"), self._prod(2, nombre="Cargador 20A")]
        consultas = dr.construir_consultas(prods)
        self.assertEqual(len(consultas), 1)

    def test_respeta_tope(self):
        prods = [self._prod(i, nombre=f"Producto Unico Numero {i}") for i in range(dr.MAX_QUERIES + 10)]
        consultas = dr.construir_consultas(prods)
        self.assertLessEqual(len(consultas), dr.MAX_QUERIES)


class BuscarDemandaTest(unittest.TestCase):
    def test_excluye_vendedores_aunque_el_scraper_los_devuelva(self):
        # scraper "sucio" que devuelve un comprador Y un vendedor
        def scraper_sucio(q):
            return [
                {"fuente": "revolico", "titulo": "Compro router tenda ac1200", "url": "u1", "dias": 1},
                {"fuente": "revolico", "titulo": "Vendo router tenda ac1200 nuevo", "url": "u2", "dias": 0},
            ]
        orig = dr.SCRAPERS
        dr.SCRAPERS = [scraper_sucio]
        dr.PAUSA = 0
        try:
            prod = {"id": 1, "nombre": "Router Tenda AC1200", "stock": 5}
            consultas = [("router tenda ac1200", prod, dr.keywords(prod["nombre"]))]
            matches = dr.buscar_demanda(consultas)
        finally:
            dr.SCRAPERS = orig
        urls = [m["url"] for m in matches]
        self.assertIn("u1", urls)        # el comprador sí
        self.assertNotIn("u2", urls)     # el vendedor NO

    def test_descarta_anuncios_muy_viejos(self):
        def scraper(q):
            return [{"fuente": "revolico", "titulo": "compro router tenda ac1200", "url": "u1",
                     "dias": dr.MAX_DIAS + 5}]
        orig = dr.SCRAPERS
        dr.SCRAPERS = [scraper]
        dr.PAUSA = 0
        try:
            prod = {"id": 1, "nombre": "Router Tenda AC1200", "stock": 5}
            matches = dr.buscar_demanda([("router tenda ac1200", prod, dr.keywords(prod["nombre"]))])
        finally:
            dr.SCRAPERS = orig
        self.assertEqual(matches, [])


class ArmarMensajeTest(unittest.TestCase):
    def _m(self, i):
        return {"producto": f"Producto {i}", "stock": i, "fuente": "revolico",
                "titulo": f"compro producto {i}", "url": f"https://revolico.com/item/{i}"}

    def test_incluye_producto_titulo_y_link(self):
        msg = dr.armar_mensaje([self._m(1)])
        self.assertIn("Producto 1", msg)
        self.assertIn("compro producto 1", msg)
        self.assertIn("https://revolico.com/item/1", msg)
        self.assertIn("tienes 1", msg)

    def test_resume_cuando_hay_muchos(self):
        muchos = [self._m(i) for i in range(dr.MAX_AVISOS + 5)]
        msg = dr.armar_mensaje(muchos)
        self.assertIn(f"({len(muchos)})", msg)          # total en el encabezado
        self.assertIn(f"y {5} más", msg)                # resumen del sobrante


class CategoriaFilterTest(unittest.TestCase):
    """El admin pidió empezar solo con WiFi y Energía. El filtro se controla
    con DEMANDA_CATEGORIAS (default WIFI,ENERGIA)."""

    def setUp(self):
        self._orig = os.environ.get("DEMANDA_CATEGORIAS")

    def tearDown(self):
        if self._orig is None:
            os.environ.pop("DEMANDA_CATEGORIAS", None)
        else:
            os.environ["DEMANDA_CATEGORIAS"] = self._orig

    def _prods(self):
        return [
            {"id": 1, "nombre": "Router WiFi AC1200", "stock": 5, "categoria": "WIFI"},
            {"id": 2, "nombre": "Inversor Solar 5000w", "stock": 3, "categoria": "ENERGIA"},
            {"id": 3, "nombre": "Camara Seguridad 360", "stock": 2, "categoria": "SEGURIDAD"},
            {"id": 4, "nombre": "Audifonos Bluetooth", "stock": 4, "categoria": "CELULARES"},
        ]

    def test_default_wifi_y_energia(self):
        os.environ.pop("DEMANDA_CATEGORIAS", None)
        cats = {p["categoria"] for p in dr._productos_en_stock(self._prods())}
        self.assertEqual(cats, {"WIFI", "ENERGIA"})

    def test_override_por_env(self):
        os.environ["DEMANDA_CATEGORIAS"] = "SEGURIDAD"
        cats = {p["categoria"] for p in dr._productos_en_stock(self._prods())}
        self.assertEqual(cats, {"SEGURIDAD"})

    def test_vacio_es_todas(self):
        os.environ["DEMANDA_CATEGORIAS"] = ""
        cats = {p["categoria"] for p in dr._productos_en_stock(self._prods())}
        self.assertEqual(cats, {"WIFI", "ENERGIA", "SEGURIDAD", "CELULARES"})

    def test_ignora_acentos_y_mayusculas(self):
        os.environ["DEMANDA_CATEGORIAS"] = "energía"  # minúscula + acento
        prods = [{"id": 1, "nombre": "Inversor", "stock": 1, "categoria": "ENERGIA"}]
        cats = {p["categoria"] for p in dr._productos_en_stock(prods)}
        self.assertEqual(cats, {"ENERGIA"})


class MainEstadoTest(unittest.TestCase):
    """Corre cada 15 min: el estado solo debe reescribirse cuando hay un aviso
    nuevo real, para no generar un commit de puro timestamp en cada corrida."""

    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".json")
        self._orig_out = dr.OUT
        self._orig_scr = dr.SCRAPERS
        self._orig_load = dr.load_json
        self._orig_pausa = dr.PAUSA
        self._orig_tel = dr.enviar_telegram
        dr.OUT = self.tmp
        dr.PAUSA = 0
        # Sin filtro de categoría para este test (probamos el flujo del estado,
        # no el filtro); así el producto sin 'categoria' no queda descartado.
        self._orig_cat = os.environ.get("DEMANDA_CATEGORIAS")
        os.environ["DEMANDA_CATEGORIAS"] = ""
        self.productos = [{"id": 1, "nombre": "Router Tenda AC1200 Doble Banda", "stock": 5}]
        dr.load_json = lambda path, default=None: (
            self.productos if str(path).endswith("productos.json")
            else self._orig_load(path, default)
        )
        self.sent = []
        dr.enviar_telegram = lambda t: self.sent.append(t)
        os.environ.pop("BOT_TOKEN", None)
        os.environ.pop("ADMIN_CHAT_ID", None)

    def tearDown(self):
        if self._orig_cat is None:
            os.environ.pop("DEMANDA_CATEGORIAS", None)
        else:
            os.environ["DEMANDA_CATEGORIAS"] = self._orig_cat
        dr.OUT = self._orig_out
        dr.SCRAPERS = self._orig_scr
        dr.load_json = self._orig_load
        dr.PAUSA = self._orig_pausa
        dr.enviar_telegram = self._orig_tel
        if os.path.exists(self.tmp):
            os.remove(self.tmp)

    def test_avisa_una_vez_y_no_reescribe_sin_novedad(self):
        dr.SCRAPERS = [lambda q: [
            {"fuente": "revolico", "titulo": "compro router tenda ac1200 doble banda",
             "url": "https://revolico.com/item/AAA", "dias": 1}
        ]]
        # Corrida 1: hay algo nuevo → avisa y escribe el estado.
        dr.main()
        self.assertEqual(len(self.sent), 1)
        self.assertTrue(os.path.exists(self.tmp))
        mtime1 = os.path.getmtime(self.tmp)

        # Corrida 2: mismo resultado, nada nuevo → NO avisa ni reescribe.
        self.sent.clear()
        import time
        time.sleep(0.02)
        dr.main()
        self.assertEqual(len(self.sent), 0)
        self.assertEqual(os.path.getmtime(self.tmp), mtime1)  # archivo intacto

    def test_sin_stock_no_crea_estado(self):
        self.productos = [{"id": 1, "nombre": "X", "stock": 0}]
        dr.SCRAPERS = [lambda q: []]
        dr.main()
        # sin productos que vigilar: no toca el archivo (no existía → sigue sin existir)
        self.assertFalse(os.path.exists(self.tmp))


if __name__ == "__main__":
    unittest.main()
