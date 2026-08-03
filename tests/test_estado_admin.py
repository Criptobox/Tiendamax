"""
El catálogo del admin vive en tres nombres a la vez: PRODUCTOS (admin.html),
window.productos y el bareword `productos` del motor (un `let` dentro de
tm-data.src.js). Los tres tienen que apuntar SIEMPRE al mismo array.

Antes se mantenían iguales llamando a syncProductos() a mano detrás de cada
asignación — once llamadas repartidas por el fichero. Bastaba con olvidar una
para que el admin escribiera en un array y el motor leyera otro, y eso no falla
de forma visible: no hay error, la pantalla se ve bien, y el daño aparece
después. Ya pasó: imagenEnUso() leía `productos` mientras el admin escribía en
PRODUCTOS, respondió "esta foto no la usa nadie" y se borró la única foto de un
producto.

Ahora PRODUCTOS es una propiedad con setter que propaga a los tres sitios, así
que la desincronización no depende de que alguien se acuerde. Estos tests
vigilan que siga siendo así.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = RAIZ / "admin.html"


class EstadoUnificadoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = ADMIN.read_text(encoding="utf-8")

    def test_productos_no_vuelve_a_ser_una_variable_suelta(self):
        # Un `let PRODUCTOS` local se comería el setter: las asignaciones no
        # propagarían y volveríamos exactamente al bug de la foto borrada.
        for patron in (r"\blet\s+PRODUCTOS\b", r"\bvar\s+PRODUCTOS\b", r"\bconst\s+PRODUCTOS\b"):
            self.assertIsNone(
                re.search(patron, self.html),
                "PRODUCTOS vuelve a declararse como variable local; eso anula el "
                "setter que mantiene sincronizados window.productos y el motor",
            )

    def test_existe_el_setter_que_propaga(self):
        m = re.search(r"Object\.defineProperty\(window,\s*['\"]PRODUCTOS['\"]", self.html)
        self.assertIsNotNone(m, "falta el defineProperty de window.PRODUCTOS")
        # El setter tiene que tocar los DOS destinos, no solo uno.
        bloque = self.html[m.start():m.start() + 900]
        self.assertIn("window.productos", bloque,
                      "el setter no actualiza window.productos")
        self.assertRegex(bloque, r"productos\s*=\s*_PRODUCTOS",
                         "el setter no actualiza el bareword del motor")

    def test_el_setter_normaliza_lo_que_no_sea_array(self):
        # cargarDatos() llega a asignar el resultado de un fetch fallido; sin
        # normalizar, un null dejaba el catálogo en un valor que revienta al
        # primer .map() y el admin se queda en blanco.
        m = re.search(r"Object\.defineProperty\(window,\s*['\"]PRODUCTOS['\"]", self.html)
        bloque = self.html[m.start():m.start() + 900]
        self.assertIn("Array.isArray(v)", bloque,
                      "el setter no comprueba que le pasen un array")

    def test_syncproductos_sigue_existiendo(self):
        # La llaman once sitios; quitarla sería tocar mucho para no ganar nada,
        # y sigue haciendo falta para el empujón de después de cargar el motor.
        self.assertRegex(self.html, r"function\s+syncProductos\s*\(")


if __name__ == "__main__":
    unittest.main()
