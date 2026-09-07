"""El modal de editar un producto (admin.html, apEdit / apEditSave).

La subcategoría no estaba en el modal, y eso rompía por dos lados a la vez:

  · No había forma de ponérsela ni de corregirla a un producto ya creado. El
    formulario de alta sí la pedía, así que los productos viejos —o los que se
    dieron de alta antes de que existiera la subcategoría de su categoría— se
    quedaban sin ella para siempre, y en la tienda caían en el chip "Otros".

  · Cambiar la categoría desde el modal dejaba la subcategoría vieja pegada al
    producto. Un router movido a ENERGIA se quedaba en "ROUTERS", una
    subcategoría que en ENERGIA no existe: la parrilla filtraba por un chip que
    no estaba y el producto no salía por ningún lado. Es el mismo fallo que
    tenía la tira de la tienda al cambiar de categoría.

Y lo que NO puede hacer al arreglarlo: borrar una subcategoría que el producto
ya trae y que no esté en la lista de su categoría. Es un dato real del catálogo
—puede venir de una importación o de una lista que cambió— y perderlo al
guardar sería destruir información que nadie pidió tocar.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "admin.html"


class SubcategoriaEnElModalTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.html = ADMIN.read_text(encoding="utf-8")
        ini = cls.html.index("function apEditFillSubcats(")
        cls.fill = cls.html[ini:cls.html.index("\nasync function apEditSave(", ini)]
        g = cls.html[cls.html.index("async function apEditSave("):]
        cls.guardar = g[:g.index("\nfunction ")]
        e = cls.html[cls.html.index("function apEdit(id)"):]
        cls.abrir = e[:e.index("\nfunction ")]

    def test_el_modal_tiene_el_campo(self):
        self.assertRegex(
            self.html, r'<select[^>]*id="pedit-subcat"',
            "el modal de editar perdió el campo de subcategoría: no hay forma "
            "de ponérsela a un producto ya creado.",
        )

    def test_se_rellena_con_la_del_producto_al_abrir(self):
        self.assertIn("apEditFillSubcats(p.subcategoria)", self.abrir,
                      "apEdit() abre el modal sin marcar la subcategoría que "
                      "el producto ya tiene: al guardar se perdería.")

    def test_cambiar_de_categoria_recarga_la_lista(self):
        self.assertRegex(
            self.html, r'id="pedit-cat"[^>]*onchange="apEditFillSubcats\(\)"',
            "cambiar la categoría no recarga las subcategorías: el producto "
            "se queda con una que en su categoría nueva no existe.",
        )

    def test_se_guarda_y_se_puede_dejar_vacia(self):
        self.assertIn("pedit-subcat", self.guardar,
                      "apEditSave() no lee el campo: elegir subcategoría no "
                      "haría nada.")
        self.assertRegex(
            self.guardar, r"if\(_sub\) p\.subcategoria=_sub; else delete p\.subcategoria;",
            "dejarla en '—' tiene que quitar la subcategoría, no guardar una "
            "cadena vacía que luego se lee como un chip sin nombre.",
        )

    def test_una_subcategoria_fuera_de_lista_no_se_pierde(self):
        self.assertIn("lista.unshift(actual)", self.fill,
                      "si el producto trae una subcategoría que no está en la "
                      "lista de su categoría, hay que ofrecerla igual: si no, "
                      "al guardar se borra un dato real sin avisar.")


class ComisionPorProductoTest(unittest.TestCase):
    """"💵 Comisiones ganadas" sumaba las dos monedas en el mismo número.

    El total de arriba ya las separaba (Ganancia USD / Ganancia MN), pero esta
    lista —la que dice qué producto deja más— las juntaba: un producto con la
    comisión en 300 MN aparecía como "$300", por delante de uno que deja 12
    dólares de verdad.
    """

    @classmethod
    def setUpClass(cls):
        html = ADMIN.read_text(encoding="utf-8")
        ini = html.index("function renderVentas(")
        cls.ventas = html[ini:html.index("\n// Anular una venta", ini)]

    def test_se_acumula_por_moneda(self):
        self.assertRegex(
            self.ventas, r"comisPorProd\[nm\]=\{usd:0,mn:0\}",
            "comisPorProd volvió a ser un solo número por producto.",
        )
        self.assertRegex(
            self.ventas, r"r\[mon==='MN'\?'mn':'usd'\]\+=g",
            "la comisión no se reparte por su moneda.",
        )

    def test_se_pinta_con_su_moneda(self):
        self.assertIn("dosMonedas(c)", self.ventas,
                      "la lista de comisiones vuelve a escribir un número sin "
                      "decir de qué moneda es.")

    def test_el_orden_no_compara_monedas_distintas(self):
        self.assertRegex(
            self.ventas, r"\(b\[1\]\.usd-a\[1\]\.usd\)\|\|\(b\[1\]\.mn-a\[1\]\.mn\)",
            "ordenar sumando las dos monedas pondría primero al que cobra en "
            "pesos solo porque el número es más grande.",
        )


if __name__ == "__main__":
    unittest.main()
