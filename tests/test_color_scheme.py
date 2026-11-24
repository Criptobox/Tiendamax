"""color-scheme sigue al modo claro/oscuro de la tienda (color_scheme_check.mjs)."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ColorSchemeTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible")
        r = subprocess.run([node, str(ROOT / "tests" / "color_scheme_check.mjs")], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


if __name__ == "__main__":
    unittest.main()
