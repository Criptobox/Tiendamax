"""
Las pieles del panel (⚙️ Configuración → Estilo del panel).

Cambiar de piel es redefinir tokens CSS, nada más. Eso lo hace barato y
también fácil de romper de dos formas que NO se ven como un fallo:

1. Que una piel se deje un token. El panel no se rompe: hereda el del :root,
   así que sale un naranja suelto sobre fondo azul y parece "un detalle".

2. Que alguien tokenice los colores del CANVAS. Esas funciones dibujan los
   carteles y las imágenes de catálogo que se le mandan al cliente por
   WhatsApp: llevan el naranja de TiendaMax a fuego. Si siguieran a la piel,
   un día publicarías un cartel de TiendaMax en verde lima y no te enterarías
   hasta verlo en el estado de alguien. Además ctx.fillStyle no entiende
   var(--x): se pintaría de negro.

3. Que el texto sobre el acento se quede en blanco. Con la piel lima o la
   grafito el acento es clarísimo y un botón blanco con letra blanca no se ve.
   Pasa en dos sitios: el botón primario y el destino activo de la barra
   lateral, que también se pinta con el acento de fondo.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")

# Los tokens que cada piel tiene que redefinir enteros.
OBLIGATORIOS = {"--bg", "--card", "--card2", "--text", "--muted", "--dim",
                "--o", "--oo", "--o-rgb", "--o-tinta",
                "--green", "--red", "--yellow", "--blue", "--purple"}
PIELES = ("lima", "azul", "violeta", "grafito")


def _bloque(piel):
    m = re.search(r'html\[data-piel="%s"\]\s*\{(.*?)\}' % piel, ADMIN, re.S)
    return m.group(1) if m else None


def _luminancia(hexc):
    h = hexc.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def _contraste(a, b):
    la, lb = _luminancia(a), _luminancia(b)
    lo, hi = sorted((la, lb))
    return (hi + 0.05) / (lo + 0.05)


class PielesTest(unittest.TestCase):

    def test_cada_piel_redefine_todos_los_tokens(self):
        faltas = {}
        for piel in PIELES:
            b = _bloque(piel)
            self.assertIsNotNone(b, f"no existe el bloque de la piel «{piel}»")
            tiene = set(re.findall(r'(--[a-z0-9-]+)\s*:', b))
            fal = OBLIGATORIOS - tiene
            if fal:
                faltas[piel] = sorted(fal)
        self.assertEqual(faltas, {}, f"pieles con tokens sin definir: {faltas}")

    def test_el_oro_no_cambia_con_la_piel(self):
        # --gold significa "moneda nacional" en todo el panel. Si cambiara con
        # la piel dejaría de reconocerse de un vistazo entre tantos dólares.
        for piel in PIELES:
            self.assertNotIn("--gold:", _bloque(piel),
                             f"la piel «{piel}» redefine --gold, que es la moneda nacional")

    def test_el_texto_sobre_el_acento_se_lee(self):
        # Un botón primario es --o de fondo con --o-tinta encima.
        flojos = {}
        for piel in PIELES:
            b = _bloque(piel)
            o = re.search(r'--o:\s*(#[0-9a-fA-F]{3,6})', b).group(1)
            tinta = re.search(r'--o-tinta:\s*(#[0-9a-fA-F]{3,6})', b).group(1)
            c = _contraste(o, tinta)
            if c < 4.5:
                flojos[piel] = f"{o} sobre {tinta} = {c:.2f}:1"
        self.assertEqual(flojos, {}, f"pieles con el botón principal ilegible: {flojos}")

    def test_nada_pinta_blanco_fijo_encima_del_acento(self):
        # Cualquier regla que ponga el acento de fondo tiene que sacar la tinta
        # del token, no de un #fff: con la lima o la grafito el acento es casi
        # blanco y lo de encima desaparece. Pasó con .btn-primary y volvió a
        # pasar con .side-btn.active.
        malos = []
        for regla in re.findall(r'\.[a-z-]+(?:\.[a-z-]+)?\s*\{[^}]*\}', ADMIN):
            if "var(--o)" not in regla and "var(--oo)" not in regla:
                continue
            if "background" not in regla:
                continue
            m = re.search(r'color:\s*(#[0-9a-fA-F]{3,6}|white)', regla)
            if m:
                malos.append(regla.strip()[:70])
        self.assertEqual(malos, [],
                         "estas reglas ponen un color fijo encima del acento: %r" % malos)

    def test_el_rgb_del_acento_coincide_con_el_hex(self):
        # --o-rgb alimenta los brillos: si se desincroniza del --o, el halo
        # queda de un color y el botón de otro, y no lo canta nadie.
        malos = {}
        for piel in PIELES:
            b = _bloque(piel)
            o = re.search(r'--o:\s*#([0-9a-fA-F]{6})', b).group(1)
            rgb = re.search(r'--o-rgb:\s*([\d,\s]+);', b).group(1)
            esperado = ",".join(str(int(o[i:i + 2], 16)) for i in (0, 2, 4))
            real = ",".join(x.strip() for x in rgb.split(","))
            if esperado != real:
                malos[piel] = f"--o #{o} pero --o-rgb {real} (debería ser {esperado})"
        self.assertEqual(malos, {}, f"acento descuadrado: {malos}")

    def test_el_canvas_conserva_el_naranja_de_tiendamax(self):
        # Los carteles y las imágenes de catálogo los ve el CLIENTE.
        canvas = [l for l in ADMIN.split("\n")
                  if ("ctx." in l or "addColorStop" in l or "createLinear" in l)]
        self.assertGreater(len(canvas), 10, "no encuentro el código de canvas; ¿se movió?")
        con_var = [l.strip()[:90] for l in canvas if "var(--" in l]
        self.assertEqual(con_var, [],
                         "el canvas usa var(): ctx.fillStyle no entiende variables CSS y "
                         "además el cartel del cliente seguiría la piel del panel: %r" % con_var)
        # Y que el naranja de la marca sigue literalmente ahí.
        self.assertTrue(any("#FF6B35" in l for l in canvas),
                        "el naranja TiendaMax desapareció del canvas de los carteles")

    def test_la_piel_se_aplica_antes_de_pintar(self):
        # Aplicarla al arrancar el panel enseñaría el naranja un instante.
        cabeza = ADMIN[:ADMIN.index("<style>")]
        self.assertIn("tm_piel", cabeza,
                      "la piel no se aplica antes del primer <style>: parpadearía al cargar")

    def test_las_funciones_estan_exportadas(self):
        # Los botones usan onclick=, que se resuelve en el ámbito global, y
        # todo este código vive dentro de un IIFE.
        for fn in ("tmPonerPiel", "tmPintarPieles"):
            self.assertIn(f"window.{fn}={fn}", ADMIN,
                          f"{fn} no está exportada: el onclick de los botones no la vería")


if __name__ == "__main__":
    unittest.main()
