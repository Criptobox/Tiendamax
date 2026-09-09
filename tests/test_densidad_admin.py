"""
La lista de productos y el Copiloto: las dos cosas que hacían del panel un
sitio incómodo, y que no fallan solas si alguien las deshace.

LA FILA. Cada producto era una tarjeta de ~130 px con el stock en una segunda
línea. Con 132 productos eso son 44 pantallas de scroll para verlos todos, y
la pantalla de productos es donde el dueño pasa el día. Ahora es una fila de
44 px con nombre, precio, comisión, stock y acciones en la misma línea: caben
16 en vez de 3. Si alguien vuelve a meter la altura dentro de la fila, no
falla nada — sólo se vuelve a scrollear el triple.

EL COPILOTO. En escritorio era `position:fixed` encima del contenido y tapaba
el 35 % de la pantalla: con la fila nueva se comía el precio, el stock y los
botones de cada producto. Ahora, al abrirlo, `body` recibe `.tm-copi-col` y el
contenido se estrecha para dejarle sitio. Si se pierde esa clase el panel
vuelve a flotar encima y tapa la lista sin que nada avise.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")
COPI = (RAIZ / "js" / "admin-copilot.js").read_text(encoding="utf-8")


class FilaDeProductoTest(unittest.TestCase):

    def test_la_fila_tiene_una_altura_fija_y_baja(self):
        m = re.search(r'\.pfila\s*\{([^}]*)\}', ADMIN)
        self.assertIsNotNone(m, "no encuentro la regla .pfila")
        alto = re.search(r'height:\s*(\d+)px', m.group(1))
        self.assertIsNotNone(alto, ".pfila ya no fija la altura de la fila")
        self.assertLessEqual(int(alto.group(1)), 48,
                             "la fila creció: con 132 productos cada píxel son pantallas de scroll")

    def test_todo_va_en_la_misma_linea(self):
        # Nombre, precio, comisión, stock y acciones: si alguna desaparece del
        # generador, la fila deja de servir para trabajar y hay que abrir el
        # editor para cualquier cosa.
        i = ADMIN.index("function apCardHTML(p){")
        cuerpo = ADMIN[i:i + 2600]
        for clase in ("pf-nm", "pf-pr", "pf-co", "pf-chip", "pf-mas", "pf-menos", "pf-ac"):
            self.assertIn(clase, cuerpo, f"la fila perdió {clase}")

    def test_el_stock_se_edita_sin_abrir_nada(self):
        i = ADMIN.index("function apCardHTML(p){")
        cuerpo = ADMIN[i:i + 2600]
        self.assertIn("apStock('${id}',-1)", cuerpo)
        self.assertIn("apStock('${id}',1)", cuerpo)

    def test_el_estado_se_ve_por_color_no_solo_por_numero(self):
        for cls in ("ok", "low", "out"):
            self.assertRegex(ADMIN, r'\.pf-chip\.%s\s*\{[^}]*color:' % cls,
                             f"la pastilla de stock «{cls}» perdió su color")

    def test_en_el_telefono_no_se_amontona(self):
        # A 820 px la fila pasa a dos renglones cortos en vez de encogerse
        # hasta ser ilegible.
        self.assertRegex(ADMIN, r'@media\s*\(max-width:820px\)\s*\{[^@]*\.pfila',
                         "no hay adaptación de la fila para pantallas estrechas")


class CopilotoColumnaTest(unittest.TestCase):

    def test_al_abrir_marca_el_body(self):
        i = COPI.index("function openSheet()")
        self.assertIn("tm-copi-col", COPI[i:i + 340],
                      "openSheet ya no marca el body: el panel volvería a flotar encima")

    def test_al_cerrar_lo_quita(self):
        i = COPI.index("function closeSheet()")
        self.assertIn("tm-copi-col", COPI[i:i + 300],
                      "closeSheet no limpia la clase: el contenido se quedaría estrechado")

    def test_el_contenido_deja_sitio_a_la_columna(self):
        self.assertRegex(COPI, r'body\.tm-copi-col\s+\.content\s*\{[^}]*padding-right',
                         "sin padding en .content la columna vuelve a tapar la lista")

    def test_solo_es_columna_en_pantalla_ancha(self):
        # En un teléfono una columna lateral no cabe: ahí sigue siendo una
        # hoja que sube desde abajo, que es lo correcto.
        m = re.search(r'@media\s*\(min-width:\s*(\d+)px\)\s*\{\s*body\.tm-copi-col', COPI)
        self.assertIsNotNone(m, "la columna no está detrás de una media query de escritorio")
        self.assertGreaterEqual(int(m.group(1)), 900,
                                "la columna se activaría en pantallas donde no cabe")


if __name__ == "__main__":
    unittest.main()
