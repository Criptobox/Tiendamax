"""
Dos productos distintos no pueden llamarse igual.

Pasó con las llantas: había dos "Juego de Llantas R14" al mismo precio y dos
"Juego de Llantas R15". Nada falla —son productos legítimos y distintos, con su
id, su stock y su ficha—, pero el cliente ve dos renglones idénticos y no sabe
cuál pedir:

    2. Juego de Llantas R14 — $550.00 · 20 en stock
    3. Juego de Llantas R14 — $550.00 · 24 en stock

Y Max tampoco puede distinguirlos: detectProductMentions resuelve por nombre,
así que "quiero el juego de llantas R14" es ambiguo para el bot igual que para
la persona. Lo que los diferencia (el acabado) estaba en la ficha de cada uno,
solo que no en el nombre.
"""
import json
import unittest
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def _catalogo(nombre):
    return json.loads((RAIZ / nombre).read_text(encoding="utf-8"))


class NombresUnicosTest(unittest.TestCase):
    def test_ningun_nombre_se_repite(self):
        prods = _catalogo("productos.json")
        veces = Counter(p["nombre"].strip() for p in prods if p.get("nombre"))
        repetidos = {n: v for n, v in veces.items() if v > 1}
        self.assertEqual(
            {}, repetidos,
            "hay productos distintos con el mismo nombre; en la tienda salen "
            "como renglones idénticos y el cliente no puede elegir. Lo que los "
            "diferencia suele estar ya en su ficha (acabado, medida, capacidad): "
            "ponlo en el nombre.",
        )

    def test_el_lite_dice_los_mismos_nombres_que_el_full(self):
        # productos-lite.json es lo que lee la tienda pública. Renombrar solo en
        # productos.json deja al cliente viendo el nombre viejo mientras el
        # panel muestra el nuevo, y nadie se entera.
        full = {p["id"]: p.get("nombre") for p in _catalogo("productos.json")}
        lite = {p["id"]: p.get("nombre") for p in _catalogo("productos-lite.json")}
        distintos = {i: (full[i], lite[i]) for i in full.keys() & lite.keys()
                     if full[i] != lite[i]}
        self.assertEqual(
            {}, distintos,
            "productos.json y productos-lite.json no dicen el mismo nombre: "
            "la tienda pública lee el lite",
        )
