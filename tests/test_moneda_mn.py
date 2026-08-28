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

  · El panel dejaba marcar un producto como MN pero seguía pintándolo en USD:
    la tienda mostraba "$5.000 MN" y el admin, para el mismo producto,
    "$5000.00 USD". El precio salía de plantillas que escribían "USD" a mano o
    que llamaban a money(), que solo recibe un número y no puede saber de qué
    moneda es —la moneda vive en el producto—. Lo mismo llegaba al texto de
    WhatsApp y al de publicar en grupos, o sea al cliente.
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


    # ── El panel ────────────────────────────────────────────────────────
    def test_el_panel_no_pinta_ningun_precio_con_usd_a_mano(self):
        """Nada que muestre el precio DE UN PRODUCTO puede fijar la moneda.

        Un `$${...precioActual...} USD` en una plantilla se ve perfecto —hasta
        que el producto es de los de MN, y entonces afirma un precio en dólares
        que nadie puso. Estas plantillas alimentan la lista de productos, el
        modal de publicación, el texto de WhatsApp y el de los grupos: el error
        no se queda en el panel, sale hacia el cliente.
        """
        texto = ADMIN.read_text(encoding="utf-8")
        # Solo las dos formas en que "USD" acaba PINTÁNDOSE pegado al precio:
        #   `${…precioActual…} USD`   y   `'+…precioActual…+' USD'`
        # No vale con buscar "USD" suelto en la línea: 'USD' también aparece
        # como valor por defecto (comisionMoneda||'USD', moneda:…?'MN':'USD'),
        # que es correcto, y esas líneas son larguísimas.
        PINTA_USD = [
            re.compile(r"precioActual[^\n]{0,70}?\}\s*USD"),
            re.compile(r"precioActual[^\n]{0,70}?\+\s*'\s*USD"),
        ]
        malos = []
        for m in re.finditer(r"[^\n]*precioActual[^\n]*", texto):
            linea = m.group(0)
            # moneyP() ya decide la moneda mirando el producto.
            sin_helper = re.sub(r"moneyP\([^)]*\)", "", linea)
            if any(rx.search(sin_helper) for rx in PINTA_USD):
                malos.append(linea.strip()[:120])
        self.assertEqual(
            [], malos,
            "estas líneas de admin.html escriben 'USD' junto al precio de un "
            "producto en vez de pasar por moneyP():\n  " + "\n  ".join(malos)
            + "\n\nPara un producto con moneda:'MN' afirman una moneda falsa.",
        )

    def test_moneyP_existe_y_distingue_las_dos_monedas(self):
        texto = ADMIN.read_text(encoding="utf-8")
        self.assertIn("const moneyP", texto,
                      "admin.html perdió moneyP(), el helper que sabe de qué "
                      "moneda es el precio de un producto.")
        # Debe mirar el producto, no la cifra.
        self.assertRegex(
            texto, r"const esMN\s*=\s*p\s*=>",
            "moneyP() decide con esMN(p): sin eso vuelve a formatear a ciegas.",
        )
        self.assertIn("window.moneyP=moneyP", texto,
                      "moneyP tiene que salir a window: el <script> de "
                      "Herramientas es otro IIFE y también pinta precios.")

    def test_el_valor_de_inventario_no_suma_monedas_distintas(self):
        """Un producto de 5.000 MN sumado al total en USD lo infla en 5.000
        dólares que no existen, y el número sale mal sin que nada falle."""
        texto = ADMIN.read_text(encoding="utf-8")
        self.assertIn("valorInvPorMoneda", texto,
                      "el valor de inventario volvió a sumarse en un solo "
                      "número, mezclando USD con MN.")
        for m in re.finditer(r"[^\n]*precioActual[^\n]*stock[^\n]*", texto):
            linea = m.group(0)
            if "reduce(" in linea and "valorInvPorMoneda" not in linea:
                self.fail("suma de inventario sin separar por moneda:\n  "
                          + linea.strip()[:160])
