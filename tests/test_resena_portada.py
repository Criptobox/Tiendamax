"""
«⭐ Deja tu reseña» en la portada y reseñas que no dependan de lo que un
navegador no tenga.

El comportamiento va en el navegador (tests/resena_portada_check.mjs). Aquí,
lo que una lectura estática sí puede asegurar: el botón es HTML estático y
visible, el script suelto es ES5, y ningún archivo que se sirve SIN transpilar
(ni el bundle) trae sintaxis que sea un error de análisis en navegadores viejos:
un solo literal así y no se ejecuta NADA, tampoco el botón de reseña.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
INDEX = (RAIZ / "index.html").read_text(encoding="utf-8")
SCRIPT = (RAIZ / "js" / "resena-portada.js").read_text(encoding="utf-8")
RESENA = (RAIZ / "resena.html").read_text(encoding="utf-8")
BUNDLE = (RAIZ / "js" / "tm-bundle.js").read_text(encoding="utf-8")
CONFIG_SRC = (RAIZ / "js" / "src" / "tm-config.src.js").read_text(encoding="utf-8")


def sin_comentarios(js):
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", js)


class ResenaPortadaTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "resena_portada_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=500)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_el_boton_es_html_estatico_y_siempre_visible(self):
        m = re.search(r'<div id="testimoniosCTA"[^>]*>', INDEX)
        self.assertIsNotNone(m, "falta #testimoniosCTA")
        self.assertNotIn("display:none", m.group(0).replace(" ", ""))
        self.assertIn('id="tmResenaPortadaBtn"', INDEX)
        self.assertIn("data-tm-resena", INDEX)
        self.assertIn('src="js/resena-portada.js', INDEX)

    def test_cargar_testimonios_no_borra_ni_esconde_el_boton(self):
        i = CONFIG_SRC.index("async function cargarTestimoniosFirebase")
        cuerpo = CONFIG_SRC[i:i + 6000]
        self.assertNotIn("cta.innerHTML", cuerpo)
        self.assertNotIn("cta.style.display", cuerpo)
        j = CONFIG_SRC.index("function _renderTestimoniosPage")
        self.assertNotIn("cta.innerHTML", CONFIG_SRC[j:j + 3500])
        self.assertNotIn("cta.style.display", CONFIG_SRC[j:j + 3500])

    def test_el_script_suelto_es_es5(self):
        js = sin_comentarios(SCRIPT)
        for patron, que in [(r"=>", "flechas"), (r"\?\.", "?."), (r"\?\?", "??"), (r"`", "plantillas"),
                            (r"\b(let|const)\b", "let/const"),
                            (r"\.closest\(", "closest"), (r"\bfetch\(", "fetch"), (r"new Promise", "Promise"),
                            (r"AbortController", "AbortController"), (r"\.(at|replaceAll|flatMap)\(", "API reciente"),
                            (r"IntersectionObserver", "IntersectionObserver")]:
            self.assertIsNone(re.search(patron, js), f"resena-portada.js usa {que}")

    def test_no_reescribe_la_escritura_de_resenas(self):
        # La escritura y la regla de «verificada» viven en resena.html y en la
        # regla de Firebase; el selector solo enlaza.
        self.assertNotIn("/resenas", sin_comentarios(SCRIPT))
        self.assertIn("resena.html?p=", SCRIPT)
        self.assertNotIn("verificada", sin_comentarios(SCRIPT))

    def test_sin_property_escapes_ni_lookbehind_en_lo_que_se_sirve_tal_cual(self):
        # \p{..} con /u y (?<=..) son errores de sintaxis al ANALIZAR en
        # navegadores viejos: el script entero deja de ejecutarse.
        self.assertIsNone(re.search(r"\\p\{", BUNDLE), "el bundle trae \\p{...}")
        self.assertIsNone(re.search(r"\(\?<[=!]", BUNDLE), "el bundle trae lookbehind")
        self.assertIsNone(re.search(r"\\p\{", sin_comentarios(RESENA[RESENA.index("<script>"):])), "resena.html trae \\p{...}")

    def test_resena_html_no_depende_de_apis_recientes(self):
        js = RESENA[RESENA.index("<script>"):]
        for patron, que in [(r"URLSearchParams", "URLSearchParams"), (r"\.closest\(", "closest"), (r"\bfetch\(", "fetch"),
                            (r"AbortController", "AbortController"), (r"\.finally\(", "Promise.finally"),
                            (r"\.dataset\b", "dataset")]:
            m = re.search(patron, sin_comentarios(js))
            self.assertIsNone(m, f"resena.html usa {que}")

    def test_almacenamiento_seguro_va_antes_que_cualquier_script_de_la_tienda(self):
        i = INDEX.index('id="tm-almacenamiento-seguro"')
        self.assertLess(i, INDEX.index("js/error-report.js"))
        self.assertLess(i, INDEX.index("js/tm-bundle.js"))

    def test_los_observadores_del_bundle_estan_protegidos(self):
        for f in ("tm-ui.src.js",):
            src = (RAIZ / "js" / "src" / f).read_text(encoding="utf-8")
            for m in re.finditer(r"new IntersectionObserver", src):
                antes = src[max(0, m.start() - 400):m.start()]
                self.assertRegex(antes, r"IntersectionObserver['\"]? ?(in window|!== 'undefined'|=== 'undefined')|typeof IntersectionObserver",
                                 f"{f}: IntersectionObserver sin comprobar")


if __name__ == "__main__":
    unittest.main()
