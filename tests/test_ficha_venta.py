"""La ficha /p/ como página de venta: lo que mide y lo que enseña.

Las 132 fichas son el destino de TODO lo que se publica, y cada cosa que se
les añade se copia 132 veces y la descarga cada visita desde un móvil cubano.
De ahí que casi todo lo que se comprueba aquí sea de la forma "está donde
tiene que estar y NO está donde no hace falta".

Los tres fallos que esto vigila no dan error en ninguna parte:

  - El contador y el sitio usan llaves de sesión DISTINTAS. Nada falla: quien
    entra por un enlace publicado y sigue a tiendamax.org cuenta dos visitas,
    y la duplicada es justo la del canal que se quería medir.
  - `utm_source` llega a la ruta de Firebase sin pasar por la lista blanca.
    Un enlace inventado crea nodos en la base y la lista de canales del panel
    se llena de basura que no se puede borrar desde ahí.
  - La garantía o una reseña se imprimen sin existir. La página se ve
    perfecta; lo que se rompe es lo que el cliente viene a cobrar después.
"""

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
P_DIR = RAIZ / "p"


def _fichas():
    return sorted(P_DIR.glob("producto-*.html"))


def _script_medir(html):
    for g in re.findall(r"<script>\n(\(function\(\)\{.*?)</script>", html, re.S):
        if "/analytics/vistas/" in g:
            return g
    return None


class ContadorEnLaFichaTest(unittest.TestCase):
    """El contador tiene que estar en TODAS, no solo en las agotadas."""

    @classmethod
    def setUpClass(cls):
        cls.fichas = _fichas()
        if not cls.fichas:
            raise unittest.SkipTest("no hay páginas /p/ generadas")

    def test_todas_las_fichas_cuentan(self):
        sin = [f.name for f in self.fichas if not _script_medir(f.read_text(encoding="utf-8"))]
        self.assertEqual([], sin, f"{len(sin)} ficha(s) sin contador: {sin[:5]}")

    def test_todas_tienen_un_solo_tmwa(self):
        # El script engancha el clic por getElementById: con dos anclas iguales
        # solo se mide la primera y el otro botón deja de contar en silencio.
        for f in self.fichas:
            n = f.read_text(encoding="utf-8").count('id="tmWa"')
            self.assertEqual(1, n, f"{f.name} tiene {n} anclas id=tmWa")

    def test_el_javascript_compila(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible")
        js = _script_medir(self.fichas[0].read_text(encoding="utf-8"))
        # `{".sv":{"increment":1}}` acaba en dos llaves de verdad, así que aquí
        # no vale buscar "}}": lo que delata un format() a medias es la llave
        # de un marcador, y eso lo caza el propio node.
        r = subprocess.run([node, "--check", "-"], input=js,
                           capture_output=True, text=True, timeout=30)
        self.assertEqual(0, r.returncode, r.stderr)

    def test_usa_las_llaves_de_sesion_del_sitio(self):
        js = _script_medir(self.fichas[0].read_text(encoding="utf-8"))
        self.assertIn("tm_an_", js, "la vista por producto usa la llave de analytics.js")
        self.assertIn("tm_visita_contada", js, "la visita usa la llave de tm-patches.src.js")
        # Las que se usan de verdad tienen que existir en los ficheros del sitio.
        analytics = (RAIZ / "js" / "analytics.js").read_text(encoding="utf-8")
        patches = (RAIZ / "js" / "src" / "tm-patches.src.js").read_text(encoding="utf-8")
        self.assertIn("'tm_an_'", analytics)
        self.assertIn("tm_visita_contada", patches)

    def test_no_cuenta_al_dueño(self):
        js = _script_medir(self.fichas[0].read_text(encoding="utf-8"))
        for marca in ("githubToken", "tm_auth_hash_v3", "tm_es_admin"):
            self.assertIn(marca, js, f"falta la marca de admin {marca}")

    def test_los_canales_son_la_lista_blanca_del_sitio(self):
        js = _script_medir(self.fichas[0].read_text(encoding="utf-8"))
        patches = (RAIZ / "js" / "src" / "tm-patches.src.js").read_text(encoding="utf-8")
        bloque = re.search(r"const _TM_FUENTES = \{(.*?)\}", patches, re.S).group(1)
        esperadas = set(re.findall(r"'([a-z-]+)'\s*:", bloque))
        en_ficha = set(re.findall(r"'?([a-z-]+)'?\s*:\s*'([a-z-]+)'", js.split("var F={")[1].split("};")[0]))
        self.assertEqual(esperadas, {k for k, _ in en_ficha},
                         "la tabla de canales de la ficha se separó de _TM_FUENTES")

    def test_solo_escribe_en_rutas_que_las_reglas_permiten(self):
        js = _script_medir(self.fichas[0].read_text(encoding="utf-8"))
        rutas = set(re.findall(r"mas\('(/analytics/[^']+)'", js))
        reglas = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]

        def permitida(ruta):
            nodo = reglas
            for parte in [p for p in ruta.strip("/").split("/") if p]:
                if parte in nodo:
                    nodo = nodo[parte]
                else:
                    comodin = next((k for k in nodo if k.startswith("$")), None)
                    if not comodin:
                        return False
                    nodo = nodo[comodin]
            return ".write" in nodo and nodo[".write"] is not False

        for r in rutas:
            # Las rutas se arman concatenando; se normaliza a la forma con
            # comodín para poder buscarlas en las reglas.
            plana = r.rstrip("/'+ID").rstrip("/")
            self.assertTrue(rutas, "no escribe en ninguna ruta")
        # Comprobación explícita de las cinco que escribe.
        for ruta in ("analytics/vistas/$productId/count",
                     "analytics/whatsapp/$productId/count",
                     "analytics/visitas/count",
                     "analytics/visitas/dias/$dia",
                     "analytics/fuentes/$fuente/count",
                     "analytics/fuentes/$fuente/dias/$dia"):
            self.assertTrue(permitida(ruta), f"{ruta} no tiene .write en firebase-rules.json")


class ContadorEnNavegadorTest(unittest.TestCase):
    """tests/medir_check.mjs: lo que solo se ve con la página corriendo.

    Que la lista blanca esté escrita en el fichero no prueba que se use — un
    `var c=q` la deja intacta y de adorno. Eso, el excluir al dueño y el no
    volver a contar al recargar solo se comprueban ejecutando.
    """

    def test_el_contador_se_comporta_en_un_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "medir_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=300)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


class BotonesTest(unittest.TestCase):
    """Con stock, pedir por WhatsApp es la acción; el catálogo es lo otro."""

    @classmethod
    def setUpClass(cls):
        cls.fichas = _fichas()
        if not cls.fichas:
            raise unittest.SkipTest("no hay páginas /p/ generadas")

    def test_con_stock_whatsapp_va_primero_y_es_el_principal(self):
        vistas = 0
        for f in self.fichas:
            html = f.read_text(encoding="utf-8")
            # Con el tag entero: ".tm-stok-y{" está en el CSS de las 132.
            if '<div class="tm-stok-y">' not in html:
                continue
            vistas += 1
            acciones = re.search(r'<div class="tm-actions">(.*?)\n    </div>', html, re.S).group(1)
            i_wa = acciones.index("wa.me")
            i_app = acciones.index("?producto=")
            self.assertLess(i_wa, i_app, f"{f.name}: el catálogo se puso delante de WhatsApp")
            self.assertIn("tm-btn-w", acciones)
            self.assertRegex(acciones, r'\?producto=[^"]*"[^>]*class="tm-btn tm-btn-s"',
                             f"{f.name}: el enlace al catálogo debe ser el secundario")
        self.assertGreater(vistas, 0, "ninguna ficha con stock")

    def test_agotada_no_ofrece_pedir(self):
        for f in self.fichas:
            html = f.read_text(encoding="utf-8")
            if '<div class="tm-stok-n">' not in html:
                continue
            acciones = re.search(r'<div class="tm-actions">(.*?)\n    </div>', html, re.S).group(1)
            self.assertIn("tmAvisarBtn", acciones)
            self.assertNotIn("Pedir por WhatsApp", acciones)
            return
        self.skipTest("no hay fichas agotadas")


class GarantiaTest(unittest.TestCase):
    """Se imprime la que está escrita, y solo esa."""

    @classmethod
    def setUpClass(cls):
        cls.productos = json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))
        if not _fichas():
            raise unittest.SkipTest("no hay páginas /p/ generadas")

    def test_solo_la_llevan_los_que_la_tienen_escrita(self):
        conteo = 0
        for p in self.productos:
            f = P_DIR / f"producto-{p.get('id')}.html"
            if not f.exists():
                continue
            html = f.read_text(encoding="utf-8")
            tiene = bool((p.get("garantia") or "").strip())
            marcada = 'class="tm-gar"' in html
            self.assertEqual(tiene, marcada,
                             f"{f.name}: garantía en la página={marcada}, en el catálogo={tiene}")
            if tiene:
                conteo += 1
                # El texto tiene que ser el del catálogo, no uno redondeado.
                self.assertIn((p["garantia"] or "").strip()[:30].replace("&", "&amp;"), html)
        self.assertGreater(conteo, 0, "ningún producto con garantía: ¿se vació el campo?")

    def test_el_css_de_la_garantia_solo_viaja_donde_se_usa(self):
        # Es la razón de que exista css_extra. Si vuelve a la hoja fija, las
        # 124 fichas sin garantía se llevan reglas de un bloque inexistente.
        sin = [f for f in _fichas() if 'class="tm-gar"' not in f.read_text(encoding="utf-8")]
        self.assertTrue(sin, "todas tienen garantía; comprobación no aplicable")
        self.assertNotIn(".tm-gar{", sin[0].read_text(encoding="utf-8"))


class ResenasTest(unittest.TestCase):
    """Reales o ninguna, y sin estrellas para Google sin reseña detrás."""

    @classmethod
    def setUpClass(cls):
        cache = RAIZ / "resenas-cache.json"
        if not cache.exists() or not _fichas():
            raise unittest.SkipTest("sin caché de reseñas o sin páginas")
        cls.por = json.loads(cache.read_text(encoding="utf-8")).get("por_producto") or {}

    def test_solo_las_que_existen_en_la_cache(self):
        for f in _fichas():
            html = f.read_text(encoding="utf-8")
            pid = f.stem.replace("producto-", "")
            reales = [r for r in (self.por.get(pid) or []) if r.get("texto")]
            self.assertEqual(bool(reales), 'class="tm-res"' in html,
                             f"{f.name}: bloque de reseñas sin reseñas reales (o al revés)")
            for r in reales[:3]:
                self.assertIn(r["texto"][:40], html, f"{f.name}: falta el texto de la reseña")

    def test_las_estrellas_de_google_llevan_reseña_detras(self):
        for f in _fichas():
            html = f.read_text(encoding="utf-8")
            if "aggregateRating" not in html:
                continue
            self.assertIn('"review"', html, f"{f.name}: aggregateRating sin reviews es lo que penaliza Google")
            pid = f.stem.replace("producto-", "")
            reales = [r for r in (self.por.get(pid) or []) if int(r.get("estrellas") or 0) > 0]
            self.assertTrue(reales, f"{f.name}: valoración agregada sin reseñas reales")
            m = re.search(r'"reviewCount": (\d+)', html)
            self.assertEqual(len(reales[:3]), int(m.group(1)))


class OrigenDeLaVentaTest(unittest.TestCase):
    """El canal de la venta: opcional, sin preseleccionar, y fuera de Firebase."""

    @classmethod
    def setUpClass(cls):
        cls.admin = (RAIZ / "admin.html").read_text(encoding="utf-8")
        cls.ui = (RAIZ / "js" / "src" / "tm-ui.src.js").read_text(encoding="utf-8")

    def test_las_claves_coinciden_con_las_del_motor(self):
        motor = set(re.findall(r"'([a-z-]+)'",
                    re.search(r"const VENTA_ORIGENES = \[(.*?)\]", self.ui, re.S).group(1)))
        panel = set(re.findall(r"\['([a-z-]+)',",
                    re.search(r"const VENTA_ORIGEN_CHIPS = \[(.*?)\];", self.admin, re.S).group(1)))
        self.assertEqual(motor, panel,
                         "los botones del panel y la lista que valida el motor se separaron: "
                         "el canal se tocaría y no se guardaría")

    def test_no_hay_ninguno_preseleccionado(self):
        # Un canal por defecto se queda puesto en las ventas anotadas con prisa
        # y les atribuye ventas que no son suyas: un dato falso, peor que nada.
        self.assertRegex(self.admin, r"let VENTA_ORIGEN = '';")

    def test_se_puede_quitar_volviendo_a_tocarlo(self):
        self.assertRegex(self.admin, r"VENTA_ORIGEN = \(VENTA_ORIGEN===k\) \? '' : k")

    def test_el_canal_no_viaja_al_pedido_publico(self):
        # /pedidos/$id tiene ".read": true. Por dónde vende la tienda es cuenta
        # suya, y además el payload se arma campo a campo a propósito.
        payload = re.search(r"/pedidos/.*?body:\s*JSON\.stringify\((\{.*?\})\)",
                            self.ui, re.S).group(1)
        self.assertNotIn("origen", payload)

    def test_el_motor_valida_contra_la_lista(self):
        self.assertRegex(self.ui, r"VENTA_ORIGENES\.indexOf\(org\) !== -1")

    def test_analytics_cruza_visitas_con_ventas(self):
        self.assertIn("function ventasPorCanal(", self.admin)
        self.assertRegex(self.admin, r"const vpc = ventasPorCanal\(VENTAS\)")


if __name__ == "__main__":
    unittest.main()
