"""
Protege la unificación de la forma de los botones (css/botones-unificados.css).

Historia: la tienda llegó a tener 126 reglas de `border-radius` sobre botones
repartidas en 7 hojas, muchas con `!important`, pisándose entre sí — el mismo
tipo de botón salía píldora en un sitio y cuadrado en otro, y cada arreglo
puntual duraba hasta que otra hoja volvía a ganar la cascada. Se centralizó en
una capa de componente con un token único.

Ese arreglo depende de DOS cosas frágiles que aquí se blindan:
  1. que la hoja se incluya en el bundle, y
  2. que vaya la ÚLTIMA — si alguien la mueve o inserta otra hoja detrás,
     la unificación deja de aplicar en silencio y vuelve el problema.

Corre sin red y sin navegador: solo lee archivos y la lista ORDEN.
"""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_css  # noqa: E402

HOJA = "botones-unificados.css"


class BotonesUnificadosTest(unittest.TestCase):
    def test_la_hoja_va_la_ultima_del_bundle(self):
        self.assertEqual(
            build_css.ORDEN[-1], HOJA,
            f"{HOJA} tiene que ser el ÚLTIMO de ORDEN en build_css.py: su "
            f"trabajo es ganar la cascada a las hojas anteriores. Ahora el "
            f"último es {build_css.ORDEN[-1]!r}, así que esa hoja pisa la "
            f"forma de los botones y vuelve el descuadre."
        )

    def test_define_los_tokens_de_forma(self):
        css = (ROOT / "css" / HOJA).read_text(encoding="utf-8")
        for token in ("--tm-radius-btn:", "--tm-radius-chip:", "--tm-radius-btn-icon:"):
            self.assertIn(
                token, css,
                f"Falta el token {token} en {HOJA}. Es la fuente única de la "
                f"forma de los botones; sin él las reglas no tienen de dónde leer."
            )

    def test_las_reglas_usan_el_token_y_no_valores_sueltos(self):
        """Si una regla escribe el radio a mano, cambiar el token deja de
        cambiar ese botón — que es justo el problema que se venía arrastrando."""
        css = (ROOT / "css" / HOJA).read_text(encoding="utf-8")
        cuerpo = css.split(":root", 1)[-1]
        cuerpo = re.sub(r"/\*.*?\*/", "", cuerpo, flags=re.S)   # fuera comentarios
        cuerpo = cuerpo.split("}", 1)[-1]                        # fuera el :root
        crudos = [
            m.group(1).strip()
            for m in re.finditer(r"border-radius\s*:\s*([^;}]+)", cuerpo)
            if "var(" not in m.group(1)
        ]
        self.assertEqual(
            crudos, [],
            f"En {HOJA} hay border-radius con valores escritos a mano en vez "
            f"de var(--tm-radius-*): {crudos}. Cámbialos por el token, o "
            f"cambiar la forma de la tienda dejará de ser un solo lugar."
        )

    def test_bundle_incluye_la_hoja(self):
        bundle = ROOT / "css" / "bundle.css"
        if not bundle.exists():
            self.skipTest("bundle.css no está generado en este entorno")
        self.assertIn(
            "--tm-radius-btn", bundle.read_text(encoding="utf-8"),
            "bundle.css no contiene los tokens de botón: se quedó sin "
            "regenerar tras tocar el CSS (corre scripts/build_css.py)."
        )


if __name__ == "__main__":
    unittest.main()
