"""La vista previa de Revolico (js/revolico_integration.js).

El anuncio se arma con los datos del producto que el dueño acaba de tocar, y
esa pantalla es lo último que ve antes de copiar y pegar en Revolico. Si
muestra otro producto, lo que se publica es el título de uno con la
descripción de otro, y no hay nada en la pantalla que lo delate.

Eso es justo lo que pasaba. Al tocar «abrir Revolico» se guarda el producto en
`sessionStorage._tmRevActive` para poder reabrir la vista previa cuando el
dueño vuelve de la otra app —eso está bien y es lo que hace cómodo publicar
uno detrás de otro—. Pero ese guardado solo se borraba con la ✕: cerrando de
cualquier otra forma se quedaba puesto, y entonces CADA vuelta a la app
(`pageshow`, que en un móvil salta cada vez que se cambia de aplicación)
reabría el modal con aquel producto viejo, encima del que estuviera abierto.
Abriendo productos uno tras otro siempre salía la misma descripción.

Las dos propiedades que lo impiden, y por qué las dos hacen falta:

  · Abrir una vista previa borra el guardado pendiente. Sin esto, el modal
    nuevo nace ya condenado a que lo pisen.
  · El restaurador solo reabre SU producto: compara el id guardado con el que
    el modal lleva escrito. Sin esto, basta que el guardado se ponga otra vez
    (el dueño toca «abrir Revolico» en A y luego abre B) para volver al fallo.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODULO = RAIZ / "js" / "revolico_integration.js"


class VistaPreviaRevolicoTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.src = MODULO.read_text(encoding="utf-8")
        ini = cls.src.index("function previsualizarRevolico(")
        cls.abrir = cls.src[ini:cls.src.index("\nasync function copiarRevTitulo", ini)]
        cls.restaurador = cls.src[cls.src.index("addEventListener('pageshow'"):]

    def test_abrir_una_vista_previa_borra_el_guardado_pendiente(self):
        self.assertIn(
            "sessionStorage.removeItem('_tmRevActive')", self.abrir,
            "previsualizarRevolico() ya no borra _tmRevActive al abrir: el "
            "restaurador puede pisar este modal con un producto anterior.",
        )

    def test_el_modal_lleva_escrito_de_que_producto_es(self):
        self.assertRegex(
            self.abrir, r"modal\.dataset\.productoId\s*=",
            "sin el id en el modal, el restaurador no puede saber si el que "
            "está abierto es el suyo.",
        )

    def test_el_restaurador_solo_reabre_su_propio_producto(self):
        self.assertRegex(
            self.restaurador, r"dataset\.productoId[^\n]*!==[^\n]*savedId"
                              r"|savedId[^\n]*!==[^\n]*dataset\.productoId",
            "el manejador de pageshow reabre el producto guardado sin "
            "comprobar cuál está abierto: vuelve a pisar el modal.",
        )
        # Y no puede actuar si no hay modal que restaurar.
        self.assertRegex(
            self.restaurador, r"if\s*\(\s*!m\b",
            "el restaurador tiene que rendirse cuando no hay modal en el DOM.",
        )

    def test_la_descripcion_sale_del_producto_y_no_de_un_texto_fijo(self):
        """El cuerpo del anuncio es `producto.descripcion`, no una plantilla
        común: si alguien lo cambia por texto fijo, todos los anuncios quedan
        iguales y eso no se nota hasta verlos publicados."""
        cuerpo = self.src[self.src.index("function _textoRevolico("):]
        cuerpo = cuerpo[:cuerpo.index("\nfunction ")]
        self.assertIn("producto.descripcion", cuerpo,
                      "_textoRevolico() dejó de usar la descripción del "
                      "producto.")
        self.assertIn("producto.nombre", cuerpo,
                      "_textoRevolico() dejó de usar el nombre del producto.")

    def test_cerrar_con_la_equis_limpia_el_guardado(self):
        cerrar = self.src[self.src.index("function cerrarRevPreview("):]
        cerrar = cerrar[:cerrar.index("\n}") + 2]
        self.assertIn("sessionStorage.removeItem('_tmRevActive')", cerrar,
                      "cerrarRevPreview() tiene que soltar el producto "
                      "guardado o el restaurador lo reabre solo.")


if __name__ == "__main__":
    unittest.main()
