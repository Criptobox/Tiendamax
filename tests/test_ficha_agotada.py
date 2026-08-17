"""Las fichas /p/ de un producto agotado.

Estas páginas son la entrada desde Google y hasta ahora enseñaban los mismos
dos botones hubiera existencias o no: sobre un "Agotado" ofrecían "Ver en
TiendaMax" —que no promete nada a quien acaba de leer que no lo tienes— y un
WhatsApp escrito como "me interesa", o sea pedir algo que no se puede vender.
El dueño recibía la pregunta de cuándo vuelve, que tampoco sabe contestar.

Ahora la pregunta va al revés: el cliente deja su WhatsApp y avisa la tienda.
Lo que se vigila aquí es que esa escritura pueda ENTRAR —la regla de
/lista_espera es estricta y un rechazo ahí es mudo: el cliente ve "guardando" y
se queda sin apuntar— y que las fichas con stock no carguen el JavaScript, que
es lo que las mantiene rápidas en 3G.
"""
import json
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

REGLAS = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]
PRODUCTOS = json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))
P_DIR = RAIZ / "p"


def _stock(p):
    try:
        return int(p.get("stock") or 0)
    except (TypeError, ValueError):
        return 0


def _ficha(p):
    f = P_DIR / f"producto-{p['id']}.html"
    return f.read_text(encoding="utf-8") if f.exists() else None


def _una(agotado: bool):
    for p in PRODUCTOS:
        if (_stock(p) <= 0) is agotado:
            t = _ficha(p)
            if t:
                return p, t
    return None, None


class LaFichaAgotadaPideElAvisoTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.prod, cls.html = _una(agotado=True)
        if not cls.html:
            raise unittest.SkipTest("no hay ninguna ficha de producto agotado")

    def test_el_boton_principal_ofrece_el_aviso(self):
        self.assertIn("Avísame cuando vuelva", self.html)

    def test_el_whatsapp_ya_no_pide_lo_que_no_hay(self):
        # "me interesa: X" sobre un agotado es un pedido que no puedes servir.
        self.assertNotIn("me%20interesa", self.html.split("tm-rel")[0])

    def test_no_se_le_pregunta_al_cliente_cuando_vuelve(self):
        # El dueño tampoco lo sabe: preguntárselo al cliente solo genera un
        # mensaje que nadie puede contestar.
        self.assertNotRegex(self.html, r"cu[aá]ndo vuelve a entrar")

    def test_escribe_donde_el_cron_va_a_buscarlo(self):
        # send_notifications.py lee lista_espera/{id} al reponer stock. Si esto
        # escribiera en otro sitio, los números no le llegarían a nadie.
        self.assertIn("'/lista_espera/'", self.html)


class LaEscrituraPasaLaReglaTest(unittest.TestCase):
    """La regla de /lista_espera es estricta y su rechazo es un 401 silencioso."""

    @classmethod
    def setUpClass(cls):
        cls.prod, cls.html = _una(agotado=True)
        if not cls.html:
            raise unittest.SkipTest("no hay ninguna ficha de producto agotado")
        cls.regla = REGLAS["lista_espera"]["$productoId"]["$entradaId"]

    def test_manda_los_tres_campos_que_la_regla_exige(self):
        exigidos = re.findall(r"hasChildren\(\[([^\]]+)\]", self.regla[".validate"])[0]
        cuerpo = re.search(r"body:\s*JSON\.stringify\(\{([^}]*)\}", self.html).group(1)
        for campo in re.findall(r"'([^']+)'", exigidos):
            with self.subTest(campo=campo):
                self.assertRegex(cuerpo, rf"\b{campo}\s*:")

    def test_respeta_el_largo_del_telefono_por_los_dos_lados(self):
        # La regla pide entre 6 y 25. Pasarse por arriba daba un rechazo mudo.
        self.assertIn("6", re.search(r"length < (\d+)", self.html).group(1))
        self.assertIn(".slice(0, 25)", self.html)
        self.assertIn(">= 6", self.regla[".validate"])
        self.assertIn("<= 25", self.regla[".validate"])

    def test_la_clave_no_puede_chocar_entre_dos_clientes(self):
        # ".write": "!data.exists()" — con la hora sola, dos personas en el
        # mismo milisegundo hacen que la segunda se pierda sin decir nada.
        self.assertIn("!data.exists()", self.regla[".write"])
        self.assertRegex(self.html, r"Date\.now\(\)\s*\+\s*'_'\s*\+\s*Math\.random")

    def test_el_numero_del_cliente_no_queda_a_la_vista(self):
        self.assertIs(False, REGLAS["lista_espera"][".read"])

    def test_la_hora_del_telefono_vale_aqui(self):
        # A diferencia de /tokens y /errores_js, esta regla NO compara `ts`
        # contra `now`, así que Date.now() no puede quedar fuera de ventana.
        # Si algún día se le pone ventana, hay que pasar a {".sv":"timestamp"}.
        self.assertNotIn("now", self.regla[".validate"])


class LasFichasConStockNoEnganchanTest(unittest.TestCase):
    """El JavaScript solo viaja donde hace falta: son la mayoría de las páginas
    y su velocidad en 3G es lo único que tienen."""

    def test_una_ficha_con_stock_no_trae_el_script(self):
        prod, html = _una(agotado=False)
        if not html:
            self.skipTest("no hay ninguna ficha con stock")
        self.assertNotIn("tmAvisarBtn", html)
        self.assertNotIn("/lista_espera/", html)

    def test_la_ficha_con_stock_sigue_pudiendo_pedirse(self):
        prod, html = _una(agotado=False)
        if not html:
            self.skipTest("no hay ninguna ficha con stock")
        self.assertIn("Pedir por WhatsApp", html)


class LasPaginasEstanAlDiaTest(unittest.TestCase):
    """Que el generador sepa hacerlo no sirve si /p/ se quedó sin regenerar."""

    def test_toda_ficha_agotada_tiene_su_boton(self):
        sin = [p["id"] for p in PRODUCTOS
               if _stock(p) <= 0 and (_ficha(p) or "") and
               "Avísame cuando vuelva" not in (_ficha(p) or "")]
        self.assertEqual([], sin,
                         "hay fichas agotadas sin el aviso: corre "
                         "scripts/regenerate_artifacts.py")


class ElScriptGeneradoEsValidoTest(unittest.TestCase):
    """El JS se arma con str.format() sobre una plantilla llena de llaves; un
    escape mal puesto no lo nota nadie hasta que el botón no responde."""

    def test_node_lo_compila(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        prod, html = _una(agotado=True)
        if not html:
            self.skipTest("no hay ninguna ficha de producto agotado")
        m = re.search(r"<script>\n(\(function\(\)\{.*?)</script>", html, re.S)
        self.assertIsNotNone(m, "no se encontró el script del aviso")
        js = m.group(1)
        self.assertNotIn("{{", js, "quedó un escape de format() sin resolver")
        self.assertNotIn("}}", js, "quedó un escape de format() sin resolver")
        r = subprocess.run([node, "--check", "-"], input=js,
                           capture_output=True, text=True, timeout=30)
        self.assertEqual(0, r.returncode, r.stderr)


if __name__ == "__main__":
    unittest.main()
