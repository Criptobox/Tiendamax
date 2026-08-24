"""
Corre tests/ficha_check.mjs dentro de unittest, que es lo que ejecuta CI.

La ficha ampliada se guarda en cuatro campos (ficha, caracteristicas,
idealPara, incluye) pero se edita como texto, así que el admin la abre con
`tmFichaATexto` y la guarda con `tmParsearFicha`. Si las dos no encajan, abrir
un producto para cambiarle el precio le cambia también la ficha: nada falla,
nada avisa, y solo se nota mirando el producto publicado.

El fallo concreto que motivó esto: "1x Ficha técnica del fabricante" es un
renglón de *Qué incluye*, y el parser lo tomaba por encabezado de sección
—corto, sin dos puntos, dice "ficha técnica"—, cambiaba de sección y el renglón
se perdía.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "ficha_check.mjs"
FICHA = ROOT / "js" / "src" / "tm-ficha.src.js"
ADMIN = ROOT / "admin.html"


class FichaEditableTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_los_encabezados_van_anclados(self):
        # Un patrón sin ^ vuelve a tragarse renglones que solo *mencionan* el
        # nombre de otra sección. Es el fallo de arriba, y es mudo.
        src = FICHA.read_text(encoding="utf-8")
        bloque = re.search(r"_TM_FICHA_SECCIONES = \[(.*?)\];", src, re.S)
        self.assertIsNotNone(bloque, "no encontré la tabla de secciones")
        for linea in bloque.group(1).strip().splitlines():
            linea = linea.strip()
            if not linea.startswith("["):
                continue
            self.assertTrue(
                linea.startswith("[/^"),
                f"este patrón de sección no está anclado al principio de la línea: {linea}",
            )

    def test_el_modal_de_edicion_carga_y_guarda_la_ficha(self):
        # Los cuatro campos que dibuja el modal del producto tienen que poder
        # llenarse Y corregirse desde el panel; cargar sin guardar deja al
        # dueño editando algo que no se publica.
        html = ADMIN.read_text(encoding="utf-8")
        self.assertIn('id="pedit-ficha"', html, "el modal de edición no tiene el campo de ficha")
        self.assertIn("tmFichaATexto(p)", html, "apEdit no carga la ficha guardada")
        self.assertIn("tmParsearFicha(_pfi.value)", html, "apEditSave no guarda la ficha editada")
        # Vaciar el campo tiene que borrar los cuatro campos, no dejar los
        # viejos colgando en el producto.
        self.assertIn("else delete p[k]", html,
                      "vaciar la ficha no borra los bloques anteriores")
