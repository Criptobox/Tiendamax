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


class PanelTest(unittest.TestCase):
    def test_panel_y_script_usan_el_mismo_archivo_y_workflow(self):
        html = open(os.path.join(RAIZ, "admin.html"), encoding="utf-8").read()
        self.assertIn("RADAR_ARCHIVO = 'radar-vigilar.json'", html)
        self.assertIn("RADAR_WORKFLOW = 'precio-radar.yml'", html)
        self.assertTrue(os.path.exists(os.path.join(RAIZ, ".github/workflows/precio-radar.yml")))
        self.assertTrue(pr.VIGILAR.endswith("radar-vigilar.json"))
        for f in ("radarToggle", "radarGuardar", "radarPintarElegir"):
            self.assertIn("window." + f + "=" + f, html)


if __name__ == "__main__":
    unittest.main()
