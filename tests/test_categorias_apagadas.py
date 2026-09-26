"""Categorías y subcategorías apagadas desde el panel.

Lo que se ve en el navegador —que la tienda no enseñe lo apagado en ningún
sitio, que el interruptor del panel guarde solo y fusionado— lo comprueba
tests/categorias_apagadas_check.mjs, que se corre desde aquí.

Lo de este fichero es la otra mitad, la que corre en GitHub Actions: lo
apagado tampoco puede tener página /p/ ni /c/, ni estar en el sitemap, ni
salir en un push o en el canal de Telegram. Y todo tiene que decidirlo la
MISMA regla que la tienda (sin tildes ni mayúsculas, {off:false} = encendida),
o una página seguiría viva para lo que la tienda esconde.
"""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import categorias_apagadas as ca  # noqa: E402

CHECK = ROOT / "tests" / "categorias_apagadas_check.mjs"


class EnNavegadorTest(unittest.TestCase):
    def test_tienda_y_panel(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=400)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ReglaTest(unittest.TestCase):
    AP = ca.Apagadas({
        "categorias": {"útiles": {"off": True, "ts": 1}, "SEGURIDAD": {"off": False, "ts": 2}},
        "subcategorias": {"WIFI": {"antenas y cpe": {"off": True, "ts": 1}}},
    })

    def test_sin_tildes_ni_mayusculas_como_la_tienda(self):
        self.assertTrue(self.AP.producto({"categoria": "UTILES"}))
        self.assertTrue(self.AP.producto({"categoria": "Útiles", "subcategoria": "X"}))
        self.assertTrue(self.AP.producto({"categoria": "WIFI", "subcategoria": "ANTENAS Y CPE"}))

    def test_encendida_de_nuevo_se_ve(self):
        self.assertFalse(self.AP.producto({"categoria": "SEGURIDAD"}),
                         "{off:false} es una categoría que se volvió a encender")

    def test_la_subcategoria_es_de_su_categoria(self):
        self.assertFalse(self.AP.producto({"categoria": "WIFI", "subcategoria": "ROUTERS"}))
        self.assertFalse(self.AP.producto({"categoria": "ENERGIA", "subcategoria": "ANTENAS Y CPE"}),
                         "apagar una subcategoría no apaga la del mismo nombre en otra categoría")
        self.assertFalse(self.AP.producto({"categoria": "WIFI"}),
                         "un producto sin subcategoría no está en la apagada")

    def test_un_fichero_roto_no_apaga_nada(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "categorias.json"
            f.write_text("{roto", encoding="utf-8")
            self.assertFalse(ca.leer(f).hay,
                             "fallar cerrado aquí borraría todas las páginas /p/ por un JSON roto")
            f.write_text(json.dumps({"nombres": ["A"]}), encoding="utf-8")
            self.assertFalse(ca.leer(f).hay)

    def test_la_tienda_normaliza_igual(self):
        src = (ROOT / "js" / "src" / "tm-data.src.js").read_text(encoding="utf-8")
        self.assertIn(".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toUpperCase()", src)
        self.assertIn("m[s] && m[s].off", src, "la tienda tiene que mirar `off`, no que la clave exista")


class PaginasTest(unittest.TestCase):
    """regenerate_artifacts.py con un catálogo pequeño en un directorio aparte."""

    def test_lo_apagado_no_tiene_pagina_ni_sitemap(self):
        import regenerate_artifacts as ra
        prods = [
            {"id": 1, "nombre": "Router", "categoria": "WIFI", "subcategoria": "ROUTERS", "stock": 3, "precioActual": 50},
            {"id": 2, "nombre": "Antena", "categoria": "WIFI", "subcategoria": "ANTENAS Y CPE", "stock": 3, "precioActual": 60},
            {"id": 3, "nombre": "Llave", "categoria": "UTILES", "stock": 3, "precioActual": 10},
            {"id": 4, "nombre": "Panel", "categoria": "ENERGIA", "stock": 3, "precioActual": 90},
        ]
        cats = {"nombres": ["WIFI", "UTILES", "ENERGIA"], "iconos": {},
                "apagadas": {"categorias": {"Útiles": {"off": True, "ts": 1}},
                             "subcategorias": {"WIFI": {"Antenas y CPE": {"off": True, "ts": 1}}}}}
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "productos.json").write_text(json.dumps(prods), encoding="utf-8")
            (d / "categorias.json").write_text(json.dumps(cats), encoding="utf-8")
            (d / "config.json").write_text("{}", encoding="utf-8")
            (d / "subcategorias.json").write_text("{}", encoding="utf-8")
            (d / "p").mkdir(); (d / "c").mkdir()
            # Páginas de una pasada anterior, con todo encendido.
            (d / "p" / "producto-3.html").write_text("vieja", encoding="utf-8")
            (d / "c" / "utiles.html").write_text("vieja", encoding="utf-8")
            with mock.patch.multiple(ra, ROOT=d, PROD=d / "productos.json", CONF=d / "config.json",
                                     COMM=d / "comisiones.json", SUBS=d / "subcategorias.json",
                                     CATS=d / "categorias.json", RESENAS=d / "resenas.json",
                                     P_DIR=d / "p", C_DIR=d / "c", OG_MANIFEST=d / "og.json",
                                     SITEMAP=d / "sitemap.xml", INDEX=d / "index.html"):
                self.assertEqual(0, ra.main())
            paginas = sorted(f.name for f in (d / "p").iterdir())
            self.assertEqual(["producto-1.html", "producto-4.html"], paginas,
                             "lo apagado no puede tener página /p/: es una puerta a comprar lo retirado")
            self.assertFalse((d / "c" / "utiles.html").exists(), "la categoría apagada conserva su página /c/")
            self.assertTrue((d / "c" / "wifi.html").exists(), "apagar una subcategoría no apaga la categoría")
            self.assertNotIn("Antena", (d / "c" / "wifi.html").read_text(encoding="utf-8"))
            mapa = (d / "sitemap.xml").read_text(encoding="utf-8")
            self.assertNotIn("producto-2.html", mapa)
            self.assertNotIn("producto-3.html", mapa)
            self.assertNotIn("/c/utiles.html", mapa)
            subs = json.loads((d / "subcategorias.json").read_text(encoding="utf-8"))
            self.assertIn("ANTENAS Y CPE", subs.get("WIFI", []),
                          "subcategorias.json son datos del panel: tiene que seguir teniéndolo todo")


class AvisosTest(unittest.TestCase):
    def test_push_no_anuncia_lo_apagado(self):
        import send_notifications as sn
        prods = [{"id": 1, "categoria": "UTILES"}, {"id": 2, "categoria": "WIFI"}]
        cambios = {"nuevos": [{"id": 1}, {"id": 2}], "rebajas": [{"id": 1}], "restock": [{"id": 2}]}
        ap = ca.Apagadas({"categorias": {"UTILES": {"off": True, "ts": 1}}})
        r = sn.sin_apagados(cambios, prods, ap)
        self.assertEqual([2], [x["id"] for x in r["nuevos"]])
        self.assertEqual([], r["rebajas"])
        self.assertEqual([2], [x["id"] for x in r["restock"]])

    def test_el_estado_se_guarda_con_el_catalogo_entero(self):
        """Si se guardara sin lo apagado, al encender la categoría todos sus
        productos parecerían nuevos y saldría un push anunciándolos."""
        src = (ROOT / "scripts" / "send_notifications.py").read_text(encoding="utf-8")
        self.assertIn("guardar_estado(db_api, p_act,", src)
        self.assertIn("catalogo = apagadas.visibles(p_act)", src)

    def test_el_canal_de_telegram_no_lo_anuncia(self):
        src = (ROOT / "bot" / "publish_producto.py").read_text(encoding="utf-8")
        filtro = src.index("_fuera.producto(p)")
        self.assertLess(filtro, src.index("# ── 1. Productos nuevos"),
                        "el filtro tiene que ir antes de anunciar nuevos, rebajas y ofertas")
        self.assertGreater(filtro, src.index("# ── 0. Productos agotados"),
                           "borrar del canal lo que se agotó sigue viéndolo todo")


class PanelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = (ROOT / "admin.html").read_text(encoding="utf-8")

    def test_publicar_no_propone_lo_apagado(self):
        for f in ("function pubHoyCandidatos(", "function pubSeVenYNadieLosPide(", "function pubCatCats(", "function pubCatProds("):
            ini = self.admin.index(f)
            self.assertIn("pubEnTienda(p)", self.admin[ini:ini + 400], f)

    def test_la_tienda_guarda_el_catalogo_entero(self):
        """localStorage lo comparte el panel (mismo origen): guardar ahí lo
        filtrado haría creer al panel que esos productos no existen."""
        src = (ROOT / "js" / "src" / "tm-data.src.js").read_text(encoding="utf-8")
        self.assertIn("localStorage.setItem('productos', JSON.stringify(_todos));", src)
        self.assertNotRegex(src, r"setItem\('productos', JSON\.stringify\(productos\)\)")


if __name__ == "__main__":
    unittest.main()
