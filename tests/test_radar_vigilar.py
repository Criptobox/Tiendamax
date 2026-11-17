"""📡 Radar: qué se vigila lo elige el panel (radar-vigilar.json).

Antes era un radar:true dentro de productos.json que ningún botón del panel
ponía: los cinco marcados se agotaron y la pantalla quedó vacía, sin forma de
elegir otros. El panel y el script tienen que hablar del mismo archivo.
"""
import json, os, sys, tempfile, unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
import precio_radar as pr  # noqa: E402


class IdsVigilarTest(unittest.TestCase):
    PRODS = [{"id": 1, "radar": True}, {"id": 2}, {"id": 3}]

    def test_manda_el_archivo_del_panel(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "radar-vigilar.json")
            json.dump({"ids": [2, "3"]}, open(ruta, "w"))
            self.assertEqual({"2", "3"}, pr.ids_vigilar(self.PRODS, ruta))

    def test_lista_vacia_es_no_vigilar_nada(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "radar-vigilar.json")
            json.dump({"ids": []}, open(ruta, "w"))
            self.assertEqual(set(), pr.ids_vigilar(self.PRODS, ruta))

    def test_sin_archivo_sigue_el_radar_true_de_antes(self):
        self.assertEqual({"1"}, pr.ids_vigilar(self.PRODS, "/no/existe.json"))


class MismoModeloTest(unittest.TestCase):
    """El radar enseñaba el cargador de 20A como competencia del de 30A: con
    «cargador» + «baterías» en común bastaba. La cifra es el producto."""
    def test_otra_cifra_de_la_misma_unidad_no_es_el_mismo(self):
        n = "VEVOR Cargador de Batería Inteligente 30A"
        self.assertFalse(pr.mismo_modelo(n, "Cargador de baterías 20A 12v"))
        self.assertFalse(pr.mismo_modelo(n, "cargador 35 amperios vevor"))
        self.assertTrue(pr.mismo_modelo(n, "Cargador VEVOR 30 amperios"))
        self.assertFalse(pr.mismo_modelo("Inversor Tataliken 4000W", "inversor 3500w"))
        self.assertFalse(pr.mismo_modelo("Switch Gigabit de 8 Puertos", "switch 5 puertos"))
        self.assertFalse(pr.mismo_modelo("Batería Automotriz Lubrim 12V 60Ah", "bateria 12v 75ah"))

    def test_amperios_hora_no_son_amperios(self):
        self.assertEqual({"ah": {"60"}, "v": {"12"}}, pr._cifras_texto("bateria 60 amperios hora 12 voltios"))

    def test_otro_modelo_no_es_el_mismo(self):
        self.assertFalse(pr.mismo_modelo("NanoStation M5 Loco", "Nanostation loco m2"))
        self.assertTrue(pr.mismo_modelo("NanoStation M5 Loco", "nanostation m5 loco"))

    def test_sin_cifra_en_el_anuncio_no_se_descarta_por_eso(self):
        self.assertTrue(pr.mismo_modelo("VEVOR Cargador 30A", "Cargador VEVOR inteligente"))

    def test_varias_cifras_del_producto_valen_todas(self):
        n = "Cargador LVYUAN BC-400 PRO (12V/24V - 40A)"
        self.assertTrue(pr.mismo_modelo(n, "cargador 24v 40 amp"))
        self.assertFalse(pr.mismo_modelo(n, "cargador 12v 20a"))


class BuscarTest(unittest.TestCase):
    def setUp(self):
        self.pedidas = []
        def falso(q, rate):
            self.pedidas.append(q)
            return [{"titulo": "Cargador vevor 30A nuevo", "precio": 90, "url": "u1"},
                    {"titulo": "Cargador vevor 20A", "precio": 40, "url": "u2"},
                    {"titulo": "Cargador vevor 30 amperios", "precio": 95, "url": "u3"}]
        self._antes = (pr.SCRAPERS, pr.FUENTES, pr.PAUSA)
        pr.SCRAPERS, pr.FUENTES, pr.PAUSA = {"x": falso}, ["x"], 0

    def tearDown(self):
        pr.SCRAPERS, pr.FUENTES, pr.PAUSA = self._antes

    def test_terminos_excluidos_y_otra_cifra(self):
        m, desc = pr.buscar({"nombre": "VEVOR Cargador de Batería Inteligente 30A"}, 400,
                            "cargador vevor 30a", ["u3"])
        self.assertEqual(["cargador vevor 30a"], self.pedidas)
        self.assertEqual(["u1"], [x["url"] for x in m])
        self.assertEqual(1, desc)


class PanelTest(unittest.TestCase):
    def test_panel_y_script_usan_el_mismo_archivo_y_workflow(self):
        html = open(os.path.join(RAIZ, "admin.html"), encoding="utf-8").read()
        self.assertIn("RADAR_ARCHIVO = 'radar-vigilar.json'", html)
        self.assertIn("RADAR_WORKFLOW = 'precio-radar.yml'", html)
        self.assertTrue(os.path.exists(os.path.join(RAIZ, ".github/workflows/precio-radar.yml")))
        self.assertTrue(pr.VIGILAR.endswith("radar-vigilar.json"))
        self.assertIn("terminos:term, excluir:excl", html)
        for f in ("radarToggle", "radarGuardar", "radarPintarElegir", "radarNoEs",
                  "radarDeshacer", "radarTermEditar", "radarTermGuardar"):
            self.assertIn("window." + f + "=" + f, html)


if __name__ == "__main__":
    unittest.main()
