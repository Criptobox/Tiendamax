"""
Cada spec del catálogo tiene que empezar por un emoji que tm-iconos sepa
dibujar.

Por qué un test: en la ficha los specs salen como una lista de íconos de línea,
y ninguno de los dos fallos que esto vigila se ve como un fallo.

  - Spec sin emoji: tm-product pone la bolita neutra. No rompe nada, pero en una
    ficha donde los demás specs sí llevan su ícono se lee como si a ese le
    faltara un dato. Eran 170 de 330.
  - Spec con un emoji que NO está en TM_ICONOS: `tmIconoSVG` devuelve el
    genérico, que es una bolsa de la compra. Así, "🦺 Franja reflectiva" y
    "🥥 Sabor Coconut" salían las dos con una bolsa al lado, y eso sí engaña:
    parece un ícono elegido a propósito.

El mapa de íconos se lee del propio js/src/tm-iconos.src.js, así que borrar un
ícono de ahí también cae aquí.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ICONOS_JS = RAIZ / "js" / "src" / "tm-iconos.src.js"
CATALOGOS = ("productos.json", "productos-lite.json")


def _claves_iconos():
    """Las claves de TM_ICONOS, tal cual están escritas en el módulo."""
    src = ICONOS_JS.read_text(encoding="utf-8")
    cuerpo = src.split("const TM_ICONOS = {", 1)[1]
    claves = set(re.findall(r"^\s*'([^']+)':", cuerpo, re.M))
    return claves


# Espejo de tmEsEmojiCP() en js/src/tm-iconos.src.js.
def _es_emoji_cp(cp):
    return ((0x1F000 <= cp <= 0x1FAFF) or (0x2100 <= cp <= 0x21FF)
            or (0x2300 <= cp <= 0x27BF) or (0x2B00 <= cp <= 0x2BFF)
            or (0x2600 <= cp <= 0x26FF)
            or cp in (0x203C, 0x2049, 0x3030, 0x303D, 0xFE0F, 0xFE0E, 0x200D)
            or (0x1F3FB <= cp <= 0x1F3FF))


def _partir_emoji(texto):
    """Espejo de tmPartirEmoji()."""
    s = re.sub(r"^[​‌‍⁠﻿᠎]+", "", str(texto or ""))
    corte = 0
    for ch in s:
        if not _es_emoji_cp(ord(ch)):
            break
        corte += 1
    return s[:corte]


def _normalizar(s):
    """Espejo de tmNormalizarEmoji()."""
    s = re.sub("[︎️‍]", "", s)
    return re.sub("[\U0001F3FB-\U0001F3FF]", "", s)


def _tiene_icono(emoji, claves):
    """Espejo de tmIconoPaths(): el emoji entero, o el primer carácter conocido."""
    e = _normalizar(emoji)
    if not e:
        return False
    return e in claves or any(ch in claves for ch in e)


def _specs(nombre_fichero):
    datos = json.loads((RAIZ / nombre_fichero).read_text(encoding="utf-8"))
    for p in datos:
        for s in p.get("specs") or []:
            if isinstance(s, str) and s.strip():
                yield p.get("nombre", p.get("id")), s


class TestSpecsEmoji(unittest.TestCase):
    def setUp(self):
        self.claves = _claves_iconos()

    def test_el_mapa_de_iconos_se_lee(self):
        # Si el formato del módulo cambia y la extracción devuelve poco, los dos
        # tests de abajo pasarían a fallar por el motivo equivocado.
        self.assertGreater(len(self.claves), 250)
        for e in ("⚡", "🔋", "🔌", "📶", "📡"):
            self.assertIn(e, self.claves)

    def test_todo_spec_empieza_por_emoji(self):
        faltan = [(f, n, s) for f in CATALOGOS for n, s in _specs(f)
                  if not _partir_emoji(s)]
        self.assertEqual(faltan, [], "specs sin emoji al frente: %r" % (faltan[:10],))

    def test_ningun_spec_cae_en_el_icono_generico(self):
        malos = [(f, n, s) for f in CATALOGOS for n, s in _specs(f)
                 if not _tiene_icono(_partir_emoji(s), self.claves)]
        self.assertEqual(
            malos, [],
            "estos specs saldrían con la bolsa de la compra genérica: %r" % (malos[:10],))

    def test_lite_y_completo_dicen_lo_mismo(self):
        full = {p["id"]: p.get("specs") for p in
                json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))}
        lite = {p["id"]: p.get("specs") for p in
                json.loads((RAIZ / "productos-lite.json").read_text(encoding="utf-8"))}
        desiguales = [i for i in full if i in lite and full[i] != lite[i]]
        self.assertEqual(desiguales, [],
                         "productos-lite.json quedó con specs viejos: %r" % (desiguales[:10],))


if __name__ == "__main__":
    unittest.main()
