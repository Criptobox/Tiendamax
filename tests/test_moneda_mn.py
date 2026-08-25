"""
Productos con precio fijo en moneda nacional.

El sitio nació asumiendo que TODO precio es USD y que MN es una conversión con
la tasa de elTOQUE. Hay productos que se venden solo en MN a precio fijo:
convertirlos haría que su precio cambiara solo cada vez que se mueve la tasa,
que es lo contrario de lo que quiere el vendedor.

Un producto marcado `moneda:"MN"` lleva su precio tal cual. Lo que esta prueba
vigila es lo que falla en silencio:

  · El conmutador USD/MN de la tienda reescribe los precios recorriendo
    `.precio-actual`. Hay TRES capas que lo hacen —tm-patches, y dos
    post-procesadores más en tm-iife, que además SUSTITUYE
    actualizarPreciosMostrados entera—. Si a una se le olvida el
    `:not([data-mn])`, un precio de 5.000 pesos se muestra como 5.000 dólares
    y nadie se entera hasta que un cliente pregunte.

  · El carrito sumaba todo en un único total. Mezclar un producto en USD con
    uno en MN daba un número que no es plata de ninguna de las dos.
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "js" / "src"
ADMIN = RAIZ / "admin.html"


class MonedaMNTest(unittest.TestCase):
    def test_toda_capa_que_reescribe_precios_respeta_los_de_mn(self):
        # Se buscan los selectores que recorren .precio-actual para reescribirlo.
        # Cualquiera sin el :not([data-mn]) convierte un precio fijo en pesos.
        malos = []
        for f in sorted(SRC.glob("*.src.js")):
            texto = f.read_text(encoding="utf-8")
            for m in re.finditer(r"querySelectorAll\(\s*'([^']*\.precio-actual[^']*)'", texto):
                sel = m.group(1)
                if "data-mn" not in sel:
                    linea = texto[: m.start()].count("\n") + 1
                    malos.append(f"{f.name}:{linea}  {sel}")
        self.assertEqual(
            [], malos,
            "estos selectores reescriben precios sin excluir los que ya están en "
            "MN; el conmutador USD/MN los mostraría como dólares:\n  "
            + "\n  ".join(malos),
        )

    def test_el_carrito_separa_los_totales_por_moneda(self):
        src = (SRC / "tm-config.src.js").read_text(encoding="utf-8")
        self.assertIn("moneda:   (typeof tmMoneda", src,
                      "el item del carrito tiene que guardar su moneda; sin eso "
                      "no hay forma de sumar cada una por su lado")
        self.assertRegex(src, r"\{\s*USD:\s*0,\s*MN:\s*0\s*\}",
                         "el carrito debe acumular un total por moneda")

    def test_el_mensaje_de_whatsapp_no_suma_monedas_distintas(self):
        src = (SRC / "tm-config.src.js").read_text(encoding="utf-8")
        # El subtotal en USD tiene que EXCLUIR las líneas en MN.
        self.assertIn("i.moneda === 'MN' ? 0 :", src,
                      "el subtotal en USD del mensaje está sumando también los "
                      "productos con precio en MN")

    def test_el_panel_deja_elegir_la_moneda_en_los_dos_formularios(self):
        html = ADMIN.read_text(encoding="utf-8")
        for campo in ("productMoneda", "pedit-moneda"):
            self.assertIn(f'id="{campo}"', html,
                          f"falta el selector de moneda ({campo}): sin él no se "
                          f"puede cargar un producto que se vende en MN")
        self.assertIn("producto.moneda = 'MN'",
                      (SRC / "tm-admin.src.js").read_text(encoding="utf-8"),
                      "el alta no guarda la moneda elegida")

    def test_solo_se_guarda_la_moneda_cuando_es_mn(self):
        # En USD el campo no existe: así están los productos de siempre y no
        # hace falta migrar nada. Si se empezara a escribir "USD" en todos,
        # productos-lite.json engorda para todos los clientes sin ganar nada.
        import json
        for cat in ("productos.json", "productos-lite.json"):
            datos = json.loads((RAIZ / cat).read_text(encoding="utf-8"))
            usd = [p["nombre"] for p in datos if p.get("moneda") == "USD"]
            self.assertEqual([], usd,
                             f"{cat}: 'moneda' solo se guarda cuando es MN")
