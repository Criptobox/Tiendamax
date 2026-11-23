"""🏷️ Categorías: seguir en la misma al agregar subcategorías, color por categoría
y que lo recién creado salga en los selectores del producto.

El comportamiento lo comprueba tests/categorias_color_check.mjs en el panel y la
tienda reales (con un GitHub de mentira que recuerda lo subido). Lo de aquí son
los contratos que se leen en el código y que, si se pierden, no dan ningún error:

 · todo el que reescribe categorias.json lleva `colores`, o «Actualizar tienda»
   los borraría;
 · la tienda no vuelve a la coincidencia parcial de subcadenas ni a un hash
   para las categorías sin color;
 · el selector de categoría del modal de editar parte de las DECLARADAS.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")
CATALOGO = (RAIZ / "js" / "src" / "tm-catalog.src.js").read_text(encoding="utf-8")
DATOS = (RAIZ / "js" / "src" / "tm-data.src.js").read_text(encoding="utf-8")
ICONOS = (RAIZ / "js" / "src" / "tm-iconos.src.js").read_text(encoding="utf-8")
COPILOTO = (RAIZ / "js" / "admin-copilot.js").read_text(encoding="utf-8")


class EnNavegadorTest(unittest.TestCase):
    def test_panel_y_tienda(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "categorias_color_check.mjs")], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=500)
        self.assertEqual(r.returncode, 0, "\n" + (r.stdout + r.stderr).strip())


class ContratosTest(unittest.TestCase):
    def test_los_dos_escritores_del_motor_llevan_los_colores(self):
        self.assertEqual(CATALOGO.count("window.tmColoresParaSubir("), 2,
                         "guardarCategorias y _tmMergeCategoriasConRepo deben llevar `colores`")

    def test_el_panel_publica_solo_esa_clave(self):
        m = re.search(r"async function catColSubir\(\)\{.*?\n\}\n", ADMIN, re.S)
        self.assertTrue(m, "no encuentro catColSubir")
        cuerpo = m.group(0)
        # relee antes de escribir y escribe el fichero entero con solo esas dos claves cambiadas
        self.assertIn("_tmLeerJsonRepoFresco", cuerpo)
        self.assertIn("Object.assign({}, remoto, _catColAArchivo(f))", cuerpo)
        self.assertIn("Array.isArray(remoto.nombres)", cuerpo, "sin haberlo leído no se escribe")

    def test_lapida_al_volver_a_automatico(self):
        self.assertIn("_catColPoner(nm, null)", ADMIN)

    def test_la_tienda_copia_los_colores_salvo_en_el_panel(self):
        m = re.search(r"function tmAplicarColores\(nuevo\) \{\n\s+if \(_tmEsPanel\(\)\) return false;", DATOS)
        self.assertTrue(m, "en el panel mandan los colores elegidos aún sin publicar")
        self.assertGreaterEqual(DATOS.count("tmAplicarColores("), 3, "carga inicial y refresco en vivo deben aplicarlos")

    def test_sin_coincidencia_parcial_ni_hash(self):
        m = re.search(r"function tmColorCategoria\(nombre\) \{.*?\n\}\n", ICONOS, re.S)
        self.assertTrue(m)
        cuerpo = m.group(0)
        self.assertNotIn(".includes(", cuerpo, "la coincidencia parcial de subcadenas hacía que dos categorías compartieran color")
        self.assertNotIn("charCodeAt", ICONOS[ICONOS.index("function tmColorCategoria"):], "el hash sobre una paleta chica es lo que repetía colores")
        self.assertIn("tmColoresElegidos()", cuerpo, "lo elegido por el dueño manda primero")

    def test_el_cartel_del_anuncio_lee_el_color_elegido(self):
        self.assertIn("tm_cat_colores", COPILOTO)

    def test_el_selector_de_editar_parte_de_las_categorias_declaradas(self):
        m = re.search(r"function apCatsParaSelect\(actual\)\{.*?\n\}\n", ADMIN, re.S)
        self.assertTrue(m)
        self.assertIn("catNombres()", m.group(0))
        self.assertIn("apCatsParaSelect(p.categoria)", ADMIN)

    def test_el_selector_de_subcategoria_recuerda_la_categoria(self):
        self.assertIn("CAT_SUB_SEL=cat;", ADMIN)
        self.assertIn("catSubSel(this.value)", ADMIN, "un onchange en línea no ve las variables del bloque: tiene que ser una función")


if __name__ == "__main__":
    unittest.main()
