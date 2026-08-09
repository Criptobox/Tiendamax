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
    m = re.search(r"^(?:async )?function " + nombre + r"\([^)]*\)\{$(.*?)^\}$",
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

    def test_el_historial_se_guarda_en_firebase(self):
        """Ya no hay copia manual que bajarse: se guarda solo.

        La copia en archivo existía porque el historial vivía únicamente en
        este navegador. Con la cuenta hay dónde guardarlo de verdad, así que
        pedirle al dueño que se acuerde de bajar un archivo para algo que ya
        está a salvo era trabajo inventado — y trabajo que, el día que se le
        olvida, no sirve de nada."""
        self.assertIn("function espejarHist()", VALE)
        self.assertIn("async function sincronizarHist()", VALE)
        for muerto in ("exportarHist", "importarHist", "histImportFile"):
            self.assertNotIn(muerto, VALE, f"{muerto} ya no hace falta")

    def test_cada_vale_va_en_su_propia_clave(self):
        """Con dos dispositivos, mandar la LISTA entera pierde vales.

        Si el móvil todavía no se ha sincronizado, su lista no incluye los
        vales hechos en la PC; subirla con PUT los machaca y no queda rastro.
        Una clave por vale hace imposible que dos dispositivos se pisen,
        aunque nunca se hablen entre ellos."""
        c = cuerpo("espejarHist")
        self.assertIn("PATCH", c, "PUT reemplaza el nodo entero")
        self.assertNotIn("method:'PUT'", c.replace(" ", ""))
        self.assertIn("claveVale(v)", c)

    def test_sincronizar_no_borra_lo_que_solo_esta_aqui(self):
        """Un vale hecho en este móvil y aún sin subir tiene que sobrevivir a
        traerse los de la nube."""
        c = cuerpo("sincronizarHist")
        self.assertIn("leerHist()", c, "hay que partir de lo local, no de cero")
        self.assertIn("hist.push(", c, "lo remoto se AÑADE")
        self.assertIn("vistos.has(", c, "y sin duplicar lo que ya está")


    def test_los_vales_solo_van_a_la_zona_privada(self):
        """Llevan nombre y teléfono del cliente. Antes no salían de este
        navegador porque no había dónde ponerlos a salvo: sin Firebase Auth,
        toda regla que dejara leer al admin dejaba leer a cualquiera. Con
        cuenta existe /privado, que pide `auth != null`. Lo que no puede pasar
        nunca es que acaben en una ruta pública."""
        rutas = re.findall(r"fetchPrivado\('([^']+)'", VALE)
        self.assertTrue(rutas, "el historial debe guardarse también en Firebase")
        for r in rutas:
            self.assertTrue(
                r.startswith("/privado/"),
                f"'{r}' no está bajo /privado: publicaría nombres y teléfonos",
            )
        # Nada de fetch a pelo a la base de datos: ese no lleva el token.
        for pista in ("firebaseio.com", "firebasedatabase.app"):
            self.assertNotIn(
                pista, VALE,
                f"vale.html no puede construir URLs de Firebase a mano ({pista}): "
                "tiene que ir por TMAuth.fetchPrivado, que firma con la cuenta",
            )

    def test_sin_cuenta_el_vale_sigue_funcionando(self):
        """Cuba, 3G y apagones: el vale no puede depender de que Firebase
        conteste ni de haber entrado con la cuenta."""
        self.assertIn("typeofTMAuth==='undefined'", VALE.replace(" ", ""),
                      "sin cuenta iniciada el historial debe seguir guardándose en local")


if __name__ == "__main__":
    unittest.main()
