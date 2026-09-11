"""El registro de publicaciones y la cola de «Hoy toca publicar».

Corre `tests/publicar_check.mjs` dentro de unittest, que es lo que ejecuta CI,
y añade lo que sí se puede comprobar leyendo los ficheros.

Lo que se protege, y por qué ninguno de los dos da un error cuando se rompe:

  · **El registro tiene que salir de este navegador.** Vivía solo en
    localStorage: cambiar de teléfono dejaba los 132 productos en «nunca
    publicado» —badges en blanco, Historial vacío, la cola proponiendo al
    azar— y publicar desde el móvil hacía que la computadora propusiera lo
    mismo otra vez, con el resultado de publicar duplicado. El Copiloto lee
    ese mismo registro, así que heredaba el agujero.
  · **La cola no puede ordenar por unas visitas que no han llegado.** Un
    producto sin datos lee «0 visitas», que es justo lo más urgente de la
    lista; ordenando a ciegas, lo más urgente sería siempre lo que no cargó,
    y eso no se distingue de «nadie lo ha visto».
"""

import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PUBLICAR = RAIZ / "js" / "src" / "tm-publicar.src.js"
ADMIN = RAIZ / "admin.html"


class LaPantallaEnNavegadorTest(unittest.TestCase):
    def test_publicar_se_comporta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "publicar_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=300)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


class ElRegistroSalePorGitHubTest(unittest.TestCase):
    """Que se guarde fuera del teléfono, y por el camino que ya funciona."""

    @classmethod
    def setUpClass(cls):
        cls.src = PUBLICAR.read_text(encoding="utf-8")

    def test_usa_el_publicador_con_reintentos(self):
        # subirArchivoAGitHub relee el sha y reintenta ante un 409, que pasa
        # varias veces al día con los workflows commiteando a main. Un PUT a
        # mano se rinde a la primera y el trabajo se pierde.
        self.assertIn("subirArchivoAGitHub", self.src)
        self.assertNotIn("api.github.com", self.src,
                         "no montes un PUT propio: usa subirArchivoAGitHub")

    def test_guarda_en_local_antes_de_subir(self):
        # La subida espera 4 s. Si el guardado local no fuera inmediato,
        # cerrar la pestaña en ese hueco perdería la publicación.
        cuerpo = self.src[self.src.index("function tmRegistrarPublicacion"):]
        cuerpo = cuerpo[:cuerpo.index("\nfunction ")]
        i_local = cuerpo.index("localStorage.setItem")
        i_subir = cuerpo.index("tmPublogSubirLuego")
        self.assertLess(i_local, i_subir,
                        "primero se apunta aquí y después se programa la subida")

    def test_no_toca_el_DOM(self):
        # El bundle lo sirven también las páginas públicas. Avisa y que el
        # panel decida qué repintar.
        for prohibido in ("document.getElementById", "document.querySelector"):
            self.assertNotIn(prohibido, self.src,
                             f"tm-publicar.src.js no puede tocar el DOM ({prohibido})")
        self.assertIn("tmPublogAlCambiar", self.src,
                      "hace falta el aviso, o la línea de estado se queda mintiendo")
        self.assertIn("tmPublogAlCambiar", ADMIN.read_text(encoding="utf-8"),
                      "…y el panel tiene que suscribirse")

    def test_la_fusion_no_necesita_lapidas(self):
        # A diferencia de comparar-marcas.json, publicar solo AÑADE: no hay
        # nada que deshacer, así que unir y quitar repetidos basta. Si alguien
        # mete lápidas aquí, es que copió el patrón sin mirar.
        self.assertIn("function tmPublogFusionar", self.src)
        self.assertNotIn("borrado", self.src.split("function tmPublogFusionar")[1][:800])


class LaColaNoInventaDatosTest(unittest.TestCase):
    """Sin analytics, la cola vuelve a su orden de siempre."""

    @classmethod
    def setUpClass(cls):
        cls.admin = ADMIN.read_text(encoding="utf-8")
        # Se mira el código, no los comentarios: la explicación de por qué se
        # hace así tiene que poder escribirse sin que el test la confunda.
        cls.codigo = re.sub(r"^\s*//.*$", "", cls.admin, flags=re.M)

    def test_el_orden_por_visitas_esta_condicionado(self):
        self.assertRegex(self.codigo, r"PUB_STATS\.listo\s*\n?\s*\?",
                         "ordenar por visitas tiene que depender de que hayan llegado")

    def test_se_ve_y_nadie_lo_pide_exige_datos(self):
        cuerpo = self.codigo[self.codigo.index("function pubSeVePeroNadieLoPide"):]
        cuerpo = cuerpo[:cuerpo.index("\n}")]
        self.assertIn("PUB_STATS.listo", cuerpo,
                      "sin datos no se puede afirmar que nadie lo pide: sería inventarlo")

    def test_distingue_no_cargado_de_cero(self):
        # `listo` y `error` son cosas distintas: una dice «todavía no sé» y la
        # otra «no voy a saber». Con un solo booleano, la pantalla reintenta
        # en cada repintado o se queda esperando para siempre.
        self.assertRegex(self.codigo, r"PUB_STATS\s*=\s*\{\s*listo:\s*false,[\s\S]{0,80}error:\s*false")
        self.assertRegex(self.codigo, r"!PUB_STATS\.listo\s*&&\s*!PUB_STATS\.error")


if __name__ == "__main__":
    unittest.main()
