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
