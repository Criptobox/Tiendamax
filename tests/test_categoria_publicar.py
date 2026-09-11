"""La pantalla 🏷️ Compartir categoría.

Corre `tests/categoria_check.mjs` dentro de unittest —que es lo que ejecuta
CI— y añade lo poco que sí se puede afirmar leyendo el fichero.

Los cuatro fallos que se protegen no dan ningún error cuando aparecen:

  · **Un lote cancelado apuntaba doce productos como publicados.** Los
    carteles se marcaban mientras se dibujaban, antes de compartir. Bastaba
    cerrar la hoja de compartir para que doce quedaran hechos en el Historial
    sin haber salido — y «Hoy toca publicar», que lee ese mismo registro,
    dejaba de proponerlos.
  · **El tope de doce dejaba productos inalcanzables.** Con un slice(0,12)
    fijo, en una categoría de diecisiete salían siempre los mismos doce.
  · **La garantía se prometía en todas las categorías.** La escribe el gestor
    producto a producto y casi ninguno la trae.
  · **Un solo texto para cuatro redes**, cada una con su castigo distinto.

Lo de verdad lo comprueba el navegador: que el tope esté escrito en el
fichero no dice qué doce salen, y que la palabra «Garantía» aparezca no dice
cuándo se imprime.
"""

import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = RAIZ / "admin.html"


def _cuerpo(src, nombre):
    """El cuerpo de una función, hasta la siguiente declaración de primer nivel."""
    i = src.index("function %s(" % nombre)
    resto = src[i:]
    fin = resto.find("\nfunction ")
    return resto if fin < 0 else resto[:fin]


class LaPantallaEnNavegadorTest(unittest.TestCase):
    def test_categoria_se_comporta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "categoria_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=600)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


class LoQueSeLeeEnElFicheroTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = ADMIN.read_text(encoding="utf-8")
        # Se mira el código, no los comentarios: la explicación de por qué se
        # hace así tiene que poder escribirse sin que el test la confunda.
        cls.codigo = re.sub(r"^\s*//.*$", "", cls.src, flags=re.M)
        cls.codigo = re.sub(r"/\*[\s\S]*?\*/", "", cls.codigo)

    def test_generar_no_apunta_nada(self):
        # Dibujar no es publicar. El registro se toca arriba, y solo si salió.
        cuerpo = _cuerpo(self.codigo, "pubCatGenCarteles")
        self.assertNotIn("pubMarcarPublicado", cuerpo,
                         "generar los carteles no puede apuntarlos como publicados: "
                         "cancelar la hoja de compartir dejaría doce dados por hechos")
        self.assertIn("hechos", cuerpo,
                      "tiene que devolver cuáles salieron, para poder apuntar esos y no otros")

    def test_el_cancelado_no_se_adivina_por_el_mensaje(self):
        # Chrome rechaza con un DOMException de nombre AbortError y mensaje
        # «Share canceled»: buscar «abort» en el mensaje no lo encuentra, y
        # entonces cancelar se trata como un fallo y se sigue por el camino
        # de respaldo, que descarga y apunta.
        self.assertRegex(_cuerpo(self.codigo, "pubCancelado"), r"e\.name\s*===?\s*'AbortError'")
        self.assertNotRegex(self.codigo, r"/abort/i\.test\(e\.message",
                            "queda algún sitio comprobando el cancelado por el texto del mensaje")

    def test_la_tanda_no_es_un_tope_fijo(self):
        cuerpo = _cuerpo(self.codigo, "pubCatProdsTanda")
        self.assertRegex(cuerpo, r"slice\(\s*i\s*\*\s*PUB_CAT_LOTE_MAX",
                         "la tanda tiene que arrancar donde acabó la anterior, "
                         "o el resto de la categoría no se publica nunca")

    def test_la_garantia_depende_de_los_productos(self):
        cuerpo = _cuerpo(self.codigo, "pubCatConfianza")
        self.assertIn("p.garantia", cuerpo,
                      "la garantía se promete leyendo el campo, no por defecto")
        self.assertIn("every", cuerpo,
                      "con que la tenga uno no se puede prometer para la categoría entera")

    def test_hay_un_texto_por_red(self):
        cuerpo = _cuerpo(self.codigo, "pubCatText")
        for red in ("'fb'", "'ig'", "'rev'"):
            self.assertIn("red===" + red, cuerpo.replace(" ", ""),
                          "falta la variante de %s" % red)

    def test_el_texto_de_facebook_no_empieza_por_la_marca(self):
        # Facebook corta en «Ver más» tras dos líneas: ahí va el gancho y el
        # dato, no el nombre de la tienda.
        cuerpo = _cuerpo(self.codigo, "pubCatText")
        fb = cuerpo[cuerpo.index("red==='fb'"):]
        fb = fb[:fb.index("if(red==='ig'")]
        self.assertNotIn("🏪 TIENDAMAX", fb)
        self.assertIn("pubCatGancho(cat)", fb)


if __name__ == "__main__":
    unittest.main()
