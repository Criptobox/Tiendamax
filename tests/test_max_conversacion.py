"""Max conversa, pregunta antes de volcar la lista y entiende sinónimos:
tests/max_conversacion_check.mjs, con el catálogo real.

El dueño dijo que Max «es como un buscador»: «estación de carga» sacaba
cargadores y un MPPT, cuando dudaba soltaba todo lo que vende y a un «hola»
o un «gracias» no contestaba como una persona. Nada de eso da error, así que
se prueba la RESPUESTA. Aquí además se fijan por estructura las reglas que
una prueba de comportamiento no ve: sin azar, sin red nueva, sin IA conectada.
"""
import os
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_conversacion_check.mjs"
CEREBRO = ROOT / "js" / "src" / "tm-bot-cerebro.src.js"


def _correr(real=False, cerebro=None):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node no está disponible en este entorno")
    env = dict(os.environ, TM_SINONIMOS="real" if real else "fixture")
    if cerebro:
        env["TM_CEREBRO"] = str(cerebro)
    return subprocess.run([node, str(CHECK)], cwd=str(ROOT), env=env,
                          capture_output=True, text=True, timeout=300)


class MaxConversacionTest(unittest.TestCase):
    def test_con_el_catalogo_real_y_sinonimos_de_prueba(self):
        r = _correr()
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_con_el_max_sinonimos_real(self):
        if not (ROOT / "max-sinonimos.json").exists():
            self.skipTest("todavía no existe max-sinonimos.json")
        r = _correr(real=True)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class MaxConversacionEstructuraTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = CEREBRO.read_text(encoding="utf-8")

    def _funcion(self, nombre, largo=2500):
        i = self.src.index(nombre)
        return self.src[i:i + largo]

    def test_las_variantes_no_usan_azar(self):
        """Las variantes salen de un contador: la misma conversación da lo
        mismo y las pruebas son estables."""
        cuerpo = self._funcion("function _variante(")
        self.assertNotIn("Math.random", cuerpo)
        for r in ("R.saludo", "R.gracias", "R.despedida", "R.cumplido", "R.noSe", "R.groseria", "R.quienEres"):
            c = self._funcion(r + " = ", 3500)
            c = c[:c.index("\n  R.", 10)] if "\n  R." in c[10:] else c
            self.assertNotIn("Math.random", c, r)

    def test_la_ia_es_un_interprete_apagado_por_defecto(self):
        """`_preguntarIA` solo se llama desde `_mejorarConIA` (y esta, solo cuando Max
        no supo); sin URL en <meta tm-bot-ia> devuelve null sin tocar la red.
        Ver tests/test_max_ia.py y la sección «Max IA» de CLAUDE.md."""
        self.assertRegex(self.src, r"async function _preguntarIA\(texto\)")
        llamadas = re.findall(r"_preguntarIA\(", self.src)
        self.assertEqual(len(llamadas), 2, "la definición y _mejorarConIA, nada más")
        self.assertIn("if(!/^https:\\/\\//.test(url)) return null;", self.src)

    def test_no_se_anadio_red_ni_ia(self):
        """Lo único que baja el cerebro es JSON propio de la tienda."""
        urls = set(re.findall(r"fetch\(\s*['\"`]([^'\"`]+)", self.src))
        propias = {u for u in urls if u.startswith("/") or "max-sinonimos" in u}
        self.assertIn("/max-sinonimos.json", urls)
        for u in urls - propias:
            self.assertRegex(u, r"\$\{|firebaseio|\.json", f"fetch inesperado: {u}")
        for prohibido in ("api.anthropic.com", "openai.com", "generativelanguage", "openrouter"):
            self.assertNotIn(prohibido, self.src)

    def test_los_sinonimos_se_cargan_en_segundo_plano_y_sin_bloquear(self):
        c = self._funcion("function _cargarSinonimos(", 500)
        self.assertIn("catch", c)
        self.assertIn(".catch(() => {})", c)
        self.assertIn("max-sinonimos.json", c)

    def test_los_sinonimos_solo_suman(self):
        """En el puntaje solo se SUMA; el corte relativo se mide sin ellos, y
        la regla del modelo y la del agotado siguen donde estaban."""
        sc = self._funcion("function scoreProduct(", 1800)
        self.assertIn("return score + extra", sc)
        bp = self._funcion("function _buscarPuntuados(", 3500)
        self.assertIn("x.sin ? 0 : x.s", bp)
        self.assertIn("_esMod", bp)               # m5 no es m2

    def test_la_charla_no_roba_consultas(self):
        """Solo es charla si TODAS las palabras son de cortesía."""
        c = self._funcion("function _charlaTipo(", 900)
        self.assertIn("toks.every(w => _SOC.has(w)", c)
        i = self.src.index("const _ch = _charlaIntent(m);")
        self.assertLess(i, self.src.index("const hilo = _hiloDe(text);"),
                        "la charla se mira antes de todo lo que busca productos")

    def test_una_respuesta_generica_no_pasa_de_tres(self):
        c = self._funcion("function _enseñarTres(", 600)
        self.assertIn("slice(0, 3)", c)
        self.assertIn("_VER_MAS", c)


if __name__ == "__main__":
    unittest.main()
