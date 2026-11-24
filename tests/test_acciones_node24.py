"""Las acciones de los workflows, en versiones que corren en Node 24.

GitHub avisaba en cada ejecución de que checkout@v4, setup-python@v5 y
compañía son de Node 20 y se ejecutan forzadas en Node 24. Se subió cada una
al PRIMER salto que ya es Node 24 (checkout v5, setup-python v6, setup-node
v5, configure-pages v6, deploy-pages v5), no a la última: cada salto de más es
un cambio que nadie ha leído.

upload-pages-artifact va en v5 con `include-hidden-files: true`, la pareja de
deploy-pages v5: con la v3 el artefacto se subía bien y deploy-pages respondía
«Found 0 artifact(s)», así que las publicaciones fallaban (nov-2026). La v4+
deja fuera los ficheros ocultos por defecto y `.nojekyll` lo es; por eso la
opción explícita.
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

    def test_upload_pages_artifact_va_con_deploy_pages(self):
        versiones = {v for _, a, v in self.usos() if a == "actions/upload-pages-artifact"}
        deploy = {v for _, a, v in self.usos() if a == "actions/deploy-pages"}
        self.assertEqual({5}, versiones)
        self.assertEqual(deploy, versiones, "upload-pages-artifact y deploy-pages tienen que ir en la misma versión mayor")

    def test_el_artefacto_conserva_nojekyll(self):
        wf = (WF / "pages.yml").read_text(encoding="utf-8")
        self.assertIn("include-hidden-files: true", wf)

if __name__ == "__main__":
    unittest.main()
