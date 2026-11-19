"""El «¿Te sirvió?» de Max, lo que se le enseña y el panel 🤖 Max.

El recorrido lo comprueba tests/max_panel_check.mjs en un navegador; aquí van
los contratos que se leen en el código.
"""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_panel_check.mjs"
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")
PANEL = (ROOT / "js" / "max-panel.js").read_text(encoding="utf-8")
REGLAS = json.loads((ROOT / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]


class EnNavegadorTest(unittest.TestCase):
    def test_de_punta_a_punta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_el_voto_no_lleva_nada_del_cliente(self):
        """Solo v, m y ts: la regla rechaza cualquier otro campo."""
        op = REGLAS["agente"]["opiniones"]["$clave"]["$id"]
        self.assertEqual(op["$otro"][".validate"], False)
        self.assertIn("!data.exists()", op[".write"])

    def test_las_opiniones_solo_las_lee_el_dueno(self):
        self.assertIn("root.child('admin_uid').val()", REGLAS["agente"]["opiniones"][".read"])
        self.assertIn("fetchPrivado('/agente/opiniones.json')", PANEL)

    def test_una_sola_clave_para_pregunta_y_voto(self):
        self.assertEqual(CEREBRO.count("function _claveFAQ("), 1)
        self.assertIn("const clave = _claveFAQ(t);", CEREBRO)
        self.assertIn("const clave = _claveFAQ(text);", CEREBRO)

    def test_lo_ensenado_existe_y_se_aplica_antes_de_entender(self):
        self.assertTrue((ROOT / "max-aprendido.json").exists())
        cuerpo = CEREBRO[CEREBRO.index("function responder(text){"):]
        self.assertLess(cuerpo.index("_aplicarEnsenado(text)"), cuerpo.index("detectIntent(text)"))


if __name__ == "__main__":
    unittest.main()
