"""
admin2.html — el panel nuevo.

Es un archivo aparte a propósito: admin.html son 6.400 líneas en producción y
meterle el rediseño a trozos ya salió mal una vez (la fila quedó ilegible en el
teléfono y hubo que revertir). Aquí el sistema de diseño se construye desde el
principio, y el panel de siempre no se toca.

Lo que este test fija es lo que NO se ve fallar:

· Que admin2 no rompa los datos del panel clásico. Los dos leen y escriben
  localStorage['productos'], así que si admin2 guardara en otra clave, editarías
  aquí y publicarías desde allí el catálogo viejo sin enterarte.

· Que ninguna piel se deje un token y que el texto sobre el acento se lea. Con
  la lima y la grafito el acento es clarísimo: letra blanca encima es invisible.

· Que los íconos del sprite lleven viewBox. Un <symbol> sin viewBox se dibuja
  recortado, no encogido, y el ícono sale como un trozo de línea suelta — que es
  exactamente lo que pasó al escribirlo.

· Que el panel no se quede con datos de mentira: nada de productos inventados
  dentro del archivo.

La prueba de que se puede TRABAJAR con él (subir stock, editar, buscar, que
guarde) está en tests/admin2_check.mjs, que lo abre en un navegador real.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
A2 = (RAIZ / "admin2.html").read_text(encoding="utf-8")

PIELES = ("lima", "azul", "violeta", "grafito")
TOKENS = {"--bg", "--glass", "--edge", "--ink", "--mut", "--dim",
          "--br", "--br2", "--sobre", "--br-tinta", "--ok", "--warn", "--crit"}


def _bloque(piel):
    m = re.search(r'html\[data-piel="%s"\]\s*\{(.*?)\n\}' % piel, A2, re.S)
    return m.group(1) if m else None


def _lum(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def _contraste(a, b):
    la, lb = _lum(a), _lum(b)
    lo, hi = sorted((la, lb))
    return (hi + 0.05) / (lo + 0.05)


class DatosCompartidosTest(unittest.TestCase):

    def test_usa_las_mismas_claves_que_el_panel_clasico(self):
        for clave in ("'productos'", "'registroVentas'", "'tm_piel'"):
            self.assertIn(clave, A2,
                          f"admin2 no usa {clave}: los dos paneles dejarían de verse los datos")

    def test_no_escribe_en_una_clave_propia_de_catalogo(self):
        claves = set(re.findall(r"localStorage\.setItem\(\s*'([a-zA-Z_0-9]+)'", A2))
        claves |= set(re.findall(r"guardar\(\s*'([a-zA-Z_0-9]+)'", A2))
        permitidas = {"productos", "registroVentas", "tm_piel"}
        self.assertEqual(claves - permitidas, set(),
                         f"admin2 guarda en claves que el panel clásico no lee: {claves - permitidas}")

    def test_el_panel_clasico_sigue_alcanzable(self):
        self.assertIn('href="admin.html"', A2,
                      "sin salida al panel clásico, publicar y los carteles quedan inalcanzables")

    def test_no_trae_productos_inventados(self):
        # El catálogo se lee de localStorage o de productos.json. Un array de
        # productos escrito a mano dentro del archivo sería un panel de mentira.
        self.assertNotRegex(A2, r"nombre\s*:\s*['\"]",
                            "hay productos escritos a mano dentro de admin2.html")
        self.assertIn("productos.json", A2, "no hay respaldo desde el repo")


class PielesTest(unittest.TestCase):

    def test_cada_piel_define_todos_los_tokens(self):
        faltan = {}
        for piel in PIELES:
            b = _bloque(piel)
            self.assertIsNotNone(b, f"falta el bloque de la piel «{piel}»")
            tiene = set(re.findall(r'(--[a-z0-9-]+)\s*:', b))
            if TOKENS - tiene:
                faltan[piel] = sorted(TOKENS - tiene)
        self.assertEqual(faltan, {}, f"pieles incompletas: {faltan}")

    def test_el_oro_no_cambia_con_la_piel(self):
        for piel in PIELES:
            self.assertNotIn("--gold:", _bloque(piel),
                             f"«{piel}» redefine --gold, que significa moneda nacional")

    def test_el_texto_sobre_el_acento_se_lee(self):
        raiz = re.search(r':root\{(.*?)\n\}', A2, re.S).group(1)
        casos = [("naranja", raiz)] + [(p, _bloque(p)) for p in PIELES]
        flojos = {}
        for nombre, b in casos:
            rgb = re.search(r'--br:\s*([\d,\s]+);', b).group(1)
            acc = "#%02X%02X%02X" % tuple(int(x) for x in rgb.split(","))
            tinta = re.search(r'--sobre:\s*(#[0-9a-fA-F]{3,6})', b).group(1)
            c = _contraste(acc, tinta)
            if c < 4.5:
                flojos[nombre] = f"{acc} sobre {tinta} = {c:.2f}:1"
        self.assertEqual(flojos, {}, f"acento ilegible en: {flojos}")

    def test_se_aplica_antes_de_pintar(self):
        cabeza = A2[:A2.index("<style>")]
        self.assertIn("tm_piel", cabeza,
                      "la piel se aplicaría después del primer pintado y parpadearía")


class IconosTest(unittest.TestCase):

    def test_todos_los_simbolos_llevan_viewbox(self):
        simbolos = re.findall(r'<symbol id="(i-[a-z]+)"([^>]*)>', A2)
        self.assertGreater(len(simbolos), 10, "no encuentro el sprite de íconos")
        sin = [i for i, attrs in simbolos if "viewBox" not in attrs]
        self.assertEqual(sin, [],
                         f"estos íconos saldrían recortados en vez de encogidos: {sin}")

    def test_los_productos_usan_los_iconos_de_la_tienda(self):
        self.assertIn("tmIconoSVG", A2, "admin2 no reutiliza TM_ICONOS")
        self.assertIn("tm-bundle.js", A2, "sin el bundle no hay tabla de íconos")

    def test_no_hay_emoji_de_sistema_como_interfaz(self):
        # Los emoji de los NOMBRES de producto sí se conservan (son del
        # catálogo); lo que no puede haber es emoji como botón o encabezado.
        i = A2.index('<div id="a2-panel"')
        j = A2.index('<svg width="0" height="0"')
        marcado = A2[i:j]
        sueltos = re.findall(r'>\s*([\U0001F300-\U0001FAFF])', marcado)
        self.assertEqual(sueltos, [],
                         f"hay emoji usados como ícono de interfaz: {sueltos}")


class AccesibilidadTest(unittest.TestCase):

    def test_la_navegacion_marca_donde_estas(self):
        self.assertIn('aria-current="page"', A2)

    def test_los_botones_de_solo_icono_tienen_nombre(self):
        # La barra del teléfono son cinco botones sin texto.
        nav = re.search(r'<nav class="a2-nav-movil".*?</nav>', A2, re.S).group(0)
        botones = re.findall(r'<button([^>]*)>', nav)
        sin = [b for b in botones if "title=" not in b and "aria-label" not in b]
        self.assertEqual(sin, [], "botones de la barra móvil sin nombre accesible")

    def test_respeta_quien_pide_menos_movimiento(self):
        self.assertIn("prefers-reduced-motion", A2)


if __name__ == "__main__":
    unittest.main()
