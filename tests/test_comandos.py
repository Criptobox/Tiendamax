"""
Corre tests/comandos_check.mjs dentro de unittest, que es lo que ejecuta CI.

El fallo que motiva esto llegó a producción: los botones del panel llevan emoji
delante ("🤖 /ayuda") y los comandos se detectaban con el ancla ^\\/, así que el
emoji rompía la coincidencia. Pedir ayuda devolvía una lista de productos.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "comandos_check.mjs"
CEREBRO = ROOT / "js" / "src" / "tm-bot-cerebro.src.js"


class ComandosTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_ningun_comando_se_prueba_contra_el_texto_sin_limpiar(self):
        # La forma limpia (mCmd) es la que quita el emoji del botón. Un comando
        # nuevo copiado del de al lado con `.test(m)` vuelve a traer el fallo,
        # y solo se nota usándolo desde el botón, no escribiéndolo a mano.
        src = CEREBRO.read_text(encoding="utf-8")
        malos = re.findall(r"/\^\\/\([^)]*\)/i\.test\((m)\)", src)
        self.assertEqual(
            [], malos,
            "hay comandos probados contra `m` en vez de `mCmd`: con el emoji "
            "del botón delante no se reconocerán",
        )


if __name__ == "__main__":
    unittest.main()
