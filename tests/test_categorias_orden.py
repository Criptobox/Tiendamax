"""Tarjetas de categoría: más disponibles primero (categorias_orden_check.mjs)."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class OrdenTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible")
        r = subprocess.run([node, str(ROOT / "tests" / "categorias_orden_check.mjs")], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_los_dos_pintados_usan_el_mismo_orden(self):
        st = (ROOT / "js/src/tm-state.src.js").read_text(encoding="utf-8")
        ui = (ROOT / "js/src/tm-ui.src.js").read_text(encoding="utf-8")
        self.assertIn("tmCatsPorDisponibles(productos, tmCategoriasVisibles", st)
        self.assertIn("tmCatsPorDisponibles(localProds", ui)


if __name__ == "__main__":
    unittest.main()
