"""
Las fotos del catálogo se sirven desde el propio dominio, no desde
raw.githubusercontent.com.

No es cosmético. Tener el MISMO fichero guardado con dos URLs distintas es lo
que hizo que `imagenEnUso` diera por libre una foto que otro producto seguía
usando, y se borrara del repo la única imagen de ese producto (de ahí
tests/imagen_en_uso_check.mjs, que hoy entiende las dos formas). Mientras el
catálogo mezcle hosts, cada comprobación que compare URLs tiene que acordarse
de normalizar, y la que se olvide falla en silencio.

La fuente eran las subidas: subirImagenAGitHub devolvía la URL de raw porque es
la que funciona en el instante del commit, antes de que Pages redespliegue. Esa
ventana la cubre ahora el reintento de tm-data.src.js, y lo que se guarda es la
URL canónica.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DATA = RAIZ / "js" / "src" / "tm-data.src.js"
CANON = "https://tiendamax.org/"


def _urls(catalogo):
    prods = json.loads((RAIZ / catalogo).read_text(encoding="utf-8"))
    for p in prods:
        for u in [p.get("imagen")] + list(p.get("imagenes") or []):
            if u:
                yield p.get("nombre", p.get("id")), u


class UrlsImagenesTest(unittest.TestCase):
    def test_ninguna_foto_del_catalogo_sale_de_raw_githubusercontent(self):
        for catalogo in ("productos.json", "productos-lite.json"):
            malas = [f"{n}: {u}" for n, u in _urls(catalogo)
                     if "raw.githubusercontent" in u]
            self.assertEqual(
                [], malas,
                f"{catalogo} sirve fotos desde raw.githubusercontent; el mismo "
                f"fichero acaba con dos URLs y las comprobaciones que comparan "
                f"URLs dejan de verlo como el mismo",
            )

    def test_la_subida_guarda_la_url_del_propio_dominio(self):
        # Si esto vuelve a devolver raw, el catálogo se re-ensucia solo con la
        # próxima foto que suba el dueño y el arreglo de datos no dura nada.
        src = DATA.read_text(encoding="utf-8")
        m = re.search(r"if \(res\.ok\) return ([^;]+);", src)
        self.assertIsNotNone(m, "no encontré lo que devuelve subirImagenAGitHub")
        self.assertIn(
            CANON, m.group(1),
            "subirImagenAGitHub debe devolver la URL de tiendamax.org: con la de "
            "raw, cada foto nueva vuelve a meter un segundo host en el catálogo",
        )

    def test_hay_reintento_para_la_ventana_de_despliegue(self):
        # La contrapartida de guardar la URL canónica: la foto existe en el repo
        # pero Pages tarda en servirla. Sin el reintento, el panel enseña un
        # hueco justo después de subir y parece que la subida falló.
        src = DATA.read_text(encoding="utf-8")
        self.assertIn("tmReintento", src,
                      "falta el reintento que cubre la ventana de despliegue")
        self.assertIn("raw.githubusercontent", src,
                      "el reintento tiene que ir contra raw, que sirve el fichero "
                      "desde el commit")

    def test_las_fotos_referenciadas_existen(self):
        disco = {p.name for p in (RAIZ / "imagenes").glob("*") if p.is_file()}
        rotas = sorted({u for _, u in _urls("productos.json")
                        if (m := re.search(r"/imagenes/([\w.\-]+)$", u))
                        and m.group(1) not in disco})
        self.assertEqual([], rotas, "el catálogo apunta a fotos que no están en el repo")
