"""Lo que cuesta pulsar «Actualizar tienda».

El dueño avisó de que tardaba muchísimo. Medido con 400 ms de latencia (un
móvil en Cuba), cambiar el precio de UN producto costaba **6 segundos, 14
idas y vueltas a GitHub y 1,5 MB de descarga**; con 800 ms, 11,5 segundos.

Nada de eso se ve leyendo el código: son cinco `await` seguidos que por
separado parecen razonables, y un GET del sha antes de cada PUT que parece
obligatorio. Lo que había:

  · **productos.json se descargaba dos veces seguidas** (425 KB cada una),
    una en `_tmPreservarDescripciones` y otra en `_tmMergeProductosConRepo`,
    con medio segundo de diferencia.
  · **Las cuatro lecturas del repo iban en fila** aunque son ficheros
    distintos y ninguna depende de otra.
  · **Cada subida pedía antes el sha de su fichero**, uno por uno, cuando el
    listado de la raíz los trae todos de una vez.
  · **Se subían ficheros idénticos a los del repo** (categorias.json,
    config.json…): idas y vueltas, commits y despliegues de Pages que se
    cancelan entre sí, para no cambiar nada.

`tests/publicar_rapido_check.mjs` lo mide en un navegador de verdad contra un
GitHub de mentira que devuelve shas de git REALES — con shas inventados no
coincide nunca nada y la poda parecería funcionar sin hacerlo.
"""

import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
CATALOGO = RAIZ / "js" / "src" / "tm-catalog.src.js"


class PublicarEnNavegadorTest(unittest.TestCase):
    def test_cuantas_peticiones_cuesta_publicar(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "publicar_rapido_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=300)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


class LasSubidasSiguenEnFilaTest(unittest.TestCase):
    """Las LECTURAS van en paralelo; las ESCRITURAS no pueden.

    Dos PUT a la vez sobre la misma rama chocan en el ref y GitHub devuelve un
    409 — por eso el bucle de subida dice «Subir secuencialmente». Al poner las
    lecturas en paralelo es fácil que alguien «termine el trabajo» y
    paralelice también las subidas, que es donde sí duele.
    """

    def test_el_bucle_de_subida_sigue_siendo_secuencial(self):
        src = CATALOGO.read_text(encoding="utf-8")
        i = src.index("async function sincronizarTodoConGitHub")
        cuerpo = src[i:src.index("\n}", i)]
        self.assertIn(
            "for (let i = 0; i < archivosFiltrados.length; i++)", cuerpo,
            "las subidas tienen que seguir en un bucle secuencial")
        self.assertNotRegex(
            cuerpo, r"Promise\.all\([^)]*subirArchivoAGitHub",
            "subir en paralelo hace chocar los commits sobre la misma rama (409)")


class NoRompeALosQueNoPasanNadaTest(unittest.TestCase):
    """Los parámetros nuevos son opcionales: el resto de llamadas no cambia.

    `sincronizarConGitHub` (el auto-sync silencioso tras ajustar stock) y el
    reintento llaman a estos mismos ayudantes sin pasar nada. Si el parámetro
    dejara de ser opcional, el auto-sync subiría un catálogo vacío y eso no da
    ningún error: publica.
    """

    def test_los_ayudantes_siguen_funcionando_sin_el_parametro(self):
        src = CATALOGO.read_text(encoding="utf-8")
        for fn in ("_tmMergeProductosConRepo", "_tmMergeCategoriasConRepo",
                   "_tmMergeSubcategoriasConRepo"):
            i = src.index("async function " + fn)
            cuerpo = src[i:i + 700]
            self.assertIn(
                "remotoYaLeido !== undefined", cuerpo,
                f"{fn} tiene que bajarse el fichero cuando no se lo pasan")
        i = src.index("async function _tmPreservarDescripciones")
        self.assertIn(
            "Array.isArray(remotoYaLeido) ? remotoYaLeido : null",
            src[i:i + 700],
            "_tmPreservarDescripciones tiene que seguir bajándose el catálogo "
            "cuando la llaman sin él")


class ElLiteLoDerivaCITest(unittest.TestCase):
    """El panel dejó de subir productos-lite.json; CI tiene que generarlo.

    El lite le ahorra al cliente 9 KB comprimidos y le costaba al gestor 475 KB
    de subida en CADA publicación — a 300 kbps, la mitad de los 26 segundos que
    tardaba el botón. Y era trabajo repetido: regenerate-artifacts.yml ya lo
    regeneraba del mismo push.

    Si ese paso desaparece del workflow, nada falla: el lite se queda como
    estaba y la tienda muestra el catálogo viejo indefinidamente, que es
    justo lo que no se ve. Además, subirlo desde el panel era lo que permitía
    que los dos catálogos quedaran descompasados — y había pasado: el lite del
    repo tenía el stock viejo de dos productos y la tienda ofrecía un router
    agotado mientras escondía uno que sí había.
    """

    @classmethod
    def setUpClass(cls):
        cls.wf = (RAIZ / ".github" / "workflows" /
                  "regenerate-artifacts.yml").read_text(encoding="utf-8")

    def test_el_panel_ya_no_lo_sube(self):
        src = CATALOGO.read_text(encoding="utf-8")
        i = src.index("const archivos = [")
        self.assertNotIn(
            "productos-lite.json", src[i:src.index("];", i)],
            "el lite no va en la lista de ficheros que sube el panel")

    def test_el_workflow_lo_regenera(self):
        self.assertIn("scripts/build-productos-lite.py", self.wf,
                      "sin este paso la tienda se queda con el catálogo viejo")

    def test_lo_regenera_antes_de_lo_lento(self):
        """Antes de instalar Pillow y renderizar las tarjetas OG.

        Al final del job, la tienda pasa varios minutos sirviendo el catálogo
        anterior; al principio, segundos. El job termina en verde de las dos
        maneras.
        """
        # Desde `steps:`: los mismos scripts aparecen antes, en los `paths:`
        # que disparan el workflow, y buscar desde el principio compara con
        # esos y no con los pasos.
        pasos = self.wf[self.wf.index("\n    steps:"):]
        i_lite = pasos.index("scripts/build-productos-lite.py")
        for lento, que in (("pip install", "instalar Pillow"),
                           ("build_og_images.py", "renderizar las tarjetas OG"),
                           ("regenerate_artifacts.py", "regenerar las páginas")):
            self.assertLess(
                i_lite, pasos.index(lento),
                f"el lite tiene que regenerarse ANTES de {que}")

    def test_dispara_pages_tras_publicarlo(self):
        """Un commit del bot no despliega Pages por sí solo.

        Sin la llamada explícita, el lite llega a main pero la tienda sigue
        sirviendo el viejo — o sea, el paso entero no habría servido de nada, y
        en verde.
        """
        pasos = self.wf[self.wf.index("\n    steps:"):]
        paso = pasos[pasos.index("scripts/build-productos-lite.py"):pasos.index("fill_seo.py")]
        self.assertIn("pages.yml/dispatches", paso,
                      "hay que pedir el deploy de Pages en el mismo paso")


class ElShaDeGitTest(unittest.TestCase):
    """La poda compara shas de git, y el formato del sha no se puede inventar.

    Es sha1("blob <bytes>\\0" + bytes). Con la cabecera mal, ningún sha
    coincide nunca: no se rompe nada, simplemente no se poda y la lentitud
    vuelve sin que nadie lo note.
    """

    def test_calcula_el_sha_como_git(self):
        src = CATALOGO.read_text(encoding="utf-8")
        i = src.index("async function _tmShaDeGit")
        cuerpo = src[i:src.index("\n}", i)]
        self.assertIn("'blob '", cuerpo)
        self.assertIn("SHA-1", cuerpo)
        self.assertIn("cuerpo.length", cuerpo,
                      "la cabecera lleva el tamaño en bytes, no en caracteres")
        self.assertIn("return null", cuerpo,
                      "sin crypto.subtle (contexto no seguro) hay que devolver "
                      "null y subirlo todo, no romper la publicación")
