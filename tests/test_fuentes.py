"""El panel no pide fuentes a Google: las que usa ya viajan en el repo.

admin.html traía CUATRO familias en dos <link> a fonts.googleapis.com, y los
<link rel=stylesheet> bloquean el pintado: desde un teléfono en Cuba eran dos
viajes a un tercero antes de ver siquiera la pantalla de entrar, más los
ficheros que ese CSS manda pedir después a fonts.gstatic.com. Tres de las
cuatro (DM Sans, Inter, JetBrains Mono) ya están en `fonts/` como .woff2 y las
sirve css/fonts.css — la tienda lo hace así desde hace tiempo; el panel no.

Nada de esto da un error cuando vuelve: la página se ve igual (con la fuente
de sistema mientras llega, o para siempre si Google está bloqueado) y solo
tarda más. Por eso el test.
"""

import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
FONTS_CSS = RAIZ / "css" / "fonts.css"
PAGINAS = ("admin.html", "index.html", "404.html", "vale.html")

# Familias genéricas y pilas del sistema: no hay nada que descargar.
GENERICAS = {
    "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
    "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica",
    "helvetica neue", "arial", "georgia", "courier new", "ui-monospace",
    "sfmono-regular", "menlo", "monaco", "consolas", "liberation mono",
    "apple color emoji", "segoe ui emoji", "noto color emoji", "inherit",
    "initial", "unset", "emoji", "math", "fangsong",
}


def _autoalojadas():
    src = FONTS_CSS.read_text(encoding="utf-8")
    return {m.lower() for m in re.findall(r"font-family:\s*'([^']+)'", src)}


class NadaDeGoogleFontsTest(unittest.TestCase):

    def test_ninguna_pagina_pide_fuentes_a_google(self):
        for nombre in PAGINAS:
            f = RAIZ / nombre
            if not f.exists():
                continue
            html = f.read_text(encoding="utf-8")
            # Se mira el marcado, no los comentarios: explicar por qué se quitó
            # tiene que poder escribirse sin que el test lo confunda.
            marcado = re.sub(r"<!--.*?-->", "", html, flags=re.S)
            for host in ("fonts.googleapis.com", "fonts.gstatic.com"):
                self.assertNotIn(
                    host, marcado,
                    f"{nombre} vuelve a pedir fuentes a {host}: bloquea el pintado "
                    "y en Cuba puede no llegar nunca. Están en fonts/*.woff2",
                )

    def test_el_panel_sirve_las_fuentes_del_repo(self):
        html = (RAIZ / "admin.html").read_text(encoding="utf-8")
        self.assertIn("css/fonts.css", html,
                      "sin fonts.css el panel se queda con la fuente del sistema")
        self.assertIn('href="fonts/dmsans-normal-latin.woff2"', html,
                      "el preload de la fuente del cuerpo es lo que evita el salto de texto")

    def test_toda_familia_usada_esta_auto_alojada(self):
        """Que no vuelva a colarse una familia que nadie sirve.

        Manrope se usaba en dos reglas del login y arrastraba una familia
        entera de Google. Una `font-family` que no está ni en fonts.css ni en
        la lista de genéricas es una que el navegador no puede pintar.
        """
        tengo = _autoalojadas()
        html = (RAIZ / "admin.html").read_text(encoding="utf-8")
        huerfanas = set()
        for decl in re.findall(r"font-family:\s*([^;{}\"']+)", html):
            for fam in decl.split(","):
                fam = fam.strip().strip("'\"").lower()
                if not fam or fam.startswith("var(") or fam.endswith(")"):
                    continue
                if fam in GENERICAS or fam in tengo:
                    continue
                huerfanas.add(fam)
        self.assertEqual(set(), huerfanas,
                         f"familias que nadie sirve: {sorted(huerfanas)}. "
                         "O se añaden a css/fonts.css con su .woff2, o no se usan")


if __name__ == "__main__":
    unittest.main()
