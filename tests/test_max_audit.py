"""Auditoría de 90 preguntas a Max: tests/max_audit_check.mjs con el catálogo real.

Los fallos eran silenciosos (Max contestaba, solo que otra cosa): aceite 10w40
que no casaba con «10W-40», «quiero hablar con una persona» que daba timbres,
precios en MN convertidos como si fueran USD, horario y pagos que
contradecían la política del dueño. Además fija la estructura que los sostiene.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "max_audit_check.mjs"
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")


class MaxAuditoriaTest(unittest.TestCase):
    def test_las_preguntas_de_la_auditoria(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True,
                           text=True, timeout=180)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_el_horario_es_de_10_a_6_en_todo_el_cerebro(self):
        self.assertNotRegex(CEREBRO, r"9:00\s?am|8:00\s?pm")
        self.assertIn("10:00 am a 6:00 pm", CEREBRO)

    def test_zelle_no_esta_como_disponible(self):
        i = CEREBRO.index("const METODOS_PAGO = [")
        bloque = CEREBRO[i:CEREBRO.index("];", i)]
        linea = [l for l in bloque.splitlines() if "Zelle" in l][0]
        self.assertIn("disponible: false", linea)

    def test_el_precio_de_un_producto_pasa_por_fmtP(self):
        # fmtUSD(x.precio) sobre un producto convierte los MN en «$»: lo único
        # permitido es el interior de fmtP.
        malos = re.findall(r"fmtUSD\(\w+(?:\.\w+)?\.precio\)", CEREBRO)
        self.assertEqual(malos, [], "un precio de producto sin pasar por fmtP")
        self.assertIn("moneda: String(p.moneda", CEREBRO)  # _normalizar la conserva


if __name__ == "__main__":
    unittest.main()
