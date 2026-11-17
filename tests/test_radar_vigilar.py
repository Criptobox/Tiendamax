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


class MonedaTest(unittest.TestCase):
    """Un anuncio en CUP se convierte a USD con la tasa solo para compararlo, y
    el radar guarda su moneda y su cifra original para decirlo."""
    def test_cada_anuncio_lleva_su_moneda_y_su_cifra(self):
        self.assertEqual({"usd": 499.0, "moneda": "USD", "orig": 499.0}, pr.parse_precio("499 USD", 925))
        self.assertEqual({"usd": 150.0, "moneda": "MLC", "orig": 150.0}, pr.parse_precio("150 mlc", 925))
        p = pr.parse_precio("280,000 cup", 925)
        self.assertEqual(("CUP", 280000.0, 302.7), (p["moneda"], p["orig"], p["usd"]))

    def test_miles_con_espacio_no_se_leen_como_280_dolares(self):
        # «280 000 CUP» se leía «280» y, sin moneda, valía 280 dólares.
        m = pr.PRECIO_TXT_RE.search("Vendo ventilador 280 000 CUP negociable")
        self.assertEqual("280 000 CUP", m.group(0).strip())
        self.assertEqual("CUP", pr.parse_precio(m.group(0), 925)["moneda"])
        self.assertEqual(1200.0, pr.parse_precio("$1 200 USD", 925)["usd"])

    def test_cup_sin_tasa_no_se_inventa(self):
        self.assertIsNone(pr.parse_precio("280000 cup", None))

    def test_producto_en_mn_se_compara_en_usd_y_dice_cual_era_el_suyo(self):
        a = pr.analizar({"id": 1, "nombre": "Cable", "precioActual": 280, "moneda": "MN"},
                        [{"precio": 3.0, "titulo": "x", "moneda": "CUP", "orig": 2775}], [], "2026-11-17", 925)
        self.assertEqual((0.3, "MN", 280.0, 1), (a["tuPrecio"], a["tuMoneda"], a["tuPrecioOrig"], a["convertidos"]))

    def test_producto_en_mn_sin_tasa_no_se_compara(self):
        a = pr.analizar({"id": 1, "nombre": "Cable", "precioActual": 280, "moneda": "MN"}, [], [], "2026-11-17", None)
        self.assertIsNone(a["tuPrecio"])
        self.assertEqual("sin_datos", a["estado"])


class MemoriaTest(unittest.TestCase):
    """128GB/8GB RAM y 64GB/8GB RAM comparten el 8: no son el mismo teléfono."""
    N = "Smartphone itel A100C (128GB ROM / 8GB RAM 3+5GB)"

    def test_la_cifra_grande_manda(self):
        self.assertFalse(pr.mismo_modelo(self.N, "Smartphone itel A100C (64GB ROM / Hasta 8GB RAM)"))
        self.assertFalse(pr.mismo_modelo(self.N, "ITEL ACITY A100C - 3GB + 64GB"))
        self.assertTrue(pr.mismo_modelo(self.N, "itel A100C 128GB 8GB RAM"))
        self.assertTrue(pr.mismo_modelo(self.N, "iTel Acity A100C"))

    def test_el_de_64_acepta_el_anuncio_con_otra_ram(self):
        n = "Smartphone itel A100C (64GB ROM / Hasta 8GB RAM Extendida)"
        self.assertTrue(pr.mismo_modelo(n, "ITEL ACITY A100C - 3GB + 64GB"))
        self.assertFalse(pr.mismo_modelo(n, "itel 128GB"))


def _r(id, tu, mn, n=3, firma="f", **k):
    d = {"id": id, "nombre": f"Prod {id} <b>", "tuPrecio": tu, "firma": firma,
         "mercado": {"min": mn, "n": n, "mediana": mn},
         "muestras": [{"precio": mn, "url": f"https://x/{id}", "titulo": "Anuncio & co"}]}
    d.update(k)
    return d


class AvisoTelegramTest(unittest.TestCase):
    """Solo avisa cuando se mueve el mercado, no cuando el gestor toca algo."""
    PREV = {"productos": [_r(1, 100, 100), _r(2, 100, 70), _r(3, 100, 100), _r(4, 100, 100, firma="otra"),
                          _r(5, 100, 100), _r(6, 100, 100, firma=None)]}

    def _ids(self, ahora):
        c = pr.cambios_radar(self.PREV, ahora)
        return [x["id"] for x in c["bajaron"]], [x["id"] for x in c["ya_no"]]

    def test_avisa_de_quien_se_pone_por_debajo_y_de_quien_deja_de_estarlo(self):
        self.assertEqual(([1], [2]), self._ids([_r(1, 100, 60), _r(2, 100, 100)]))

    def test_una_diferencia_de_redondeo_no_es_noticia(self):
        self.assertEqual(([], []), self._ids([_r(3, 100, 98)]))

    def test_si_cambio_tu_busqueda_o_tus_anuncios_quitados_no_avisa(self):
        # El mercado no se movió: lo movió el gestor.
        self.assertEqual(([], []), self._ids([_r(4, 100, 60)]))

    def test_si_cambio_tu_precio_no_avisa(self):
        self.assertEqual(([], []), self._ids([_r(5, 90, 60)]))

    def test_sin_firma_anterior_o_producto_nuevo_no_avisa(self):
        self.assertEqual(([], []), self._ids([_r(6, 100, 60), _r(7, 100, 50)]))

    def test_primera_corrida_sin_nada_antes_no_avisa(self):
        c = pr.cambios_radar(None, [_r(1, 100, 10)])
        self.assertEqual("", pr.mensaje_aviso(c))

    def test_firma_depende_de_terminos_y_de_lo_quitado(self):
        a = pr.firma_busqueda("cargador 30a", ["u1"])
        self.assertEqual(a, pr.firma_busqueda(" Cargador 30A ", ["u1"]))
        self.assertNotEqual(a, pr.firma_busqueda("cargador 30a", ["u1", "u2"]))
        self.assertNotEqual(a, pr.firma_busqueda("otro", ["u1"]))

    def test_el_mensaje_escapa_el_html_y_lleva_el_anuncio(self):
        txt = pr.mensaje_aviso(pr.cambios_radar(self.PREV, [_r(1, 100, 60)]))
        self.assertIn("Prod 1 &lt;b&gt;", txt)
        self.assertIn("Anuncio &amp; co", txt)
        self.assertIn('href="https://x/1"', txt)
        self.assertNotIn("<b>Prod 1 <b>", txt)

    def test_producto_en_mn_se_nombra_en_mn(self):
        r = _r(1, 0.3, 0.1, tuMoneda="MN", tuPrecioOrig=280.0)
        txt = pr.mensaje_aviso({"bajaron": [r], "ya_no": []})
        self.assertIn("280 MN", txt)

    def test_el_mensaje_cabe_en_telegram_con_muchos_productos(self):
        rs = [_r(i, 100, 50) for i in range(40)]
        txt = pr.mensaje_aviso({"bajaron": rs, "ya_no": []})
        self.assertLessEqual(len(txt), 4096)
        self.assertIn("y 32 más en el Radar", txt)

    def test_el_script_no_manda_telegram_por_su_cuenta_y_el_workflow_espera_al_commit(self):
        src = open(os.path.join(RAIZ, "scripts", "precio_radar.py"), encoding="utf-8").read()
        cuerpo = src[src.index("def main():"):src.index('if __name__ == "__main__":')]
        self.assertNotIn("enviar_telegram(", cuerpo)
        wf = open(os.path.join(RAIZ, ".github/workflows/precio-radar.yml"), encoding="utf-8").read()
        paso = wf[wf.index("- name: Avisar por Telegram"):]
        self.assertIn("steps.commit.outputs.subido == '1'", paso.split("run:")[0])
        self.assertIn("secrets.BOT_TOKEN", paso)
        self.assertIn("aviso-radar.txt", wf)


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
        self.assertIn("function radarComision(", html)
        for f in ("radarToggle", "radarGuardar", "radarPintarElegir", "radarNoEs",
                  "radarDeshacer", "radarTermEditar", "radarTermGuardar"):
            self.assertIn("window." + f + "=" + f, html)


if __name__ == "__main__":
    unittest.main()
