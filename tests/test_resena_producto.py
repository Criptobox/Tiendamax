"""Reseñas de la portada con la foto pequeña del producto (resena_producto_check.mjs)."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "js" / "src" / "tm-config.src.js").read_text(encoding="utf-8")


class ResenaProductoTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible")
        r = subprocess.run([node, str(ROOT / "tests" / "resena_producto_check.mjs")], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_toda_resena_lleva_su_producto(self):
        """Las que llegan de Firebase o del caché sin productoId lo reciben de la clave."""
        self.assertEqual(SRC.count("if (!r.productoId) r.productoId = pid"), 1)
        self.assertEqual(SRC.count("if (r && !r.productoId) r.productoId = pid"), 2)


if __name__ == "__main__":
    unittest.main()
