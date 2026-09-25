"""Publicar el mismo producto en varios grupos de Facebook y en Revólico sin
que parezca el mismo anuncio (js/revolico_integration.js).

Lo que se ve en el navegador —versiones distintas, la cola con su pausa y su
tope, lo apartado y por qué, Revólico— lo comprueba tests/grupos_check.mjs,
que se corre desde aquí. Lo de este fichero son los contratos que se leen en
el código y se rompen sin que nada falle:

  · La marca del grupo (?g=) se filtra en TRES sitios: el panel que la escribe,
    la ficha /p/ que la cuenta y la regla de Firebase que la deja escribir. Si
    uno acepta algo que otro no, o la visita se pierde en silencio o un enlace
    inventado crea nodos en la base.
  · revolico_config.json está en un repositorio público: el usuario y la
    contraseña de Revólico no pueden acabar ahí nunca.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "grupos_check.mjs"
MODULO = ROOT / "js" / "revolico_integration.js"


class GruposEnNavegadorTest(unittest.TestCase):
    def test_textos_cola_marca_y_revolico(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class MarcaDeGrupoTest(unittest.TestCase):
    """El mismo filtro de 4–8 minúsculas o cifras en los tres sitios."""

    @classmethod
    def setUpClass(cls):
        cls.src = MODULO.read_text(encoding="utf-8")
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        import regenerate_artifacts  # noqa: E402
        cls.medir = regenerate_artifacts.MEDIR_JS
        reglas = json.loads((ROOT / "firebase-rules.json").read_text(encoding="utf-8"))
        cls.grupos = reglas["rules"]["analytics"].get("grupos")

    def test_el_panel_filtra_con_el_mismo_patron(self):
        self.assertIn("const _GRUPO_COD_RE = /^[a-z0-9]{4,8}$/;", self.src)

    def test_la_ficha_filtra_con_el_mismo_patron_y_exige_canal(self):
        # En la plantilla de Python las llaves van dobladas.
        self.assertIn("/^[a-z0-9]{{4,8}}$/.test(G)", self.medir)
        self.assertRegex(self.medir, r"if\(!c\|\|!/\^\[a-z0-9\]",
                         "sin un canal válido la marca de grupo no puede contar: "
                         "un ?g= suelto no sale de nada que se publique.")

    def test_la_regla_de_firebase_filtra_igual(self):
        self.assertIsNotNone(self.grupos, "falta la regla de /analytics/grupos")
        nodo = self.grupos["$grupo"]
        hojas = [nodo["visitas"]["count"], nodo["whatsapp"]["count"], nodo["horas"]["$hora"]["count"]]
        for h in hojas:
            w = h[".write"]
            self.assertIn("$grupo.length >= 4 && $grupo.length <= 8", w)
            self.assertIn("$grupo.matches(/^[a-z0-9]+$/)", w)
            self.assertIn("newData.val() == data.val() + 1", w,
                          "es un contador: solo puede subir de uno en uno")
        self.assertEqual({"visitas", "whatsapp", "horas"}, set(nodo),
                         "bajo cada grupo solo hay tres contadores; cualquier "
                         "otro hijo sería una ruta abierta a escribir")
        hora = nodo["horas"]["$hora"]["count"][".write"]
        self.assertIn("$hora.length == 2 && $hora.matches(/^[0-2][0-9]$/)", hora,
                      "la hora es una ruta: sin filtro, cualquier texto crea un nodo")

    def test_la_ficha_solo_escribe_rutas_que_la_regla_conoce(self):
        rutas = set(re.findall(r"'/analytics/grupos/'\+G\+'/(\w+)/", self.medir))
        self.assertEqual({"visitas", "whatsapp", "horas"}, rutas)
        self.assertIn("('0'+new Date().getHours()).slice(-2)", self.medir,
                      "la hora tiene que ir en dos cifras, que es lo único que acepta la regla")


class ColaSinTodoALaVezTest(unittest.TestCase):
    def test_no_vuelve_el_abrir_en_todos_los_grupos(self):
        src = MODULO.read_text(encoding="utf-8")
        self.assertNotIn("btnFbAllGroups", src,
                         "abrir todos los grupos a la vez con el mismo texto es "
                         "justo lo que Facebook marca como spam.")


class CredencialesRevolicoTest(unittest.TestCase):
    def test_revolico_config_no_lleva_usuario_ni_contrasena(self):
        cfg = json.loads((ROOT / "revolico_config.json").read_text(encoding="utf-8"))
        self.assertEqual("", cfg.get("username", ""),
                         "revolico_config.json está en un repositorio público")
        self.assertEqual("", cfg.get("password", ""),
                         "revolico_config.json está en un repositorio público")


if __name__ == "__main__":
    unittest.main()
