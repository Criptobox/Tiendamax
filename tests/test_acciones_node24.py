"""Las acciones de los workflows, en versiones que corren en Node 24.

GitHub avisaba en cada ejecución de que checkout@v4, setup-python@v5 y
compañía son de Node 20 y se ejecutan forzadas en Node 24. Se subió cada una
al PRIMER salto que ya es Node 24 (checkout v5, setup-python v6, setup-node
v5, configure-pages v6, deploy-pages v5), no a la última: cada salto de más es
un cambio que nadie ha leído.

upload-pages-artifact se queda en v3 A PROPÓSITO: la v4 deja fuera los
ficheros ocultos, y `.nojekyll` lo es. Sin él, Pages pasa la web por Jekyll,
que ignora todo lo que empieza por `_`. La web se publicaría "bien" y
faltarían ficheros, sin un solo error.
"""
import re
import unittest
from pathlib import Path

WF = Path(__file__).resolve().parents[1] / ".github" / "workflows"
NODE20 = {"actions/checkout": 4, "actions/setup-python": 5, "actions/setup-node": 4,
          "actions/configure-pages": 5, "actions/deploy-pages": 4}


class AccionesTest(unittest.TestCase):
    def usos(self):
        for f in sorted(WF.glob("*.yml")):
            for m in re.finditer(r"uses:\s*([\w.-]+/[\w.-]+)@v(\d+)", f.read_text(encoding="utf-8")):
                yield f.name, m.group(1), int(m.group(2))

    def test_ninguna_accion_se_queda_en_node20(self):
        viejas = [f"{f}: {a}@v{v}" for f, a, v in self.usos() if a in NODE20 and v <= NODE20[a]]
        self.assertEqual([], viejas)

    def test_upload_pages_artifact_sigue_en_v3(self):
        versiones = {v for _, a, v in self.usos() if a == "actions/upload-pages-artifact"}
        self.assertEqual({3}, versiones,
                         "la v4 deja fuera los ficheros ocultos: sin .nojekyll, "
                         "Jekyll se come lo que empieza por _")


if __name__ == "__main__":
    unittest.main()
