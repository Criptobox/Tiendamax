"""
Tests para scripts/build_og_images.py — las tarjetas Open Graph de 1200x630.

Lo que de verdad se está protegiendo aquí es que las medidas DECLARADAS en las
etiquetas og:image:width/height coincidan con el fichero real. Cuando no
coinciden, WhatsApp y Telegram maquetan la vista previa con lo declarado y la
imagen sale recortada o con franjas — que es como estaba antes: 118 productos
anunciando 1200x630 con fotos de 480x480.

Corre sin red: dibuja sobre ficheros temporales, nunca sobre og/ real.
"""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

try:
    from PIL import Image
    import build_og_images as og
except ImportError as e:  # pragma: no cover
    Image = None
    _err = e


@unittest.skipIf(Image is None, "Pillow no está instalado en este entorno")
class DibujoTest(unittest.TestCase):
    def _producto(self, **extra):
        base = {
            "id": "123", "nombre": "Producto de prueba", "categoria": "WIFI",
            "precioActual": 80, "precioOriginal": 0, "stock": 5,
        }
        base.update(extra)
        return base

    def test_la_tarjeta_mide_exactamente_lo_que_declaran_las_etiquetas(self):
        im = og.dibujar_tarjeta(self._producto(), None)
        self.assertEqual((1200, 630), im.size)

    def test_dibuja_sin_foto(self):
        # Un producto puede no tener foto o tenerla rota; la tarjeta debe salir
        # igual, no reventar la build de todas las demás.
        im = og.dibujar_tarjeta(self._producto(imagen=None), None)
        self.assertEqual((1200, 630), im.size)

    def test_dibuja_con_descuento_y_sin_el(self):
        for orig in (0, 120):
            with self.subTest(precioOriginal=orig):
                im = og.dibujar_tarjeta(self._producto(precioOriginal=orig), None)
                self.assertEqual((1200, 630), im.size)

    def test_dibuja_agotado(self):
        im = og.dibujar_tarjeta(self._producto(stock=0), None)
        self.assertEqual((1200, 630), im.size)

    def test_nombre_larguisimo_no_desborda(self):
        im = og.dibujar_tarjeta(self._producto(nombre="Palabra " * 60), None)
        self.assertEqual((1200, 630), im.size)

    def test_precio_no_numerico_no_revienta(self):
        im = og.dibujar_tarjeta(self._producto(precioActual="", precioOriginal=None), None)
        self.assertEqual((1200, 630), im.size)


@unittest.skipIf(Image is None, "Pillow no está instalado en este entorno")
class LimpiarNombreTest(unittest.TestCase):
    def test_quita_emoji(self):
        # Ninguna fuente del runner tiene emoji: quedarían como cuadraditos.
        self.assertEqual("Router Wi-fi AC1200", og.limpiar_nombre("🛜 Router Wi-fi AC1200"))
        self.assertEqual("Batería LiFePO4", og.limpiar_nombre("⚡ Batería LiFePO4 🔋"))

    def test_conserva_los_acentos(self):
        self.assertEqual("Batería 100Ah", og.limpiar_nombre("Batería 100Ah"))

    def test_colapsa_espacios(self):
        self.assertEqual("a b", og.limpiar_nombre("  a   b  "))


@unittest.skipIf(Image is None, "Pillow no está instalado en este entorno")
class HuellaTest(unittest.TestCase):
    def test_misma_entrada_misma_huella(self):
        p = {"id": "1", "nombre": "X", "precioActual": 10}
        self.assertEqual(og.huella(p, None), og.huella(dict(p), None))

    def test_cambiar_el_precio_cambia_la_huella(self):
        # Si no, subir un precio dejaría la tarjeta vieja publicada.
        a = og.huella({"id": "1", "nombre": "X", "precioActual": 10}, None)
        b = og.huella({"id": "1", "nombre": "X", "precioActual": 11}, None)
        self.assertNotEqual(a, b)

    def test_cambiar_el_stock_cambia_la_huella(self):
        a = og.huella({"id": "1", "nombre": "X", "stock": 0}, None)
        b = og.huella({"id": "1", "nombre": "X", "stock": 3}, None)
        self.assertNotEqual(a, b)

    def test_cambiar_la_foto_cambia_la_huella(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "a.webp"
            Image.new("RGB", (10, 10), (0, 0, 0)).save(f)
            a = og.huella({"id": "1"}, f)
            Image.new("RGB", (10, 10), (255, 0, 0)).save(f)
            b = og.huella({"id": "1"}, f)
        self.assertNotEqual(a, b, "la tarjeta no se rehace al cambiar la foto")


class EstadoDelRepoTest(unittest.TestCase):
    """Estas no necesitan Pillow: solo leen lo que hay publicado."""

    def test_cada_pagina_de_producto_declara_medidas_reales(self):
        malas = []
        for pagina in (ROOT / "p").glob("producto-*.html"):
            html = pagina.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r'property="og:image" content="([^"]+)"', html)
            if not m:
                continue
            url = m.group(1)
            anchura = re.search(r'property="og:image:width" content="(\d+)"', html)
            altura = re.search(r'property="og:image:height" content="(\d+)"', html)
            if not (anchura and altura):
                continue
            decl = (int(anchura.group(1)), int(altura.group(1)))
            # Solo se puede comprobar lo que vive en el repo.
            rel = url.replace("https://tiendamax.org/", "")
            fichero = ROOT / rel
            if not fichero.exists():
                continue
            if Image is None:
                self.skipTest("Pillow no está instalado en este entorno")
            with Image.open(fichero) as im:
                real = im.size
            if real != decl:
                malas.append(f"{pagina.name}: declara {decl} pero {rel} es {real}")
        self.assertEqual(
            [], malas[:10],
            "hay páginas declarando un tamaño de og:image que no es el real "
            "(WhatsApp/Telegram maquetan con lo declarado y la imagen sale mal)",
        )

    def test_hay_una_tarjeta_por_producto_activo(self):
        d = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
        productos = d if isinstance(d, list) else (d.get("productos") or [])
        faltan = [str(p["id"]) for p in productos
                  if p.get("id") and not (ROOT / "og" / f"producto-{p['id']}.jpg").exists()]
        self.assertEqual([], faltan[:10],
                         "faltan tarjetas OG; ejecuta python3 scripts/build_og_images.py")


if __name__ == "__main__":
    unittest.main()
