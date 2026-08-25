"""
Que el workflow publique TODO lo que el regenerador escribe.

El fallo que motiva esto pasó de verdad: regenerate_artifacts.py empezó a
reescribir el pie de index.html, pero index.html no estaba en el `git add` del
workflow. Dos consecuencias, las dos silenciosas:

  1. El pie regenerado se descartaba al terminar cada corrida.
  2. Al quedar index.html modificado y sin indexar, el `git rebase` del
     reintento se negaba a arrancar ("cannot rebase: you have unstaged
     changes"), el job moría y se perdían TODOS los artefactos ya generados —
     incluidas la página /p/ y la tarjeta OG de un producto recién subido.

El job sale en verde salvo cuando además hay carrera de push, así que se
descubre semanas después, al notar que a un producto le falta su página.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WF = ROOT / ".github" / "workflows" / "regenerate-artifacts.yml"
SCRIPT = ROOT / "scripts" / "regenerate_artifacts.py"


class WorkflowArtefactosTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.wf = WF.read_text(encoding="utf-8")
        cls.src = SCRIPT.read_text(encoding="utf-8")
        # Las rutas pueden estar escritas de dos formas y las dos cuentan:
        # sueltas en un `git add a b c`, o en la variable RUTAS que recorre el
        # bucle de indexado. Buscando solo la primera, el test se quedó ciego
        # justo cuando el workflow pasó a la segunda.
        cls.add = " ".join(
            re.findall(r"^\s*git add ([^\n]*)", cls.wf, re.M)
            + re.findall(r'^\s*RUTAS=\"([^\"]*)\"', cls.wf, re.M)
        )

    def _constantes_escritas(self):
        """Constantes ROOT/'algo' que el script escribe (no solo lee)."""
        rutas = dict(re.findall(r"^([A-Z_]+)\s*=\s*ROOT\s*/\s*\"([^\"]+)\"", self.src, re.M))
        escritas = set()
        for const, nombre in rutas.items():
            if re.search(rf"_atomic_write\(\s*{const}\b|write_text\(\s*{const}\b|{const}\.write_text\(", self.src):
                escritas.add(nombre)
        return escritas

    def test_el_workflow_agrega_todo_lo_que_el_script_escribe(self):
        faltan = sorted(n for n in self._constantes_escritas() if n not in self.add)
        self.assertEqual(
            [], faltan,
            f"el regenerador escribe {faltan} pero el workflow no los añade al commit: "
            f"el cambio se descarta y además rompe el rebase del reintento",
        )

    def test_el_escaner_ve_algo(self):
        # Si un refactor cambia la forma de las constantes y aquí deja de
        # detectarse nada, el test de arriba pasaría vacío para siempre.
        escritas = self._constantes_escritas()
        self.assertTrue(escritas, "el escáner no encontró ninguna ruta escrita; revísalo")
        self.assertIn("index.html", escritas, "index.html debería detectarse como escrito")

    def test_el_rebase_del_reintento_no_muere_por_ficheros_sueltos(self):
        # Un fichero tocado y sin indexar bastaba para tumbar el job entero
        # después de haber hecho todo el trabajo.
        # Sin anclar al principio de la línea: el rebase vive dentro de un
        # `if ! git rebase ...; then` desde que el fallback se unificó.
        m = re.search(r"git rebase ([^\n;]*)", self.wf)
        self.assertIsNotNone(m, "no se encontró el rebase del reintento")
        self.assertIn(
            "--autostash", m.group(1),
            "el rebase del reintento debe llevar --autostash: sin él, cualquier "
            "fichero suelto lo aborta y se pierden los artefactos generados",
        )


if __name__ == "__main__":
    unittest.main()
