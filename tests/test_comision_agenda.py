"""«Productos que vendes sin comisión»: una sola definición, y en la agenda.

El gestor gana una comisión por producto, no el precio. Un producto a la
venta con ese campo en blanco sale como ganancia cero en Inicio y queda fuera
de las comisiones que 🔀 Comparar cruza con la principal. En el catálogo real
son 14 con stock.

Corre `tests/comision_check.mjs` (lo de verdad: que la tarea llegue a la
agenda y que su botón deje la pantalla filtrada) y añade lo que sí se puede
comprobar leyendo los ficheros.
"""

import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = RAIZ / "admin.html"
COPILOT = RAIZ / "js" / "admin-copilot.js"


class EnNavegadorTest(unittest.TestCase):
    def test_se_comporta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "comision_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=600)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


class UnaSolaDefinicionTest(unittest.TestCase):
    """Dos copias del mismo criterio acaban siendo dos conjuntos distintos."""

    @classmethod
    def setUpClass(cls):
        cls.admin = ADMIN.read_text(encoding="utf-8")
        cls.copilot = COPILOT.read_text(encoding="utf-8")

    def test_el_criterio_vive_en_el_copiloto(self):
        # CLAUDE.md: buildTasks() es lo único que analiza la tienda. Que el
        # criterio viva aquí no es casual — es el fichero que ya lo hace.
        self.assertIn("function sinComision(p)", self.copilot)
        self.assertIn("window.tmSinComision", self.copilot)
        self.assertIn("ps.filter(sinComision)", self.copilot,
                      "la tarea tiene que contar con la misma función que filtra la pantalla")

    def test_productos_no_tiene_su_propia_copia(self):
        cuerpo = self.admin[self.admin.index("function apSinComision(p){"):]
        cuerpo = cuerpo[:cuerpo.index("\n}")]
        self.assertIn("window.tmSinComision", cuerpo,
                      "Productos tiene que preguntar, no reimplementar")
        self.assertNotIn("p.stock", cuerpo,
                         "eso es reimplementar el criterio: en cuanto uno cambie, "
                         "el número de la tarea y la lista de su botón dejan de coincidir")

    def test_la_tarea_no_la_echa_la_agenda(self):
        # AGENDA_NO_MIAS quita lo que no es del gestor (reponer es del dueño).
        # Ponerle precio a su propio trabajo es lo más suyo que hay.
        m = re.search(r"AGENDA_NO_MIAS\s*=\s*new Set\(\[([^\]]*)\]\)", self.admin)
        self.assertIsNotNone(m)
        self.assertNotIn("comision", m.group(1))

    def test_la_tarea_tiene_agente(self):
        # Un kind sin agente desaparece del recuento por temas sin avisar:
        # buildAgentsFromTasks filtra por agentForKind y nadie sobra.
        agente = re.search(r"\['comision'\]\.includes\(kind\)\) return '(\w+)'", self.copilot)
        self.assertIsNotNone(agente, "falta el agente de 'comision'")
        self.assertRegex(self.copilot, r"\{id:'%s'," % agente.group(1),
                         "el agente al que apunta 'comision' no está definido")


if __name__ == "__main__":
    unittest.main()
