"""
Tema de temporada (Navidad / Halloween): la fecha lo propone y el dueño lo
confirma, lo cambia o lo apaga en ⚙️ Configuración (config.json → tema).

El comportamiento se comprueba en el navegador (tests/tema_check.mjs). Aquí,
lo que se ve sin navegador.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
INDEX = (RAIZ / "index.html").read_text(encoding="utf-8")
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")
CSS = (RAIZ / "css" / "tema-estacional.css").read_text(encoding="utf-8")


def _regla(html):
    m = re.search(r'<script id="tm-tema-regla">.*?</script>', html, re.S)
    return m.group(0) if m else None


class TemaEstacionalTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "tema_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=240)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_la_regla_es_la_misma_en_la_tienda_y_en_el_panel(self):
        # Dos copias distintas y el panel diría "toca Navidad" mientras la tienda no.
        self.assertIsNotNone(_regla(INDEX))
        self.assertEqual(_regla(INDEX), _regla(ADMIN))

    def test_la_regla_va_antes_que_cualquier_estilo(self):
        # Se viste antes de pintar: si el atributo llega después del CSS, parpadea.
        self.assertLess(INDEX.index('id="tm-tema-regla"'), INDEX.index("<link"))

    def test_sin_atributo_el_css_no_hace_nada(self):
        # Cada selector del fichero cuelga de [data-tema…]: fuera de temporada no cuesta nada.
        sin_comentarios = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)
        sin_keyframes = re.sub(r"@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", sin_comentarios)
        for bloque in re.findall(r"([^{}]+)\{[^{}]*\}", sin_keyframes):
            for sel in bloque.split(","):
                sel = sel.strip()
                if not sel or sel.startswith("@"):
                    continue
                self.assertIn("data-tema", sel, f"selector sin data-tema: {sel!r}")

    def test_publicar_la_tienda_lleva_el_tema(self):
        # "Actualizar tienda" reescribe config.json entero: sin esto deshace la elección.
        src = (RAIZ / "js" / "src" / "tm-catalog.src.js").read_text(encoding="utf-8")
        self.assertIn("tmTemaParaSubir", src)
        self.assertIn("window.tmTemaParaSubir", ADMIN)

    def test_el_panel_no_sube_config_sin_haberlo_leido(self):
        # Subir solo {tema} dejaría la tienda sin tasa ni Firebase.
        self.assertIn("no pude leer config.json", ADMIN)


if __name__ == "__main__":
    unittest.main()
