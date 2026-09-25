"""Publicar, segunda tanda: lo publicado que dejó de ser verdad, el plan del
día, los grupos en el repositorio, las ventas y la hora por grupo.

El comportamiento lo comprueba tests/publicar_v2_check.mjs en el panel de
verdad, y se corre desde aquí. Lo de este fichero son los contratos que se
leen en el código y se rompen sin que nada falle:

  · tm-data NO puede volver a copiar el fichero de grupos del repo encima de
    lo local: así se borraban los grupos 4 s después de abrir el panel.
  · El grupo de una venta va a /ventas (privado) y NUNCA a /pedidos, que es
    de lectura pública.
  · Los textos para publicar leen el catálogo con descripciones (PRODUCTOS),
    no el ligero.
  · El análisis de lo publicado vive en admin-copilot.js y la lista lo usa:
    dos análisis dan dos números distintos.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "publicar_v2_check.mjs"


def _funcion(src, cabecera):
    ini = src.index(cabecera)
    fin = src.index("\n}", ini)
    return src[ini:fin + 2]


class PublicarV2EnNavegadorTest(unittest.TestCase):
    def test_panel_de_verdad(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=400)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = (ROOT / "js" / "src" / "tm-data.src.js").read_text(encoding="utf-8")
        cls.ui = (ROOT / "js" / "src" / "tm-ui.src.js").read_text(encoding="utf-8")
        cls.rev = (ROOT / "js" / "revolico_integration.js").read_text(encoding="utf-8")
        cls.cop = (ROOT / "js" / "admin-copilot.js").read_text(encoding="utf-8")

    def test_tm_data_no_pisa_los_grupos_locales(self):
        self.assertNotRegex(self.data, r"localStorage\.setItem\(\s*['\"]gruposFB['\"]",
                            "tm-data vuelve a copiar el fichero del repo encima de los "
                            "grupos del panel: se borran en cada recarga.")
        self.assertIn("window.tmGruposDesdeRepo(dataG)", self.data)

    def test_el_grupo_de_la_venta_va_a_ventas_y_no_a_pedidos(self):
        self.assertIn("if (venta.grupo) v.grupo = venta.grupo;",
                      _funcion(self.ui, "function _ventaParaFirebase("))
        ini = self.ui.index("'/pedidos/'")
        cuerpo = self.ui[ini:self.ui.index("})", self.ui.index("body: JSON.stringify({", ini))]
        self.assertNotIn("grupo", cuerpo, "/pedidos es de lectura pública: el grupo no va ahí")
        self.assertNotIn("origen", cuerpo)

    def test_los_textos_leen_el_catalogo_con_descripciones(self):
        cat = _funcion(self.rev, "function _catalogo(")
        self.assertLess(cat.index("window.PRODUCTOS"), cat.index("productos"),
                        "PRODUCTOS (con descripciones) tiene que ir antes que el "
                        "catálogo ligero, o los posts salen sin descripción.")
        self.assertNotIn("window.productos)) return window.productos", self.rev)

    def test_un_solo_analisis_de_lo_publicado(self):
        self.assertIn("window.tmPubVivas = pubVivas;", self.cop)
        self.assertIn("window.tmPubVivas()", self.rev)
        self.assertNotRegex(self.rev, r"function\s+pubVivas\b",
                            "la lista tiene su propia copia del análisis: acabarán "
                            "dando números distintos a los de la tarea.")


if __name__ == "__main__":
    unittest.main()
