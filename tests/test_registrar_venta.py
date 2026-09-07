"""Registrar venta: el desplegable de productos y la comisión rebajable.

Dos cosas que se rompen en silencio si alguien toca esta pantalla:

1. Los productos se eligen tocando una tarjeta, filtrando con la tira de
   categorías, y todo se arma desde PRODUCTOS cada vez que se pinta la pestaña.
   Escrito a mano en el HTML se quedaría viejo en cuanto se den de alta o de
   baja productos, y nadie lo notaría: la lista seguiría apareciendo, solo que
   sin lo nuevo.

   No puede volver a ser un <select>: en Android el desplegable nativo se abre
   a pantalla completa, con un radio al lado de cada opción y el nombre partido
   en tres líneas. Funcionaba, pero no había forma de leerlo.

2. La comisión de cada línea se puede rebajar ahí mismo: cuando al cliente se
   le hace un descuento, ese dinero sale de lo que gana el vendedor, no del
   precio del catálogo. Se toca SOLO en esa venta, sin alterar la comisión del
   producto, y lo rebajado tiene que ser lo que se registre. Si el formulario
   volviera a mandar `p.comision`, la venta quedaría anotada con una ganancia
   que nunca se cobró y el descuento desaparecería de los informes.

   El campo NO puede repintar la lista en cada tecla: al hacerlo se perdía el
   cursor y el punto de los decimales, así que escribir "7.5" dejaba 75 —diez
   veces la comisión, y sin ningún error a la vista—.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "admin.html"
MOTOR = RAIZ / "js" / "src" / "tm-ui.src.js"


class SelectorDeProductoTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.html = ADMIN.read_text(encoding="utf-8")
        ini = cls.html.index("function ventaRenderPicker(")
        cls.picker = cls.html[ini:cls.html.index("function ventaAdd(", ini)]

    def test_los_productos_se_eligen_en_tarjetas_y_no_escribiendo(self):
        self.assertIn('id="venta-lista"', self.html,
                      "el formulario de registrar venta perdió la lista de "
                      "tarjetas.")
        self.assertIn("vp-card", self.picker,
                      "los productos ya no se pintan como tarjetas.")
        for resto in ("venta-buscar", "venta-resultados", "ventaBuscar"):
            self.assertNotIn(
                resto, self.html,
                f"quedó '{resto}' del buscador anterior: código muerto que "
                "se lee como si aún hiciera algo.",
            )

    def test_no_vuelve_al_desplegable_nativo(self):
        """Se veía mal en el móvil, que es donde se registran las ventas."""
        self.assertNotRegex(
            self.html, r'<select[^>]*id="venta-producto"',
            "volvió el <select> nativo: en Android se abre a pantalla completa "
            "con un radio por opción y los nombres partidos en tres líneas.",
        )

    def test_se_filtra_por_categoria(self):
        self.assertIn('id="venta-cats"', self.html,
                      "desapareció la tira de categorías: con 138 productos "
                      "seguidos hay que bajar a mano hasta encontrar el que "
                      "se vendió.")
        self.assertIn("categoria", self.picker,
                      "el filtro dejó de mirar la categoría del producto.")
        self.assertIn("vp-cat", self.picker,
                      "las categorías ya no se pintan como chips.")

    def test_la_tarjeta_dice_precio_y_stock(self):
        for dato, porque in (
            ("moneyP(p)", "sin el precio hay que abrir el producto para saber "
                          "cuánto cobrar"),
            ("p.stock", "sin el stock se vende a ciegas lo que ya no queda"),
        ):
            self.assertIn(dato, self.picker, porque)

    def test_el_selector_se_rearma_al_pintar_la_pestana(self):
        cuerpo = self.html[self.html.index("function renderVentas("):]
        cuerpo = cuerpo[:cuerpo.index("\nfunction ")]
        self.assertIn("ventaRenderPicker()", cuerpo,
                      "renderVentas() ya no rearma el selector: se queda con "
                      "el catálogo de cuando se cargó la página.")

    def test_la_tarjeta_marca_lo_que_ya_va_en_la_venta(self):
        """Tocar dos veces el mismo producto suma una unidad. Sin marca en la
        tarjeta no hay forma de saber si el primer toque entró."""
        self.assertIn("VENTA_CART.find", self.picker,
                      "la tarjeta no mira el carrito, así que no puede decir "
                      "cuántas unidades van.")
        cuerpo = self.html[self.html.index("function ventaAdd("):]
        cuerpo = cuerpo[:cuerpo.index("\nfunction ")]
        self.assertIn("ventaRenderPicker()", cuerpo,
                      "agregar no repinta las tarjetas: la marca se queda "
                      "en el número anterior.")


class ComisionRebajableTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.html = ADMIN.read_text(encoding="utf-8")
        ini = cls.html.index("function ventaAdd(")
        cls.venta = cls.html[ini:cls.html.index("function ventaRegistrar(")]
        reg = cls.html[cls.html.index("function ventaRegistrar("):]
        cls.registrar = reg[:reg.index("\nfunction ")]

    def test_la_linea_guarda_la_comision_original_para_poder_avisar(self):
        self.assertIn("comisionOriginal", self.venta,
                      "sin la comisión original no se puede avisar de que la "
                      "de esta venta va rebajada, y una rebaja por error pasa "
                      "inadvertida.")

    def test_el_campo_de_comision_no_repinta_la_lista_al_escribir(self):
        cuerpo = self.venta[self.venta.index("function ventaCartComision("):]
        cuerpo = cuerpo[:cuerpo.index("\nfunction ")]
        self.assertNotIn(
            "ventaRenderCart(", cuerpo,
            "ventaCartComision() vuelve a repintar la lista entera en cada "
            "tecla: eso movía el cursor y se comía el punto, y \"7.5\" "
            "quedaba como 75.",
        )
        self.assertIn("ventaRenderTotales()", cuerpo,
                      "al cambiar la comisión hay que refrescar los totales.")

    def test_la_comision_rebajada_es_la_que_se_registra(self):
        self.assertRegex(
            self.registrar, r"comision\s*:\s*it\.comision",
            "ventaRegistrar() no manda la comisión de la línea: la venta "
            "quedaría anotada con la del producto y el descuento se perdería.",
        )

    def test_los_totales_del_carrito_no_mezclan_monedas(self):
        cuerpo = self.venta[self.venta.index("function ventaRenderTotales("):]
        self.assertIn("dosMonedas(", cuerpo,
                      "los totales del carrito volvieron a un solo número: "
                      "mezclan pesos con dólares.")
        self.assertIn("comisionMoneda", cuerpo,
                      "la ganancia del carrito no separa por la moneda de la "
                      "comisión, que puede no ser la del precio.")


class GananciaGuardadaTest(unittest.TestCase):
    """La comisión de la venta se guarda partida, igual que el total."""

    @classmethod
    def setUpClass(cls):
        cls.src = MOTOR.read_text(encoding="utf-8")

    def test_la_ganancia_se_separa_por_su_propia_moneda(self):
        self.assertRegex(
            self.src, r"const ganancia = detalle\.reduce\([^\n]*comisionMoneda === 'MN' \? 0 :",
            "registrarVentaPedido() vuelve a sumar toda la comisión junta: "
            "300 MN quedan anotados como 300 dólares.",
        )
        self.assertRegex(
            self.src, r"const gananciaMN = detalle\.reduce\(",
            "falta gananciaMN: la comisión en pesos se pierde.",
        )
        self.assertIn("gananciaMN: gananciaMN", self.src,
                      "la venta no guarda gananciaMN.")

    def test_mira_comisionMoneda_y_no_la_moneda_del_precio(self):
        """Un producto en USD puede dejar la comisión en pesos, y al revés."""
        linea = re.search(r"const ganancia = detalle\.reduce\([^\n]*", self.src)
        self.assertIsNotNone(linea)
        self.assertIn("comisionMoneda", linea.group(0),
                      "la ganancia se está repartiendo por la moneda del "
                      "precio en vez de la de la comisión.")


if __name__ == "__main__":
    unittest.main()
