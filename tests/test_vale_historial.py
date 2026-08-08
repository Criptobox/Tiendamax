"""
El historial de vales de vale.html.

Vive SOLO en el localStorage del navegador: no hay servidor donde guardarlo, y
subirlo a Firebase lo publicaría —/pedidos y /ventas son `.read: true`, y un
vale lleva nombre y teléfono del cliente. O sea que borrar los datos del
navegador se lo lleva entero, y eso ya pasó una vez.

Lo que se vigila aquí es lo que se pierde sin avisar:

  · Un vale que no se guarda porque el navegador está sin espacio. El toast de
    "copiado" ya salió, así que parece que todo fue bien y el pedido de un
    cliente real no queda en ningún sitio.
  · Un valesMax corrupto que revienta el JSON.parse y se lleva por delante
    todo el historial y el guardado del vale en curso.
  · Una restauración que REEMPLACE en vez de mezclar: cargar una copia vieja
    borraría los vales hechos después de bajarla.
  · Y que a nadie se le ocurra sincronizar esto con Firebase.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALE = (ROOT / "vale.html").read_text(encoding="utf-8")


def cuerpo(nombre):
    """El texto de una función de vale.html, de su firma a la llave de cierre
    en columna 0. Sirve porque el archivo indenta el cuerpo y cierra a cero."""
    m = re.search(r"^function " + nombre + r"\([^)]*\)\{$(.*?)^\}$",
                  VALE, re.S | re.M)
    if not m:
        raise AssertionError(f"no encuentro function {nombre}() en vale.html")
    return m.group(1)


class ValeHistorialTest(unittest.TestCase):
    def test_guardar_un_vale_no_puede_fallar_en_silencio(self):
        c = cuerpo("guardarHist")
        self.assertIn("try{", c, "el setItem debe ir en try: sin espacio, lanza")
        self.assertIn("catch", c)
        # Y el catch tiene que avisar, no tragarse el error.
        self.assertIn("toast(", c,
                      "si no se pudo guardar el vale hay que decirlo: es el pedido de un cliente real")

    def test_un_historial_corrupto_no_tumba_nada(self):
        c = cuerpo("leerHist")
        self.assertIn("catch", c, "JSON.parse de un valesMax corrupto lanza")
        self.assertIn("Array.isArray", c, "y un valor que no sea lista rompe igual más abajo")
        # Nadie puede saltarse el lector tolerante.
        directos = re.findall(r"JSON\.parse\(localStorage\.getItem\('valesMax'\)", VALE)
        self.assertEqual(
            len(directos), 1,
            "solo leerHist() puede leer valesMax directamente; el resto debe usarla",
        )

    def test_se_puede_bajar_y_restaurar(self):
        self.assertIn("function exportarHist()", VALE)
        self.assertIn("function importarHist(", VALE)
        self.assertIn('id="histImportFile"', VALE)
        self.assertRegex(VALE, r"a\.download\s*=", "la copia tiene que descargarse como archivo")

    def test_restaurar_mezcla_y_no_reemplaza(self):
        """Cargar una copia de la semana pasada no puede borrar los vales de
        esta semana."""
        c = cuerpo("importarHist")
        self.assertIn("leerHist()", c, "hay que partir de lo que ya hay, no de cero")
        self.assertRegex(c, r"hist\.push\(", "los vales de la copia se AÑADEN")
        self.assertNotRegex(
            c, r"setItem\('valesMax',\s*JSON\.stringify\(traidos",
            "eso reemplazaría el historial por la copia",
        )
        # Y restaurar dos veces no puede duplicar.
        self.assertIn("Set(", c, "hace falta deduplicar por alguna clave")
        self.assertRegex(c, r"vistos\.has\(", "los repetidos se saltan")

    def test_un_archivo_cualquiera_no_pasa(self):
        c = cuerpo("importarHist")
        self.assertIn("Array.isArray(d.vales)", c,
                      "hay que comprobar la forma antes de tocar el historial")

    def test_los_vales_nunca_van_a_firebase(self):
        """Llevan nombre y teléfono del cliente. En Firebase no hay ningún sitio
        privado: no existe Firebase Auth en este proyecto, así que toda regla
        que deje leer al admin deja leer a cualquiera."""
        for pista in ("firebaseio", "firebasedatabase", "valesMax.json"):
            self.assertNotIn(
                pista, VALE,
                f"vale.html no puede hablar con Firebase (encontrado: {pista}): "
                "publicaría nombres y teléfonos de clientes",
            )


if __name__ == "__main__":
    unittest.main()
