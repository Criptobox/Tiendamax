"""
Vigila el grafo de enlaces entre index.html, /c/ y /p/.

Por qué hace falta un test para esto: las 131 páginas estáticas existían y
estaban en el sitemap, pero mal conectadas. Cinco categorías (audio, gym,
juegos, pc-y-laptops, ropa) no las enlazaba nadie, y las 118 fichas de producto
no enlazaban a ningún sitio salvo el home y WhatsApp. Nada falla cuando eso
pasa: las páginas se sirven bien, los tests pasan, y simplemente Google las
trata como páginas de segunda porque no apunta nadie a ellas.

Es además el fallo que se repite solo: cada categoría nueva nace huérfana si
nadie se acuerda de enlazarla.
"""
import os
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
P_DIR = RAIZ / "p"
C_DIR = RAIZ / "c"

RE_C = re.compile(r'href="[^"]*?/c/([\w\-]+)\.html"')
RE_P = re.compile(r'href="[^"]*?/p/(producto-\d+)\.html"')


def _paginas(d: Path) -> set[str]:
    if not d.is_dir():
        return set()
    return {f[:-5] for f in os.listdir(d) if f.endswith(".html")}


def _leer(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")


def _fuentes():
    """Todo lo que puede enlazar: el home y las propias páginas generadas."""
    yield RAIZ / "index.html"
    for d in (C_DIR, P_DIR):
        if d.is_dir():
            for f in sorted(os.listdir(d)):
                if f.endswith(".html"):
                    yield d / f


class EnlacesEntrantesTest(unittest.TestCase):
    """Ninguna página generada puede quedar sin que nadie la enlace."""

    @classmethod
    def setUpClass(cls):
        cls.cats, cls.prods = _paginas(C_DIR), _paginas(P_DIR)
        cls.entra_c, cls.entra_p = set(), set()
        for f in _fuentes():
            if not f.exists():
                continue
            txt = _leer(f)
            propia = f.stem
            # Un enlace de una página a sí misma (el canonical) no cuenta.
            cls.entra_c |= {s for s in RE_C.findall(txt) if not (f.parent == C_DIR and s == propia)}
            cls.entra_p |= {s for s in RE_P.findall(txt) if not (f.parent == P_DIR and s == propia)}

    def test_toda_categoria_tiene_quien_la_enlace(self):
        self.assertTrue(self.cats, "no hay páginas en /c/; ¿corrió regenerate_artifacts.py?")
        self.assertEqual(set(), self.cats - self.entra_c,
                         "categorías que solo existen en el sitemap, sin enlaces entrantes")

    def test_toda_ficha_tiene_quien_la_enlace(self):
        self.assertTrue(self.prods, "no hay páginas en /p/; ¿corrió regenerate_artifacts.py?")
        self.assertEqual(set(), self.prods - self.entra_p,
                         "fichas de producto sin enlaces entrantes")


class EnlacesSalientesTest(unittest.TestCase):
    """Ninguna ficha puede ser un callejón sin salida."""

    def test_las_fichas_salen_a_su_categoria_o_a_otras_fichas(self):
        sin_salida = []
        for f in sorted(P_DIR.glob("producto-*.html")):
            txt = _leer(f)
            otras = {s for s in RE_P.findall(txt) if s != f.stem}
            if not RE_C.findall(txt) and not otras:
                sin_salida.append(f.name)
        self.assertEqual([], sin_salida,
                         "fichas que no enlazan ni a su categoría ni a otro producto")

    def test_las_fichas_llevan_migas_de_pan(self):
        faltan = [f.name for f in sorted(P_DIR.glob("producto-*.html"))
                  if 'class="tm-migas"' not in _leer(f)]
        self.assertEqual([], faltan, "fichas sin migas de pan")

    def test_las_fichas_declaran_breadcrumblist(self):
        # Es lo que hace que Google enseñe la ruta en vez de la URL cruda.
        faltan = [f.name for f in sorted(P_DIR.glob("producto-*.html"))
                  if "BreadcrumbList" not in _leer(f)]
        self.assertEqual([], faltan, "fichas sin BreadcrumbList en JSON-LD")


class HomeTest(unittest.TestCase):
    def test_el_home_enlaza_todas_las_categorias(self):
        idx = _leer(RAIZ / "index.html")
        enlazadas = set(RE_C.findall(idx))
        self.assertEqual(set(), self.__class__._cats() - enlazadas,
                         "categorías con página propia que el home no enlaza")

    def test_el_bloque_del_pie_conserva_sus_marcas(self):
        # regenerate_home_nav() no toca nada si no las encuentra: sin marcas la
        # lista se quedaría congelada y volveríamos al punto de partida.
        idx = _leer(RAIZ / "index.html")
        self.assertIn("<!-- tm:cats-inicio -->", idx)
        self.assertIn("<!-- tm:cats-fin -->", idx)

    @staticmethod
    def _cats():
        return _paginas(C_DIR)


if __name__ == "__main__":
    unittest.main()
