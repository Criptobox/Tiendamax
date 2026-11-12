"""
Todo workflow que hace `git push` tiene que declarar `permissions: contents: write`.

Sin ello el GITHUB_TOKEN solo lee y el push contesta 403. Fue lo que le pasó a
«Publicar producto nuevo en Telegram»: el paso de guardar los IDs de los mensajes
fallaba en cada cambio del panel, y los mensajes de Telegram de los productos
agotados o editados dejaban de poder actualizarse. El resto del workflow salía
verde, así que solo se veía mirando el último paso.
"""
import unittest
from pathlib import Path

WF = Path(__file__).resolve().parents[1] / ".github" / "workflows"


class PermisosDeWorkflowsTest(unittest.TestCase):
    def test_quien_empuja_puede_escribir(self):
        sin = []
        for f in sorted(WF.glob("*.yml")):
            t = f.read_text(encoding="utf-8")
            if "git push" in t and "contents: write" not in t:
                sin.append(f.name)
        self.assertEqual([], sin, "hacen `git push` sin `permissions: contents: write`: %r" % sin)


if __name__ == "__main__":
    unittest.main()
