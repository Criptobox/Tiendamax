"""Fotos reemplazadas: conversión a WebP y borrado del fichero viejo.

Cada foto que se reemplaza dejaba la anterior en imagenes/ para siempre. Con
varias fotos por producto eso crece rápido y es peso muerto en cada clon.
"""
import re
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

TM_DATA = RAIZ / "js" / "src" / "tm-data.src.js"
TM_PRODUCT = RAIZ / "js" / "src" / "tm-product.src.js"
ADMIN = RAIZ / "admin.html"


class ConversionWebpTest(unittest.TestCase):
    """La subida convierte a WebP y nombra el fichero según el formato REAL.
    Un .jpg que por dentro es WebP rompe los previews de WhatsApp/Facebook,
    que validan el formato, no la extensión."""

    def test_comprime_intentando_webp_primero(self):
        src = TM_PRODUCT.read_text(encoding="utf-8")
        self.assertIn("canvas.toDataURL('image/webp'", src)

    def test_la_extension_sale_del_mime_real(self):
        src = TM_DATA.read_text(encoding="utf-8")
        self.assertIn(r"base64full.match(/^data:image\/(\w+);base64,/)", src)
        self.assertNotIn("'img_' + Date.now() + '.jpg'", src,
                         "la extensión no puede estar fija")

    def test_no_quedan_jpg_ni_png_en_el_repo(self):
        salida = subprocess.run(["git", "ls-files", "imagenes/"],
                                cwd=RAIZ, capture_output=True, text=True).stdout
        malos = [f for f in salida.split()
                 if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        self.assertEqual([], malos,
                         "la subida debe dejar solo .webp en imagenes/")


class BorradoDeImagenesTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.data = TM_DATA.read_text(encoding="utf-8")
        cls.admin = ADMIN.read_text(encoding="utf-8")

    def test_existen_las_funciones(self):
        for fn in ("_rutaImagenDesdeUrl", "borrarImagenDeGitHub", "imagenEnUso"):
            self.assertIn("function " + fn, self.data)

    def test_solo_borra_dentro_de_imagenes(self):
        # El patrón acota la ruta: sin esto, una URL manipulada podría
        # apuntar a cualquier fichero del repo y borrarlo.
        self.assertIn(r"(?:^|\/)imagenes\/([\w.\-]+\.(?:webp|jpg|jpeg|png))",
                      self.data)
        self.assertIn("indexOf('..')", self.data)

    def test_borra_tambien_la_miniatura(self):
        # optimize_images.py genera imagenes/thumbs/<mismo nombre>: borrar solo
        # el original deja otro huérfano equivalente.
        self.assertIn("imagenes/thumbs/", self.data)

    def test_comprueba_que_nadie_mas_la_usa(self):
        # Dos productos pueden compartir foto; borrarla rompería al otro.
        self.assertIn("imagenEnUso(u, id)", self.admin)

    def test_borra_al_guardar_no_al_pulsar_la_equis(self):
        # Si borrara en la ✕, cerrar sin guardar perdería la foto igual.
        self.assertIn("_peditFotosQuitadas.push(quitada)", self.admin)
        self.assertIn("_peditFotosQuitadas = []", self.admin)

    def test_el_guardado_no_depende_del_borrado(self):
        # El borrado va tras apSaveProds() y sin await en el flujo principal:
        # un token vencido no puede impedir guardar el producto.
        i_guardar = self.admin.index("apSaveProds(); apEditClose();")
        i_borrar = self.admin.index("borrarImagenDeGitHub === 'function'")
        self.assertLess(i_guardar, i_borrar,
                        "el borrado debe ir DESPUÉS de guardar")

    def test_al_borrar_un_producto_se_limpian_sus_fotos(self):
        self.assertIn("del producto borrada", self.admin)


class ScriptDeLimpiezaTest(unittest.TestCase):
    """scripts/limpiar_imagenes.py barre lo acumulado antes del arreglo."""

    def test_no_borra_sin_pedirselo(self):
        from limpiar_imagenes import main  # noqa: F401
        src = (RAIZ / "scripts" / "limpiar_imagenes.py").read_text(encoding="utf-8")
        self.assertIn('"--borrar", action="store_true"', src)
        self.assertIn("if not args.borrar:", src)

    def test_mira_tambien_las_paginas_de_producto(self):
        # Las 118 páginas de p/ referencian imágenes: sin mirarlas, el script
        # daría por huérfanas fotos que sí están vivas.
        src = (RAIZ / "scripts" / "limpiar_imagenes.py").read_text(encoding="utf-8")
        self.assertIn('"p/*.html"', src)


if __name__ == "__main__":
    unittest.main()
