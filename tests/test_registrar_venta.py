"""Registrar venta: el desplegable de productos y la comisión rebajable.

Dos cosas que se rompen en silencio si alguien toca esta pantalla:

1. La lista de productos es un <select> con un <optgroup> por categoría, y se
   rellena desde PRODUCTOS cada vez que se pinta la pestaña. Escrita a mano en
   el HTML se quedaría vieja en cuanto se den de alta o de baja productos, y
   nadie lo notaría: el desplegable seguiría abriéndose, solo que sin lo nuevo.

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


class DesplegableTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.html = ADMIN.read_text(encoding="utf-8")

    def test_el_formulario_usa_un_desplegable_y_no_un_buscador(self):
        self.assertRegex(
            self.html, r'<select[^>]*id="venta-producto"',
            "el formulario de registrar venta perdió el desplegable de "
            "productos.",
        )
        for resto in ("venta-buscar", "venta-resultados", "ventaBuscar"):
            self.assertNotIn(
                resto, self.html,
                f"quedó '{resto}' del buscador anterior: código muerto que "
                "se lee como si aún hiciera algo.",
            )

    def test_las_opciones_van_agrupadas_por_categoria(self):
        cuerpo = self.html[self.html.index("function ventaLlenarSelect("):]
        cuerpo = cuerpo[:cuerpo.index("\nfunction ")]
        self.assertIn("optgroup", cuerpo,
                      "las opciones ya no se agrupan: sin <optgroup> el "
                      "desplegable es una lista de 130 nombres seguidos.")
        self.assertIn("categoria", cuerpo,
                      "el agrupado dejó de mirar la categoría del producto.")

    def test_el_desplegable_se_rellena_al_pintar_la_pestana(self):
        cuerpo = self.html[self.html.index("function renderVentas("):]
        cuerpo = cuerpo[:cuerpo.index("\nfunction ")]
        self.assertIn("ventaLlenarSelect()", cuerpo,
                      "renderVentas() ya no rellena el desplegable: se queda "
                      "con el catálogo de cuando se cargó la página.")


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
