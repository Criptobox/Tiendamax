"""
Tests del bot "Max" (js/src/tm-bot.src.js + js/src/tm-bot-cerebro.src.js).

Por qué existen: todos los fallos de este bot son SILENCIOSOS. El bot vivió
comentado en index.html durante meses porque su backend (/api/chat) no existe
en GitHub Pages y nadie vio un error: simplemente no había burbuja. Y cuando
la había, cada mensaje contestaba "tuve un problema de conexión".

La arquitectura de ahora tiene dos contratos frágiles que tampoco avisan al
romperse:
  · la cáscara crea el DOM y el cerebro lo busca por id — si se renombra un
    id de un lado, el cerebro no encuentra el panel y no pasa nada visible;
  · el cerebro se descarga por la URL del <meta name="tm-bot-cerebro">, que
    bump_versions.py mantiene con el hash del archivo — si el meta desaparece
    o deja de apuntar a un .js real, el chat se queda en "despertando…".

Corre sin red: solo lee archivos del repo.
"""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_js_bundle  # noqa: E402

CASCARA = ROOT / "js" / "src" / "tm-bot.src.js"
CEREBRO = ROOT / "js" / "src" / "tm-bot-cerebro.src.js"
INDEX = ROOT / "index.html"


class BotArchivosTest(unittest.TestCase):
    def test_fuentes_existen(self):
        for f in (CASCARA, CEREBRO):
            self.assertTrue(f.exists(), f"Falta el fuente del bot: {f}")

    def test_son_standalone_y_no_van_en_el_bundle(self):
        # El cerebro son ~130 KB minificados: meterlo en tm-bundle.js se los
        # cobraría a todo el que abre la tienda, incluido quien nunca toca el
        # chat. Va aparte y se carga a demanda.
        self.assertIn("tm-bot.js", build_js_bundle.STANDALONE)
        self.assertIn("tm-bot-cerebro.js", build_js_bundle.STANDALONE)
        self.assertNotIn("tm-bot.js", build_js_bundle.ORDEN)
        self.assertNotIn("tm-bot-cerebro.js", build_js_bundle.ORDEN)


class BotCableadoEnIndexTest(unittest.TestCase):
    def setUp(self):
        self.html = INDEX.read_text(encoding="utf-8")

    def test_script_de_la_burbuja_esta_activo(self):
        """El <script> del bot no puede estar dentro de un comentario HTML."""
        sin_comentarios = re.sub(r"<!--.*?-->", "", self.html, flags=re.S)
        self.assertRegex(
            sin_comentarios,
            r'<script[^>]+src="js/tm-bot\.js',
            "index.html no carga js/tm-bot.js fuera de un comentario: "
            "el bot no aparece en el sitio (así estuvo desactivado antes).",
        )

    def test_meta_del_cerebro_apunta_a_un_archivo_real(self):
        m = re.search(
            r'<meta\s+name="tm-bot-cerebro"\s+content="([^"?]+)\?v=([^"]*)"',
            self.html,
        )
        self.assertIsNotNone(
            m, 'Falta <meta name="tm-bot-cerebro" content="js/tm-bot-cerebro.js?v=...">'
        )
        destino = ROOT / m.group(1)
        self.assertTrue(
            destino.exists(),
            f"El meta apunta a {m.group(1)}, que no existe: el chat nunca "
            f"terminaría de cargar.",
        )

    def test_no_queda_rastro_del_backend_muerto(self):
        # tm-bot-api era la URL del Cloudflare Worker. Quedó vacía y por eso
        # cada mensaje caía en /api/chat (404 en GitHub Pages). Ya no se usa.
        self.assertNotIn(
            'name="tm-bot-api"',
            self.html,
            "Sigue el <meta tm-bot-api> del backend viejo: el bot ya responde "
            "en el navegador y ese meta solo confunde.",
        )


class BotContratoCascaraCerebroTest(unittest.TestCase):
    """La cáscara pinta el DOM; el cerebro lo busca por id. Si un id deja de
    coincidir, el cerebro revienta o se queda mudo, sin ningún error visible
    para el cliente."""

    IDS = [
        "tmBotBubble", "tmBotWelcome", "tmBotPanel", "tmBotBody",
        "tmBotInput", "tmBotSend", "tmBotClose", "tmBotReset",
        "tmBotQuickReplies", "tmBotSuggestions",
    ]

    def setUp(self):
        self.cascara = CASCARA.read_text(encoding="utf-8")
        self.cerebro = CEREBRO.read_text(encoding="utf-8")

    def test_la_cascara_crea_los_ids_que_el_cerebro_busca(self):
        for ident in self.IDS:
            if f"'#{ident}'" not in self.cerebro:
                continue  # el cerebro no lo usa: nada que garantizar
            self.assertIn(
                ident, self.cascara,
                f"El cerebro busca #{ident} pero la cáscara no lo crea.",
            )

    def test_la_cascara_expone_el_handshake(self):
        # El cerebro avisa por aquí que ya puede responder; sin esto el panel
        # se queda con el "despertando…" para siempre.
        self.assertIn("_tmBotAlCargarCerebro", self.cascara)
        self.assertIn("_tmBotAlCargarCerebro", self.cerebro)
        self.assertIn("_tmBotCerebroListo", self.cascara)
        self.assertIn("_tmBotCerebroListo", self.cerebro)


class BotLecturaDeGlobalesTest(unittest.TestCase):
    """El sitio declara `productos` y `wishlist` con `let` en el top level de
    scripts clásicos. `let` NO crea propiedad en window, así que window.productos
    es undefined SIEMPRE — y leerlo así no lanza error: el bot simplemente se
    queda sin catálogo y contesta con el localStorage viejo. Pasó."""

    def setUp(self):
        self.cerebro = CEREBRO.read_text(encoding="utf-8")
        # Los comentarios sí nombran window.productos: explican justamente
        # por qué no se puede usar. Se miran solo las líneas de código.
        self.codigo = "\n".join(
            re.sub(r"//.*", "", linea) for linea in self.cerebro.split("\n")
        )

    def test_no_lee_los_globales_por_window(self):
        for global_let in ("window.productos", "window.wishlist"):
            self.assertNotIn(
                global_let, self.codigo,
                f"{global_let} es undefined: el sitio lo declara con `let`. "
                f"Léelo por bareword con guardia de typeof.",
            )

    def test_lee_el_catalogo_por_bareword(self):
        self.assertIn("typeof productos !== 'undefined'", self.cerebro)
        self.assertIn("typeof wishlist !== 'undefined'", self.cerebro)


class BotSaltosDeLineaTest(unittest.TestCase):
    """Las respuestas se arman como texto con \\n (fichas, listas de viñetas,
    tabla de potencias de inversores). Sin white-space:pre-wrap el navegador
    los colapsa y cada respuesta sale como un ladrillo ilegible."""

    def test_los_mensajes_conservan_los_saltos(self):
        cascara = CASCARA.read_text(encoding="utf-8")
        bloque = re.search(r"\.tm-bot-msg\{[^}]*\}", cascara)
        self.assertIsNotNone(bloque, "No encuentro la regla .tm-bot-msg")
        self.assertIn(
            "white-space:pre-wrap", bloque.group(0),
            "Sin white-space:pre-wrap las respuestas del bot pierden todos "
            "los saltos de línea.",
        )

    def test_los_hijos_del_chat_no_se_encogen(self):
        # .tm-bot-body es flex column con scroll: sus hijos se encogen por
        # defecto y la tabla comparativa quedaba aplastada a 2px de alto.
        cascara = CASCARA.read_text(encoding="utf-8")
        self.assertIn(".tm-bot-body > *{flex-shrink:0;}", cascara)


class BotCarritoCompartidoTest(unittest.TestCase):
    """El bot no lleva carrito propio: usa el de la tienda. Si se le pusiera
    uno aparte, el cliente añadiría tres cosas por el chat y el icono 🛒 del
    header seguiría marcando cero."""

    @classmethod
    def setUpClass(cls):
        cls.cerebro = CEREBRO.read_text(encoding="utf-8")

    def test_lee_el_carrito_de_la_tienda_por_bareword(self):
        # `carrito` es un `let` de tm-config: window.carrito es undefined.
        self.assertIn("typeof carrito !== 'undefined'", self.cerebro)
        self.assertNotIn("window.carrito", self.cerebro)

    def test_no_guarda_un_carrito_propio(self):
        self.assertNotIn("tm_bot_carrito", self.cerebro)

    def test_delega_en_las_funciones_de_la_tienda(self):
        self.assertIn("typeof agregarAlCarrito === 'function'", self.cerebro)
        self.assertIn("typeof comprarCarrito === 'function'", self.cerebro)

    def test_la_ficha_ofrece_anadir_al_carrito(self):
        self.assertIn("🛍️ Añadir al carrito", self.cerebro)


class BotPruebaSocialTest(unittest.TestCase):
    """Las opiniones de resenas-cache.json son el activo más persuasivo del
    sitio y el bot no las usaba."""

    @classmethod
    def setUpClass(cls):
        cls.cerebro = CEREBRO.read_text(encoding="utf-8")

    def test_carga_las_resenas(self):
        self.assertIn("resenas-cache.json", self.cerebro)

    def test_las_pinta_tambien_en_los_agotados(self):
        # Los tres productos reseñados están agotados hoy: si el bloque solo
        # saliera en la rama con stock, no se vería ni una sola opinión.
        self.assertEqual(
            2, self.cerebro.count("body += bloqueResenas(p);"),
            "bloqueResenas debe aparecer en la rama con stock y en la de agotado",
        )


class BotRegistraInteresTest(unittest.TestCase):
    """Cada 'Pedir por WhatsApp' desde el chat tiene que llegar al panel de
    interesados del admin, igual que los del catálogo."""

    def test_avisa_al_admin(self):
        cerebro = CEREBRO.read_text(encoding="utf-8")
        self.assertIn("registrarInteres(p, 'bot')", cerebro)
        self.assertIn("tmRegistrarInteresWhatsApp", cerebro)


if __name__ == "__main__":
    unittest.main()
