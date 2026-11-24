"""Selección de categoría y subcategoría, tienda y admin (selector_categorias_check.mjs)."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN = (ROOT / "admin.html").read_text(encoding="utf-8")


class SelectorTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible")
        r = subprocess.run([node, str(ROOT / "tests" / "selector_categorias_check.mjs")], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_los_select_siguen_siendo_la_fuente_de_verdad(self):
        """Los botones solo se pintan encima: el código sigue leyendo estos ids."""
        for i in ("productCategory", "productSubcategory", "pedit-cat", "pedit-subcat"):
            self.assertIn(f'id="{i}"', ADMIN)
        self.assertIn("['productCategory','productSubcategory'], ['pedit-cat','pedit-subcat']", ADMIN)


if __name__ == "__main__":
    unittest.main()
