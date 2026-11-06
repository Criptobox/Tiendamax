"""
Categorías y subcategorías: lo editado en el panel se guarda y no vuelve atrás.

El dueño editaba una subcategoría, volvía a entrar y seguía igual. Tres causas
silenciosas (ver el comentario de CATEGORIAS / SUBCATS en admin.html):

 · al abrir, se leía el repo encima de lo editado y aún sin publicar;
 · la fusión con el repo era una unión pura, así que lo borrado o renombrado volvía;
 · con un producto modificado en la misma publicación, subcategorias.json no se subía.

El comportamiento se comprueba en el navegador con un GitHub de mentira que
recuerda lo que se sube: tests/catsub_check.mjs.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
CATALOGO = (RAIZ / "js" / "src" / "tm-catalog.src.js").read_text(encoding="utf-8")
DATOS = (RAIZ / "js" / "src" / "tm-data.src.js").read_text(encoding="utf-8")


class CatSubGuardadoTest(unittest.TestCase):
    def test_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "catsub_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=400)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_subcategorias_se_suben_aunque_haya_productos_modificados(self):
        m = re.search(r"\['config\.json'[^\]]*\]\.includes\(a\.path\)", CATALOGO)
        self.assertTrue(m, "no encuentro la lista de ficheros que se suben con productos modificados")
        self.assertIn("subcategorias.json", m.group(0))

    def test_el_cargador_de_la_tienda_no_pisa_lo_editado_en_el_panel(self):
        # tm-data copiaba categorias.json del sitio encima de las categorías editadas, también en el panel.
        self.assertGreaterEqual(DATOS.count("tm_catsub_pend"), 2)

    def test_la_fusion_no_resucita_lo_quitado(self):
        self.assertIn("subcategoriasEliminadas", CATALOGO)
        self.assertIn("categoriasEliminadas", CATALOGO)


if __name__ == "__main__":
    unittest.main()
