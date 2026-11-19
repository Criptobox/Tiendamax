"""max-sinonimos.json: el vocabulario con que la gente llama a cada producto.

Un sinónimo equivocado lleva al cliente a comprar lo que no quería, y nada
falla: por eso se vigila la forma, el reparto y los modelos."""
import json
import re
import unittest
from collections import Counter, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SIN = json.loads((RAIZ / "max-sinonimos.json").read_text(encoding="utf-8"))
PRODS = json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))
POR_ID = {str(p["id"]): p for p in PRODS}
FRASE_RE = re.compile(r"^[a-záéíóúüñ0-9]+( [a-záéíóúüñ0-9]+)*$")
MODELO_RE = re.compile(r"^(?=.*[a-z])(?=.*\d)[a-z0-9]{2,6}$")


def _frases():
    for pid, lista in SIN["productos"].items():
        for f in lista:
            yield pid, f
    for cat, lista in SIN["categorias"].items():
        for f in lista:
            yield cat, f


class TestMaxSinonimos(unittest.TestCase):
    def test_forma(self):
        self.assertEqual(SIN["version"], 1)
        self.assertEqual(set(SIN), {"version", "productos", "categorias"})
        self.assertIsInstance(SIN["productos"], dict)
        self.assertIsInstance(SIN["categorias"], dict)
        for k, v in list(SIN["productos"].items()) + list(SIN["categorias"].items()):
            self.assertIsInstance(k, str)
            self.assertIsInstance(v, list, k)

    def test_frases_validas(self):
        for dueno, f in _frases():
            self.assertIsInstance(f, str, dueno)
            self.assertTrue(2 <= len(f) <= 40, (dueno, f))
            self.assertEqual(f, f.lower(), (dueno, f))
            self.assertTrue(FRASE_RE.match(f), (dueno, f))

    def test_sin_repetidas_dentro_del_producto(self):
        for pid, lista in SIN["productos"].items():
            self.assertEqual(len(lista), len(set(lista)), pid)

    def test_maximo_por_producto(self):
        for pid, lista in SIN["productos"].items():
            self.assertTrue(1 <= len(lista) <= 8, pid)

    def test_categorias(self):
        existentes = {p.get("categoria") for p in PRODS}
        for cat, lista in SIN["categorias"].items():
            self.assertIn(cat, existentes, cat)
            self.assertTrue(4 <= len(lista) <= 12, cat)

    def test_ninguna_frase_en_mas_de_tres_productos(self):
        c = Counter(f for lista in SIN["productos"].values() for f in set(lista))
        for f, n in c.items():
            self.assertLessEqual(n, 3, f)

    def test_ids_existentes(self):
        ids = list(SIN["productos"])
        ok = [i for i in ids if i in POR_ID]
        self.assertGreaterEqual(len(ok) / len(ids), 0.9)

    def test_sin_modelo_si_tiene_hermanos(self):
        grupos = defaultdict(list)
        for p in PRODS:
            if not p.get("digital"):
                grupos[(p.get("categoria"), p.get("subcategoria"))].append(str(p["id"]))
        for pid, lista in SIN["productos"].items():
            p = POR_ID.get(pid)
            if not p:
                continue
            hermanos = grupos[(p.get("categoria"), p.get("subcategoria"))]
            if len(hermanos) < 2:
                continue
            for f in lista:
                for w in f.split():
                    self.assertFalse(MODELO_RE.match(w), (pid, f, w))

    def test_estacion_de_carga_apunta_a_la_bluetti(self):
        bluetti = "1778104924836"
        if bluetti not in POR_ID:
            self.skipTest("la BLUETTI AC180 ya no está en el catálogo")
        for frase in ("estación de carga", "power station"):
            duenos = [i for i, l in SIN["productos"].items() if frase in l]
            self.assertIn(bluetti, duenos, frase)
            for i in duenos:
                self.assertIn("BLUETTI", POR_ID[i]["nombre"].upper(), (frase, i))


if __name__ == "__main__":
    unittest.main()
