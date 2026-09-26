"""El enlace corto de cada producto: tiendamax.org/p/<nombre-corto>.

En Facebook la dirección se lee entera en el post, y producto-<id>.html con
tres utm detrás eran 120 caracteres de ruido. Ahora la ficha vive en
p/<slug>.html (GitHub Pages la sirve también sin el .html) y todo lo ya
publicado sigue llegando: p/producto-<id>.html y los nombres anteriores son
saltos a la nueva, con las mismas etiquetas de vista previa.

Lo que se ve en el panel lo comprueba tests/enlace_corto_check.mjs, que se
corre desde aquí. Lo de este fichero es lo que se rompe sin avisar:

  · Dos productos con el mismo nombre corto: uno de los dos enlaces lleva
    al producto equivocado.
  · Una ficha sin su salto: todo lo publicado antes da 404.
  · El panel, el bundle y el generador aceptando formatos distintos: el
    panel publicaría enlaces a una página que nunca se crea.
  · El título de la vista previa sin la moneda: "280" en MN leído como $280.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import ficha_url  # noqa: E402

CHECK = ROOT / "tests" / "enlace_corto_check.mjs"
PRODUCTOS = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))


class EnNavegadorTest(unittest.TestCase):
    def test_panel_de_verdad(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class CatalogoTest(unittest.TestCase):
    def test_todos_tienen_uno_valido_y_corto(self):
        malos = [(p.get("nombre"), p.get("slug")) for p in PRODUCTOS
                 if not ficha_url.slug_valido(p.get("slug")) or len(p["slug"]) > ficha_url.SLUG_MAX]
        self.assertEqual([], malos)

    def test_ninguno_se_repite_ni_pisa_uno_viejo(self):
        vistos = {}
        for p in PRODUCTOS:
            for s in [p.get("slug")] + list(p.get("slugsAnteriores") or []):
                if s:
                    self.assertNotIn(s, vistos, f"«{s}» lo usan «{vistos.get(s)}» y «{p.get('nombre')}»")
                    vistos[s] = p.get("nombre")


class MismoFormatoTest(unittest.TestCase):
    """El mismo patrón en los tres sitios que deciden si un slug vale."""

    PATRON = "^[a-z0-9]+(?:-[a-z0-9]+)*$"

    def test_python(self):
        self.assertEqual(self.PATRON, ficha_url._SLUG_RE.pattern)

    def test_bundle_y_panel(self):
        patches = (ROOT / "js" / "src" / "tm-patches.src.js").read_text(encoding="utf-8")
        admin = (ROOT / "admin.html").read_text(encoding="utf-8")
        self.assertIn("/" + self.PATRON + "/.test(s)", patches)
        self.assertIn("/" + self.PATRON + "/.test(s)", admin)
        for src in (patches, admin):
            self.assertIn("producto-", src)   # los dos rechazan los que chocan con los saltos

    def test_nadie_arma_el_enlace_largo_para_publicar(self):
        """Todo lo que se comparte pasa por tmUrlProducto / url_ficha."""
        for rel in ("js/revolico_integration.js", "js/src/tm-product.src.js", "js/src/tm-publicar.src.js"):
            src = (ROOT / rel).read_text(encoding="utf-8")
            self.assertNotRegex(src, r"tiendamax\.org/p/producto-", rel)
            self.assertNotIn("utm_medium=social", src, rel)
        admin = (ROOT / "admin.html").read_text(encoding="utf-8")
        ini = admin.index("function pubUrl(")
        self.assertIn("tmUrlProducto(", admin[ini:ini + 200])
        self.assertNotIn("utm_medium=social", admin)


class PaginasTest(unittest.TestCase):
    """regenerate_artifacts.py con un catálogo pequeño en un directorio aparte."""

    def _generar(self, prods):
        import regenerate_artifacts as ra
        d = Path(self.enterContext(tempfile.TemporaryDirectory()))
        (d / "productos.json").write_text(json.dumps(prods), encoding="utf-8")
        (d / "categorias.json").write_text(json.dumps({"nombres": ["WIFI"]}), encoding="utf-8")
        for f in ("config.json", "subcategorias.json"):
            (d / f).write_text("{}", encoding="utf-8")
        (d / "p").mkdir(); (d / "c").mkdir()
        # Una ficha de una pasada anterior con el nombre que ya no tiene.
        (d / "p" / "router-viejo.html").write_text("vieja", encoding="utf-8")
        with mock.patch.multiple(ra, ROOT=d, PROD=d / "productos.json", CONF=d / "config.json",
                                 COMM=d / "comisiones.json", SUBS=d / "subcategorias.json",
                                 CATS=d / "categorias.json", RESENAS=d / "resenas.json",
                                 P_DIR=d / "p", C_DIR=d / "c", OG_MANIFEST=d / "og.json",
                                 SITEMAP=d / "sitemap.xml", INDEX=d / "index.html"):
            self.assertEqual(0, ra.main())
        return d

    def test_ficha_saltos_y_vista_previa(self):
        prods = [
            {"id": 1, "nombre": "🌐 Router AX1800", "slug": "router-ax1800", "slugsAnteriores": ["router-viejo"],
             "categoria": "WIFI", "stock": 3, "precioActual": 140, "garantia": "3 meses",
             "seoDescription": "Router rápido."},
            {"id": 2, "nombre": "Cable Cat6", "slug": "router-ax1800", "categoria": "WIFI",
             "stock": 0, "precioActual": 280, "moneda": "MN"},
            {"id": 3, "nombre": "Antena", "categoria": "WIFI", "stock": 1, "precioActual": 60},
        ]
        d = self._generar(prods)
        p = d / "p"
        ficha = (p / "router-ax1800.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="canonical" href="https://tiendamax.org/p/router-ax1800">', ficha)
        self.assertIn('<meta property="og:title" content="Router AX1800 — $140 USD">', ficha,
                      "la vista previa dice qué es y cuánto cuesta, sin emoji")
        self.assertIn('content="✅ 3 disponibles · Pagas al recibirlo · Garantía 3 meses. Router rápido."', ficha)
        self.assertIn('<meta name="description" content="Router rápido.">', ficha,
                      "la descripción para Google no cambia")
        for viejo in ("producto-1.html", "router-viejo.html"):
            salto = (p / viejo).read_text(encoding="utf-8")
            self.assertIn('location.replace("https://tiendamax.org/p/router-ax1800"+location.search', salto,
                          f"{viejo}: el salto tiene que conservar ?c=/?g=, o lo publicado deja de medirse")
            self.assertIn('og:title" content="Router AX1800 — $140 USD"', salto,
                          f"{viejo}: WhatsApp lee las etiquetas del salto, no las de la ficha")
            self.assertIn('noindex', salto)
        # El segundo que reclama el mismo nombre se queda en su dirección de siempre.
        cable = (p / "producto-2.html").read_text(encoding="utf-8")
        self.assertNotIn('http-equiv="refresh"', cable)
        self.assertIn('og:title" content="Cable Cat6 — 280 MN"', cable, "280 MN no son $280")
        self.assertIn("Agotado ahora", cable)
        self.assertNotIn("Garantía", cable.split("og:description")[1][:200], "sin garantía escrita, no se promete")
        self.assertTrue((p / "producto-3.html").exists(), "sin slug, la ficha sigue donde estaba")
        mapa = (d / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("<loc>https://tiendamax.org/p/router-ax1800</loc>", mapa)
        self.assertNotIn("router-viejo", mapa, "los saltos no van al sitemap")
        self.assertNotIn("producto-1.html", mapa)

    def test_un_nombre_que_ya_no_usa_nadie_se_borra(self):
        d = self._generar([{"id": 1, "nombre": "Router", "slug": "router-nuevo", "categoria": "WIFI",
                            "stock": 1, "precioActual": 10}])
        self.assertFalse((d / "p" / "router-viejo.html").exists(),
                         "una página de p/ que no es ficha ni salto de nadie tiene que irse")


class AplicarCambiosTest(unittest.TestCase):
    def test_un_panel_viejo_no_le_quita_el_enlace(self):
        """Un panel abierto desde antes de los slugs sube el producto sin
        ellos: si se reemplazara tal cual, la ficha volvería a producto-<id>
        y todo lo publicado con el enlace corto daría 404."""
        import aplicar_cambios as ac
        antes = [{"id": 1, "nombre": "Router", "slug": "router-ax", "slugsAnteriores": ["router"],
                  "descripcion": "x", "precioActual": 10}]
        sube = {"v": 1, "productos": [{"id": 1, "nombre": "Router", "precioActual": 12}]}
        p = ac.aplicar(antes, [("1-a.json", sube)])[0]
        self.assertEqual(12, p["precioActual"])
        self.assertEqual("router-ax", p.get("slug"))
        self.assertEqual(["router"], p.get("slugsAnteriores"))
        # Y si el panel sí lo trae, manda el del panel (el gestor lo cambió).
        sube2 = {"v": 1, "productos": [{"id": 1, "nombre": "Router", "slug": "router-nuevo", "slugsAnteriores": ["router", "router-ax"]}]}
        self.assertEqual("router-nuevo", ac.aplicar(antes, [("2-a.json", sube2)])[0]["slug"])


class ContadorTest(unittest.TestCase):
    def test_el_whatsapp_de_la_ficha_lleva_la_direccion_corta(self):
        import regenerate_artifacts as ra
        self.assertIn("encodeURIComponent('?c='+c)", ra.MEDIR_JS)
        self.assertIn("U.get('c')||U.get('utm_source')", ra.MEDIR_JS,
                      "los enlaces ya publicados con utm_source tienen que seguir contando")


if __name__ == "__main__":
    unittest.main()
