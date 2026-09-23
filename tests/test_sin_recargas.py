"""La tienda no se recarga sola.

El dueño: "cuando entro se actualiza sola varias veces y, si estás en una
categoría, te saca al inicio; si salgo y al rato entro, lo vuelve a hacer".
Eran dos recargas automáticas que no traían nada — lo recién abierto ya era
la versión nueva — y la categoría no vive en la URL, así que cada recarga
devolvía al cliente a la portada:

  · el service worker, al tomar el control (primera visita y cada sw.js
    nuevo), disparaba `controllerchange` → `location.reload()`;
  · cada "Actualizar tienda" escribe /config/version y la tienda, al ENTRAR,
    recargaba si no coincidía con la última vista: el primer cliente después
    de cada publicación, siempre.

`recarga_check.mjs` lo hace en un navegador de verdad con el SW activo.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
INDEX = (RAIZ / "index.html").read_text(encoding="utf-8")


class SinRecargasEnNavegadorTest(unittest.TestCase):
    def test_el_cliente_se_queda_donde_estaba(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "recarga_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=300)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


class NadaRecargaLaTiendaTest(unittest.TestCase):
    """Lo mismo sin navegador, para que falle también donde no hay Chromium."""

    def test_index_no_llama_a_reload(self):
        codigo = re.sub(r"/\*[\s\S]*?\*/|//[^\n]*", "", INDEX)
        self.assertNotRegex(codigo, r"location\.reload\s*\(",
                            "una recarga automática saca al cliente de su categoría")


if __name__ == "__main__":
    unittest.main()
