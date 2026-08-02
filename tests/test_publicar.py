"""Plantillas de texto y registro de publicaciones (js/src/tm-publicar.src.js).

Dos propiedades que importan y no son obvias:

1. Las plantillas y el registro viven en localStorage, NO en Firebase. Meterlos
   en la base obligaría a abrirlos a escritura anónima —no hay autenticación—
   y ya sabemos cómo acaba eso: cualquiera reescribiendo o borrando.

2. Los enlaces que salen de una plantilla tienen que llevar el mismo
   utm_source que el resto del panel. Sin eso, todo lo publicado desde aquí
   aparecería como tráfico directo en Analytics y no se sabría qué red funciona.
"""
import json
import re
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODULO = RAIZ / "js" / "src" / "tm-publicar.src.js"
ADMIN = RAIZ / "admin.html"
CATALOG = RAIZ / "js" / "src" / "tm-catalog.src.js"


class ModuloTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.src = MODULO.read_text(encoding="utf-8")

    def test_esta_en_el_bundle(self):
        # Si no está en ORDEN, el módulo no se sirve nunca y el panel llamaría
        # a funciones inexistentes.
        orden = (RAIZ / "scripts" / "build_js_bundle.py").read_text(encoding="utf-8")
        self.assertIn('"tm-publicar.js"', orden)

    def test_no_escribe_en_firebase(self):
        for prohibido in ("firebaseio", "rtdbBase", "_fbRtdbUrl", "fetch("):
            self.assertNotIn(prohibido, self.src,
                             f"{prohibido}: esto debe quedarse en el dispositivo")

    def test_no_toca_el_generador_de_carteles(self):
        # Se pidió explícitamente no cambiar los diseños del generador. Se mira
        # el código, no la cabecera: ahí la palabra sale al explicar justo eso.
        codigo = self.src.split("*/", 1)[-1].lower()
        for prohibido in ("cartel", "canvas", "todataurl", "drawimage"):
            self.assertNotIn(prohibido, codigo)

    def test_los_enlaces_heredan_el_utm_del_panel(self):
        # pubUrl/pubWaLink ya añaden utm_source; duplicar esa lógica aquí
        # acabaría con dos formatos de enlace distintos.
        self.assertIn("typeof pubUrl === 'function'", self.src)
        self.assertIn("typeof pubWaLink === 'function'", self.src)
        self.assertIn("typeof pubWaNum === 'function'", self.src)

    def test_una_variable_desconocida_no_se_borra(self):
        # Si se sustituyera por vacío, un {texto} escrito a mano desaparecería
        # del post sin que el admin se entere.
        i = self.src.index("function tmAplicarPlantilla")
        cuerpo = self.src[i:i + 400]
        self.assertIn("hasOwnProperty", cuerpo)
        self.assertIn(": m", cuerpo, "lo desconocido se deja tal cual")

    def test_el_registro_tiene_tope(self):
        # Sin tope, el log crece hasta reventar la cuota de localStorage y se
        # lleva por delante el resto de datos del admin.
        self.assertIn("TM_PUBLOG_MAX", self.src)
        self.assertIn("log.slice(-TM_PUBLOG_MAX)", self.src)

    def test_los_nunca_publicados_cuentan_como_olvidados(self):
        # Son justo los que se pasan por alto; si se excluyeran por no tener
        # fecha, el aviso serviría de poco.
        i = self.src.index("function tmProductosSinPublicar")
        cuerpo = self.src[i:i + 400]
        self.assertIn("d === null", cuerpo)


class RegistroAutomaticoTest(unittest.TestCase):
    """El log se rellena solo. Uno que haya que rellenar a mano acaba vacío."""

    def test_copiar_para_una_red_queda_registrado(self):
        src = CATALOG.read_text(encoding="utf-8")
        for fn, red in (("copiarParaFacebook", "'fb'"),
                        ("copiarParaRevolico", "'revolico'")):
            i = src.index("function " + fn)
            cuerpo = src[i:i + 1600]
            self.assertIn("tmRegistrarPublicacion", cuerpo, f"{fn} no registra")
            self.assertIn(red, cuerpo)

    def test_se_registra_aunque_falle_el_portapapeles(self):
        # Va ANTES del writeText: si el navegador bloquea el portapapeles, el
        # admin igual abre la red y publica, y el registro debe reflejarlo.
        src = CATALOG.read_text(encoding="utf-8")
        i = src.index("function copiarParaFacebook")
        cuerpo = src[i:i + 1600]
        self.assertLess(cuerpo.index("tmRegistrarPublicacion"),
                        cuerpo.index("clipboard.writeText"))

    def test_usar_una_plantilla_tambien_registra(self):
        admin = ADMIN.read_text(encoding="utf-8")
        i = admin.index("async function plCopiar")
        cuerpo = admin[i:i + 900]
        self.assertIn("tmRegistrarPublicacion", cuerpo)


class InterfazTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.admin = ADMIN.read_text(encoding="utf-8")

    def test_las_pestanas_nuevas_existen(self):
        self.assertIn("pill('plantillas'", self.admin)
        self.assertIn("pill('historial'", self.admin)
        self.assertIn("PUB_VIEW==='plantillas'", self.admin)
        self.assertIn("PUB_VIEW==='historial'", self.admin)

    def test_no_se_perdio_ninguna_pestana_anterior(self):
        for v in ("compartir", "categoria", "banners", "oferta"):
            self.assertIn(f"pill('{v}'", self.admin)

    def test_los_handlers_llegan_al_onclick(self):
        # Ese <script> va dentro de un IIFE: lo declarado ahí no es global y el
        # onclick del HTML no lo encuentra si no se expone a mano.
        for fn in ("plNueva", "plEditar", "plDuplicar", "plBorrar",
                   "plGuardar", "plCopiar", "plInsertar", "plCerrarEditor"):
            self.assertIn(f'onclick="{fn}(', self.admin, f"{fn} sin botón")
            self.assertIn(f"window.{fn}={fn}", self.admin, f"{fn} sin exponer")

    def test_el_texto_del_usuario_va_escapado(self):
        # El nombre de una plantilla lo escribe el admin y se pinta con
        # innerHTML; sin escapar, unas comillas rompen la lista entera.
        i = self.admin.index("function plRender()")
        cuerpo = self.admin[i:i + 2000]
        self.assertIn("esc(t.nombre)", cuerpo)
        self.assertIn("esc(previa)", cuerpo)


if __name__ == "__main__":
    unittest.main()
