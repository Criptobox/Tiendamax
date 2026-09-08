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


class TonoPorCategoriaTest(unittest.TestCase):
    """El fondo del anuncio lleva el color de la categoría del producto.

    Antes salían todos con el mismo naranja quemado y en una lista de Revólico
    no había forma de distinguirlos de un golpe de vista.

    Lo que NO puede cambiar es el borde dorado ni el "TiendaMax" naranja de
    abajo: son los que hacen que el anuncio se reconozca como de la tienda
    entre los cientos que hay publicados. Si cambiara todo, se gana variedad y
    se pierde la marca, que es peor negocio.
    """

    @classmethod
    def setUpClass(cls):
        cls.src = MODULO.read_text(encoding="utf-8")
        ini = cls.src.index("async function _dibujarImagenAnuncio(")
        cls.dibujo = cls.src[ini:cls.src.index("// ── end canvas helpers", ini)]

    def test_el_fondo_sale_de_la_categoria(self):
        self.assertIn("_revTonoCategoria(producto)", self.dibujo,
                      "el degradado del fondo dejó de mirar la categoría.")
        self.assertRegex(
            self.src, r"tmColorCategoria",
            "el tono tiene que salir de la tabla de colores por categoría que "
            "ya usan los carteles, no de una lista aparte que se desincroniza.",
        )

    def test_una_categoria_sin_color_no_pierde_el_fondo(self):
        self.assertRegex(
            self.src, r"_REV_TONO_POR_DEFECTO\s*=\s*'#c0390a'",
            "sin respaldo, una categoría que no esté en la tabla se quedaría "
            "sin fondo en vez de salir como salía antes.",
        )
        self.assertIn("c || _REV_TONO_POR_DEFECTO", self.src,
                      "_revTonoCategoria() no cae al naranja de siempre.")

    def test_los_colores_claros_se_bajan_al_peso_del_naranja(self):
        """ENERGIA es amarillo y JUEGOS mostaza: puestos tal cual, el fondo
        competía con la foto y la franja negra de abajo perdía contraste."""
        self.assertIn("_revOscurecer(", self.dibujo,
                      "el tono de categoría entra sin normalizar su "
                      "luminancia.")
        self.assertRegex(
            self.src, r"_REV_LUM\s*=\s*\(0\.2126\*0xc0",
            "la referencia de luminancia tiene que ser la del naranja "
            "original, que es la que ya estaba probada.",
        )

    def test_la_marca_no_cambia_de_color(self):
        self.assertIn("rgba(201,169,110,.8)", self.dibujo,
                      "el borde dorado dejó de ser fijo.")
        self.assertRegex(
            self.dibujo, r"fillStyle = '#FF6B35';\s*\n\s*ctx\.fillText\('TiendaMax'",
            "el rótulo TiendaMax dejó de ir en el naranja de la marca.",
        )


class FotoDelAnuncioTest(unittest.TestCase):
    """La foto del lienzo tenía un solo intento y fallaba en silencio.

    El resto del sitio reintenta desde raw.githubusercontent cuando una <img>
    no carga; el lienzo del anuncio no tenía nada de eso. Un fallo pasajero —y
    en un móvil cubano los hay— dejaba ese producto con el marcador de cámara,
    y el anuncio se podía publicar así sin que nada lo dijera: es la única
    parte del panel donde el error no se ve, porque el hueco de la foto se
    rellena con un degradado que parece decoración.

    Tampoco había timeout: una petición colgada dejaba la promesa sin resolver
    y el dibujo no terminaba nunca.
    """

    @classmethod
    def setUpClass(cls):
        cls.src = MODULO.read_text(encoding="utf-8")
        ini = cls.src.index("function _revIntentarImg(")
        cls.carga = cls.src[ini:cls.src.index("\n// El tono de fondo", ini)]

    def test_un_intento_no_puede_quedarse_colgado(self):
        self.assertIn("setTimeout(() => acabar(null)", self.carga,
                      "sin timeout, una petición que no responde deja el "
                      "anuncio a medio dibujar para siempre.")

    def test_una_imagen_que_decodifica_a_nada_cuenta_como_fallo(self):
        self.assertIn("img.naturalWidth && img.naturalHeight", self.carga,
                      "un onload con naturalWidth 0 haría que el lienzo "
                      "dibujara un rectángulo vacío creyendo que hay foto.")

    def test_reintenta_saltandose_la_cache(self):
        self.assertIn("'_r=' + Date.now()", self.carga,
                      "falta el segundo intento con parámetro nuevo: una "
                      "entrada de caché envenenada no se puede saltar de otra "
                      "forma.")

    def test_cae_al_espejo_de_github(self):
        self.assertIn("raw.githubusercontent.com/", self.carga,
                      "falta el tercer intento contra el espejo, que es de "
                      "donde salió la foto y lo que ya hace la tienda.")
        self.assertIn("localStorage.getItem('githubUser')", self.carga,
                      "el espejo se arma con el usuario y repo que el dueño "
                      "ya tiene guardados; inventarlos no serviría.")

    def test_sigue_pidiendo_la_imagen_con_cors(self):
        """Sin crossOrigin el lienzo queda tainted y toDataURL() lanza: se
        romperían «Copiar imagen» y «Descargar», que es para lo que existe."""
        self.assertIn(
            "crossOrigin = 'anonymous'", self.carga,
            "el cargador dejó de pedir la imagen con CORS: el lienzo quedaría "
            "tainted y no se podría exportar.",
        )

    def test_si_no_hay_foto_se_avisa_en_pantalla(self):
        self.assertIn('id="revImgAviso"', self.src,
                      "no hay dónde avisar de que la foto no cargó.")
        self.assertIn("return !_sinFoto;", self.src,
                      "_dibujarImagenAnuncio() no dice si la foto entró, así "
                      "que arriba no hay forma de saberlo.")
        self.assertRegex(
            self.src, r"_aviso\.style\.display = hayFoto \? 'none' : 'block'",
            "la vista previa no enciende el aviso cuando falta la foto: el "
            "anuncio se publicaría con el icono de cámara sin que se note.",
        )
