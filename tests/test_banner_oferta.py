"""
El banner de oferta del inicio: una sola implementación, y escasez honesta.

Había DOS renderizadores del mismo banner —uno en el <script> en línea de
index.html y otro en js/src/tm-init.src.js— leyendo el mismo `ofertaDiaId` y
pintando cosas distintas. Ninguno fallaba: el inline pintaba primero y, al
cargar el bundle con defer, el banner se redibujaba con otro aspecto. Un
cambio en uno no se veía porque el otro lo tapaba después.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
INIT = ROOT / "js" / "src" / "tm-init.src.js"
CSS = ROOT / "css" / "oferta-banner.css"


class BannerOfertaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = INDEX.read_text(encoding="utf-8")
        cls.init = INIT.read_text(encoding="utf-8")

    def test_solo_hay_un_renderizador(self):
        # El bundle debe delegar, no volver a pintar por su cuenta.
        m = re.search(r"function verificarOfertasYMostrarBanner\(\)\s*\{(.*?)\n\}", self.init, re.S)
        self.assertIsNotNone(m, "no se encontró verificarOfertasYMostrarBanner()")
        cuerpo = m.group(1)
        self.assertIn("tmBannerOfertas", cuerpo,
                      "el bundle debe delegar el pintado en window.tmBannerOfertas")
        self.assertNotIn("flash-deal", cuerpo,
                         "el bundle no debe volver a construir el banner: esa era la copia")
        self.assertIn("window.tmBannerOfertas", self.index,
                      "index.html debe exponer el renderizador que usa el bundle")

    def test_la_escasez_solo_sale_cuando_es_cierta(self):
        # "Solo quedan N" con 20 unidades quema la credibilidad del aviso, y
        # cuando de verdad quedan 2 ya nadie lo cree.
        m = re.search(r"var pocas = [^\n;]+", self.index)
        self.assertIsNotNone(m, "no se encontró el cálculo de escasez")
        self.assertRegex(
            m.group(0), r"<=\s*3\b",
            "'Solo quedan N' debe salir solo con 3 unidades o menos",
        )

    def test_el_banner_ensena_los_datos_del_producto(self):
        # El fallo de origen: el banner tenía el producto y mostraba un eslogan.
        for clase in ("tm-of-nom", "tm-of-hoy", "tm-of-antes", "tm-of-pct"):
            self.assertIn(clase, self.index, f"al banner le falta {clase}")
            self.assertIn(clase, CSS.read_text(encoding="utf-8"), f"{clase} no tiene estilo")

    def test_el_nombre_del_producto_no_se_interpola_como_html(self):
        # Los nombres del catálogo los escribe el admin y llevan emojis y
        # símbolos; concatenarlos en innerHTML rompe la tarjeta.
        self.assertRegex(
            self.index, r"\.tm-of-nom'\)\.textContent\s*=",
            "el nombre debe asignarse con textContent, no dentro del innerHTML",
        )

    def test_la_barra_del_banner_no_recorta_la_sombra(self):
        """La pastilla de la oferta lleva una sombra naranja que sale ~28px por
        debajo. Si su contenedor acaba con `overflow:hidden`, la sombra se corta
        justo en el borde y en el móvil se ve una raya horizontal con dos tonos
        de fondo a cada lado — no un error, solo algo mal hecho.

        Ya pasó una vez y de la forma más tonta: premium-theme.css tenía CUATRO
        reglas con el selector `html body .urgencia-banner`, dos de ellas
        poniendo `overflow` con !important. Como empatan en especificidad gana
        la última del archivo, así que el `overflow:visible` de arriba no hacía
        nada. Por eso aquí se mira la ÚLTIMA declaración de toda la cascada, no
        si existe alguna: buscar `visible` con un grep habría dado verde con la
        raya puesta.
        """
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "build_css", ROOT / "scripts" / "build_css.py")
        build_css = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build_css)

        declaraciones = []
        for nombre in build_css.ORDEN:
            ruta = ROOT / "css" / nombre
            if not ruta.exists():
                continue
            texto = re.sub(r"/\*.*?\*/", "", ruta.read_text(encoding="utf-8"), flags=re.S)
            for m in re.finditer(r"([^{}]*\.urgencia-banner[^{},]*)\{([^{}]*)\}", texto):
                o = re.search(r"(?<![-\w])overflow\s*:\s*([a-z]+)", m.group(2))
                if o:
                    declaraciones.append((nombre, m.group(1).strip()[-60:], o.group(1)))

        self.assertTrue(declaraciones,
                        "nadie declara overflow en .urgencia-banner: ¿cambió el nombre de la clase?")
        archivo, selector, valor = declaraciones[-1]
        self.assertEqual(
            valor, "visible",
            f"la última palabra sobre el overflow de la barra la tiene "
            f"'{selector}' en {archivo}, y dice '{valor}': eso recorta la sombra "
            f"de la oferta en una raya. Declaraciones en orden de cascada: {declaraciones}",
        )

    def test_la_rotacion_se_para_con_la_pestana_oculta(self):
        m = re.search(r"_rot = setInterval\(function\(\)\{(.*?)\}, ROTACION_MS\)", self.index, re.S)
        self.assertIsNotNone(m, "no se encontró la rotación")
        self.assertIn("document.hidden", m.group(1),
                      "no debe rotar de fondo: nadie lo ve y gasta batería")


if __name__ == "__main__":
    unittest.main()
