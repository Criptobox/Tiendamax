"""La comparación con la tienda principal (scripts/comparar_principal.py).

Los productos de TiendaMax son de otra tienda. Esta comparación es la única
forma de enterarse de que la principal subió un precio, repuso algo o sacó un
producto nuevo — y por eso mismo sus fallos son todos del tipo caro: nada da
error, la pantalla se pinta perfecta, y lo que sale mal es el catálogo real.

Lo que se protege aquí:

  · **La moneda de la comisión.** Es lo más importante de todo el fichero.
    1500 MN y $1,80 son casi el mismo dinero (1500 ÷ 687 ≈ $2,18). Comparados
    como números sueltos dan 7 diferencias enormes donde solo hay 1, y cada
    una lleva un botón que cambia una comisión que estaba bien. Ya pasó una
    vez leyendo la comisión de la Linterna como $1500 en vez de 1500 MN.
  · **Que `gestores` y `vales` no salgan del fichero de la principal.** Su
    data.json trae las claves de los 50 gestores y el nombre, teléfono, carné
    y dirección de los clientes de 427 vales. Nada de eso tiene por qué
    acabar en este repositorio, que es público.
  · **Que la primera corrida no avise de 108 «reposiciones».** Un producto
    que aparece por primera vez con stock no es una reposición.
  · **Que un fallo de red no borre el catálogo.** Un fichero vacío deja la
    pantalla diciendo «no te falta nada», que es exactamente lo contrario de
    la verdad y no se distingue de estar al día.
"""

import importlib.util
import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

RAIZ = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "comparar_principal", RAIZ / "scripts" / "comparar_principal.py")
cp = importlib.util.module_from_spec(_spec)
sys.modules["comparar_principal"] = cp
_spec.loader.exec_module(cp)


class ComisionTest(unittest.TestCase):
    """La moneda decide si dos comisiones se pueden comparar siquiera."""

    def test_lee_la_moneda_del_texto(self):
        self.assertEqual(("USD", 10.0), self._vm({"comision": "$10 USD"}))
        self.assertEqual(("MN", 1500.0), self._vm({"comision": "1500 MN"}))

    def test_el_campo_manda_sobre_un_texto_sin_moneda(self):
        c = cp.comision_de({"comision": "1500", "comisionMoneda": "MN"})
        self.assertEqual(("MN", 1500.0, True), (c["moneda"], c["valor"], c["fiable"]))

    def test_sin_moneda_por_ningun_lado_se_deduce_por_tamaño(self):
        # Los dos catálogos separan sin ambigüedad: en USD nadie pasa de 35,
        # en MN nadie baja de 1000. 14 productos propios no declaran moneda.
        self.assertEqual("USD", cp.comision_de({"comision": 10})["moneda"])
        self.assertEqual("MN", cp.comision_de({"comision": 1500})["moneda"])

    def test_si_las_dos_fuentes_se_contradicen_NO_es_fiable(self):
        # Caso real: 3 productos con "$3 USD" y comisionMoneda "MN".
        c = cp.comision_de({"comision": "$3 USD", "comisionMoneda": "MN"})
        self.assertFalse(c["fiable"], "una comisión con dos monedas distintas no se puede comparar")
        self.assertIn("MN", c["porque"])

    def test_una_comision_imposible_NO_es_fiable(self):
        # Caso real: "$1000 USD" sobre un producto de $20.
        c = cp.comision_de({"comision": "$1000 USD", "comisionMoneda": "USD",
                            "precioActual": 20})
        self.assertFalse(c["fiable"])

    def test_una_comision_mayor_que_el_precio_NO_es_fiable(self):
        c = cp.comision_de({"comision": "$40 USD", "comisionMoneda": "USD",
                            "precioActual": 30})
        self.assertFalse(c["fiable"], "nadie paga de comisión más de lo que cobra")

    def test_una_comision_normal_si_es_fiable(self):
        for crudo, moneda, precio in (("$10 USD", "USD", 80), ("1500 MN", "MN", 25),
                                      ("$5 USD", "USD", 30)):
            c = cp.comision_de({"comision": crudo, "comisionMoneda": moneda,
                                "precioActual": precio})
            self.assertTrue(c["fiable"], f"{crudo} sobre ${precio} debería ser fiable")

    def test_sin_comision_no_inventa_una(self):
        c = cp.comision_de({"comision": ""})
        self.assertIsNone(c["valor"])
        self.assertTrue(c["fiable"], "no tener comisión no es un dato dudoso")

    def _vm(self, p):
        c = cp.comision_de(p)
        return (c["moneda"], c["valor"])


class NoSeLlevaNadaDeLosClientesTest(unittest.TestCase):
    """De data.json solo salen productos y categorías. Nada más."""

    PAYLOAD = {
        "productos": [{"id": 1, "nombre": "Router", "precioActual": 50, "stock": 2,
                       "catId": 10, "comision": "$5 USD", "comisionMoneda": "USD"}],
        "categorias": [{"id": 10, "name": "Wifi"}],
        "gestores": [{"id": 7, "name": "Alguien", "password": "loquesea"}],
        "vales": [{"id": 1, "cliente": "Una persona", "telefono": "5350000000",
                   "carnet": "00000000000", "direccion": "Una calle"}],
    }

    def _descargar(self):
        crudo = json.dumps(self.PAYLOAD).encode()

        class Resp:
            def read(self_inner):
                return crudo
            def __enter__(self_inner):
                return self_inner
            def __exit__(self_inner, *a):
                return False

        with mock.patch.object(cp.urllib.request, "urlopen", return_value=Resp()):
            return cp.descargar("https://ejemplo.invalid/data.json")

    def test_solo_devuelve_productos(self):
        filas = self._descargar()
        self.assertEqual(1, len(filas))
        texto = json.dumps(filas, ensure_ascii=False)
        for prohibido in ("password", "carnet", "direccion", "telefono",
                          "loquesea", "Una persona", "5350000000"):
            self.assertNotIn(prohibido, texto,
                             f"'{prohibido}' viene de gestores/vales y no puede salir de descargar()")

    def test_traduce_el_catId_a_nombre_de_categoria(self):
        # Sin esto la categoría llega vacía en los 108 productos y el botón
        # "Rellenar" deja el formulario sin un campo que es obligatorio.
        self.assertEqual("Wifi", self._descargar()[0]["categoria"])

    def test_el_script_no_nombra_gestores_ni_vales_para_nada(self):
        fuente = (RAIZ / "scripts" / "comparar_principal.py").read_text(encoding="utf-8")
        codigo = "\n".join(l for l in fuente.splitlines()
                           if not l.lstrip().startswith("#"))
        # Se mira el código, no los comentarios: la explicación de por qué no
        # se tocan tiene que poder escribirse.
        cuerpo = codigo.split('"""', 2)[-1]
        for clave in ('"gestores"', "'gestores'", '"vales"', "'vales'"):
            self.assertNotIn(clave, cuerpo,
                             f"el script no debe leer {clave} de data.json")


class ReposicionesTest(unittest.TestCase):
    def test_un_producto_nuevo_no_es_una_reposicion(self):
        # Si lo fuera, la primera corrida avisaría de 108 reposiciones y el
        # aviso quedaría desacreditado desde el primer día.
        ahora = [{"id": "1", "nombre": "Nuevo", "stock": 5}]
        self.assertEqual([], cp.reposiciones({}, ahora))

    def test_de_cero_a_con_stock_si_lo_es(self):
        antes = {"1": {"id": "1", "nombre": "X", "stock": 0}}
        ahora = [{"id": "1", "nombre": "X", "stock": 3}]
        self.assertEqual(["1"], [f["id"] for f in cp.reposiciones(antes, ahora)])

    def test_seguir_con_stock_no_es_una_reposicion(self):
        antes = {"1": {"id": "1", "stock": 3}}
        self.assertEqual([], cp.reposiciones(antes, [{"id": "1", "nombre": "X", "stock": 5}]))

    def test_agotarse_tampoco(self):
        antes = {"1": {"id": "1", "stock": 4}}
        self.assertEqual([], cp.reposiciones(antes, [{"id": "1", "nombre": "X", "stock": 0}]))


class SoloAvisaDeLoQueNoTengoTest(unittest.TestCase):
    """Que la principal reponga algo que yo ya vendo no es noticia."""

    VUELTOS = [{"id": "1", "nombre": "Router"}, {"id": "2", "nombre": "Batería"},
               {"id": "3", "nombre": "Cámara"}]

    def test_filtra_los_que_ya_tengo_con_stock(self):
        mio = [{"id": 1, "nombre": "Router", "stock": 7},
               {"id": 2, "nombre": "Batería", "stock": 0}]
        fuera = cp.mios_agotados(mio, self.VUELTOS)
        self.assertEqual(["2", "3"], sorted(f["id"] for f in fuera),
                         "solo interesan los que tengo agotados o no tengo")

    def test_empareja_por_nombre_cuando_el_id_no_coincide(self):
        # Un producto subido a mano coge un id nuevo; sin esto saldría como si
        # faltara y como si hiciera falta reponerlo.
        mio = [{"id": 999, "nombre": "  RÓUTER  ", "stock": 4}]
        fuera = cp.mios_agotados(mio, [{"id": "1", "nombre": "Router"}])
        self.assertEqual([], fuera, "el nombre normalizado debería haberlo emparejado")


class PartirElFicheroTest(unittest.TestCase):
    """Las descripciones van aparte porque el móvil está en Cuba."""

    PRODUCTOS = [
        {"id": "1", "nombre": "Tengo este", "descripcion": "x" * 900, "stock": 1},
        {"id": "2", "nombre": "Me falta este", "descripcion": "y" * 900, "stock": 1},
    ]

    def test_el_catalogo_ligero_no_lleva_descripciones(self):
        ligero, _ = cp.partir(self.PRODUCTOS, [{"id": "1", "nombre": "Tengo este"}])
        self.assertTrue(all("descripcion" not in p for p in ligero))
        self.assertEqual(2, len(ligero), "el catálogo ligero los lleva todos")

    def test_las_fichas_solo_de_los_que_me_faltan(self):
        _, fichas = cp.partir(self.PRODUCTOS, [{"id": "1", "nombre": "Tengo este"}])
        self.assertEqual(["2"], list(fichas),
                         "la descripción de un producto que ya tengo no la usa nadie")


class NoBorrarLoQueYaHayTest(unittest.TestCase):
    """Que la principal esté caída no puede dejar la pantalla en blanco."""

    def test_si_falla_la_descarga_el_fichero_se_queda_como_estaba(self):
        salida = RAIZ / "principal-catalogo.json"
        antes = salida.read_bytes() if salida.exists() else None
        with mock.patch.object(cp, "descargar", side_effect=OSError("sin red")):
            self.assertEqual(0, cp.main(), "un fallo de red no debe tumbar el cron")
        despues = salida.read_bytes() if salida.exists() else None
        self.assertEqual(antes, despues)

    def test_un_catalogo_vacio_tampoco_lo_pisa(self):
        salida = RAIZ / "principal-catalogo.json"
        antes = salida.read_bytes() if salida.exists() else None
        with mock.patch.object(cp, "descargar", return_value=[]):
            self.assertEqual(0, cp.main())
        despues = salida.read_bytes() if salida.exists() else None
        self.assertEqual(antes, despues,
                         "0 productos es un fallo de la principal, no un catálogo vacío")


class LaPantallaEnNavegadorTest(unittest.TestCase):
    """tests/comparar_check.mjs.

    El script solo baja el catálogo; quién sale en cada lista, con qué botón y
    con qué número lo decide el navegador cruzándolo con PRODUCTOS. La regla
    de la moneda vive ahí, y leyendo admin.html no se distingue de estar rota.
    """

    def test_la_pantalla_se_comporta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "comparar_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=300)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


class ElFicheroPublicadoTest(unittest.TestCase):
    """El catálogo que hay en el repo ahora mismo."""

    @classmethod
    def setUpClass(cls):
        p = RAIZ / "principal-catalogo.json"
        if not p.exists():
            raise unittest.SkipTest("todavía no se ha generado principal-catalogo.json")
        cls.datos = json.loads(p.read_text(encoding="utf-8"))

    def test_no_contiene_nada_de_los_clientes_de_la_principal(self):
        texto = json.dumps(self.datos, ensure_ascii=False).lower()
        for prohibido in ("carnet", "password", "direccion", "gestorid", "valenum"):
            self.assertNotIn(prohibido, texto)

    def test_cada_comision_declara_su_moneda(self):
        for p in self.datos["productos"]:
            if p.get("comision") is not None:
                self.assertIn(p.get("comisionMoneda"), ("USD", "MN"),
                              f"{p['nombre']}: una comisión sin moneda no se puede comparar")

    def test_pesa_poco_porque_lo_abre_un_movil_en_cuba(self):
        kb = (RAIZ / "principal-catalogo.json").stat().st_size / 1024
        self.assertLess(kb, 60, f"el catálogo ligero pesa {kb:.0f} KB; "
                                "las descripciones van en principal-fichas.json")


if __name__ == "__main__":
    unittest.main()
