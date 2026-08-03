"""
Contraste de las páginas generadas (/p/ y /c/), según WCAG 2.1 AA.

Por qué un test y no un vistazo: el contraste no se ve mal, se ve "un poco
flojo". Nadie abre una ficha y piensa "esto son 2.68:1"; simplemente el precio
tachado o el pie cuestan de leer al sol, que es donde se mira un móvil en Cuba.
Y al retocar un color es facilísimo volver a bajar de 4.5 sin enterarse.

Los valores salen de las plantillas reales de scripts/regenerate_artifacts.py,
no de una copia, para que un cambio de color se note aquí.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
GEN = RAIZ / "scripts" / "regenerate_artifacts.py"

MIN_AA = 4.5          # texto normal
MIN_AA_GRANDE = 3.0   # >=18.66px en negrita o >=24px


def _luminancia(hexcolor: str) -> float:
    h = hexcolor.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contraste(a: str, b: str) -> float:
    la, lb = _luminancia(a), _luminancia(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


class FormulaTest(unittest.TestCase):
    """Anclas conocidas: si la fórmula se rompe, el resto del fichero miente."""

    def test_extremos(self):
        self.assertAlmostEqual(21.0, contraste("#000000", "#ffffff"), places=1)
        self.assertAlmostEqual(1.0, contraste("#123456", "#123456"), places=3)

    def test_es_simetrica(self):
        self.assertAlmostEqual(contraste("#0C0806", "#8a8078"),
                               contraste("#8a8078", "#0C0806"), places=6)


class PlantillasTest(unittest.TestCase):
    """Las combinaciones que Lighthouse marcaba como fallo, ancladas aquí."""

    FONDO = "#0C0806"

    CASOS = [
        # (descripción, color de texto, fondo, mínimo)
        ("pie de página", "#8a8078", FONDO, MIN_AA),
        ("enlace del pie", "#C9A96E", FONDO, MIN_AA),
        ("precio tachado", "#8a8078", FONDO, MIN_AA),
        ("descripción", "#a09080", FONDO, MIN_AA),
        ("migas de pan", "#8a7b6c", FONDO, MIN_AA),
        # Los botones conservan el color de marca y oscurecen el texto, que es
        # lo que ya hacía .tm-cat con el coral. Al revés (blanco sobre el verde
        # de WhatsApp) daba 1.98.
        ("botón WhatsApp", "#062B14", "#25D366", MIN_AA),
        ("botón naranja (extremo claro)", "#2B0E00", "#FF6B35", MIN_AA),
        ("botón naranja (extremo oscuro)", "#2B0E00", "#E8501E", MIN_AA),
        ("etiqueta de categoría", "#241100", "#FF6B35", MIN_AA),
        ("agotado en la tarjeta", "#9a9088", "#181310", MIN_AA),
        ("precio destacado", "#FF6B35", FONDO, MIN_AA_GRANDE),
    ]

    def test_todas_las_combinaciones_pasan_aa(self):
        for desc, fg, bg, minimo in self.CASOS:
            with self.subTest(desc):
                r = contraste(fg, bg)
                self.assertGreaterEqual(
                    round(r, 2), minimo,
                    f"{desc}: {fg} sobre {bg} da {r:.2f}:1, por debajo de {minimo}")


class GeneradorSincronizadoTest(unittest.TestCase):
    """Que los colores de arriba sigan siendo los que el generador escribe.

    Sin esto el test pasaría para siempre comprobando colores que ya nadie usa.
    """

    @classmethod
    def setUpClass(cls):
        cls.fuente = GEN.read_text(encoding="utf-8")

    def test_los_colores_comprobados_estan_en_el_generador(self):
        for color in ("#8a8078", "#062B14", "#2B0E00", "#9a9088"):
            self.assertIn(color, self.fuente,
                          f"{color} ya no está en regenerate_artifacts.py: "
                          f"actualiza los casos de tests/test_contraste.py")

    def test_no_reaparecen_los_colores_que_fallaban(self):
        # Estos son los que daban 2.68, 3.47 y 4.30 sobre el fondo oscuro.
        for malo, donde in ((r"color:#555\b", "pie"), (r"color:#666\b", "precio tachado"),
                            (r"color:#888\b", "textos secundarios")):
            self.assertIsNone(re.search(malo, self.fuente),
                              f"vuelve a aparecer un color que no pasa AA en {donde}")

    def test_el_enlace_del_pie_no_depende_solo_del_color(self):
        # Quien no distingue bien los colores necesita otra señal de que es un
        # enlace; por eso lleva subrayado.
        self.assertIn(".tm-ftr a{{color:#C9A96E;text-decoration:underline}}", self.fuente)


if __name__ == "__main__":
    unittest.main()
