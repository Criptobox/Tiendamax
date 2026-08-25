"""
Las capas fijas del panel (toast, burbuja del Copiloto) no pueden dejar zonas
muertas encima del contenido.

El fallo que motiva esto: `.toast` era position:fixed con z-index 99999 y
opacity:0 mientras estaba oculto, pero sin pointer-events:none. Un elemento con
opacity:0 sigue recibiendo los toques, así que había un rectángulo invisible de
340x73 clavado abajo a la derecha en TODAS las pantallas del panel —no solo los
2.6 segundos que el aviso se ve— y lo que cayera debajo no respondía. No falla
nada ni queda rastro en la consola: el botón simplemente no hace nada.

.tm-copilot-toast (js/admin-copilot.js) ya tenía el arreglo; .toast nunca lo
recibió.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "admin.html"
COPILOT = ROOT / "js" / "admin-copilot.js"


def _reglas(css, selector):
    """Los cuerpos de las reglas de `selector` que empiezan renglón.

    Anclado al principio de línea a propósito: buscando el selector en
    cualquier parte, el comentario de arriba de la regla entraba en la
    coincidencia y no encajaba nunca."""
    pat = re.compile(r"^\s*" + re.escape(selector) + r"\s*\{([^{}]*)\}", re.M)
    return [m.group(1) for m in pat.finditer(css)]


def _regla_base(css, selector):
    """La regla de fuera del @media: es la que fija position y pointer-events."""
    for cuerpo in _reglas(css, selector):
        if "position:fixed" in cuerpo.replace(" ", ""):
            return cuerpo
    return None


class CapasFijasTest(unittest.TestCase):
    def setUp(self):
        self.admin = ADMIN.read_text(encoding="utf-8")

    def test_el_toast_no_intercepta_toques(self):
        cuerpo = _regla_base(self.admin, ".toast")
        self.assertIsNotNone(
            cuerpo,
            "no encontré la regla .toast con position:fixed en admin.html; si "
            "dejó de ser fixed, revisá si esta prueba sigue aplicando")
        self.assertIn(
            "pointer-events:none", cuerpo.replace(" ", ""),
            "el toast está fijo por encima de todo con opacity:0: sin "
            "pointer-events:none deja una zona muerta permanente sobre el "
            "contenido y los botones de debajo no responden",
        )

    def test_el_toast_deja_libre_la_burbuja_del_copiloto(self):
        # La burbuja mide 62px y arranca en bottom:24px (escritorio) /
        # bottom:76px (teléfono). El toast tiene que quedar por encima de eso o
        # la tapa cada vez que aparece un aviso.
        copilot = COPILOT.read_text(encoding="utf-8")
        self.assertIn("bottom:calc(76px + env(safe-area-inset-bottom))", copilot,
                      "cambió el bottom de la burbuja en el teléfono: ajustá el "
                      "del toast en admin.html junto con este número")
        self.assertIn("height:62px", copilot,
                      "cambió el alto de la burbuja: ajustá el bottom del toast")

        def bottom_px(cuerpo):
            m = re.search(r"bottom:\s*calc\(\s*(\d+)px", cuerpo or "")
            return int(m.group(1)) if m else None

        base = bottom_px(_regla_base(self.admin, ".toast"))
        self.assertIsNotNone(base, "el .toast ya no separa por bottom en px")
        self.assertGreaterEqual(base, 24 + 62, "el toast tapa la burbuja en escritorio")

        movil = None
        for m in re.finditer(r"@media\s*\(max-width:\s*560px\)\s*\{(.*?)\n  \}", self.admin, re.S):
            if ".toast" in m.group(1):
                movil = bottom_px(m.group(1))
        self.assertIsNotNone(movil, "no encontré el .toast del media query de teléfono")
        self.assertGreaterEqual(movil, 76 + 62, "el toast tapa la burbuja en el teléfono")
