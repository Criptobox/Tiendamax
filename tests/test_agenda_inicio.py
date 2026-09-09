"""
La agenda de Inicio y el camino a los modelos de IA.

Tres fallos que estaban en producción y ninguno daba error:

 · `tmAIChat` no la definía nadie. Las vistas previas de Facebook y de Revólico
   la llaman y comprueban `typeof tmAIChat !== 'function'` antes: el guard
   saltaba SIEMPRE, así que los dos botones "✨ Mejorar con IA" contestaban
   "Módulo IA no cargado" pasara lo que pasara, desde el día que se escribieron.

 · El ajuste se llama `anthropicApiKey` y el CSP ya permitía api.anthropic.com,
   pero `iaLlamarModelo` elegía proveedor por el prefijo de la clave y no había
   rama para `sk-ant-`: una clave de Claude caía en el `else` y se mandaba al
   endpoint de DeepSeek. Daba 401 y parecía una clave mala.

 · `_firma()` espera a `TMAuth.token()`, que a su vez espera a que baje el SDK
   de Firebase. Ese await está FUERA del AbortController de `getJson`, así que
   los 6 s de allí no lo cortan. Con la conexión caída, `buildTasks` no termina
   nunca, `state.loading` se queda en true y su propio guard bloquea todos los
   refrescos siguientes: el copiloto deja de dar tareas para siempre, en
   silencio, y la agenda de Inicio se queda diciendo que no hay nada urgente.

El resto de la agenda (los tres estados, el escapado y los onclick) se prueba
en el navegador — tests/agenda_check.mjs.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
COPILOTO = (RAIZ / "js" / "admin-copilot.js").read_text(encoding="utf-8")
REVOLICO = (RAIZ / "js" / "revolico_integration.js").read_text(encoding="utf-8")
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")
CHECK = RAIZ / "tests" / "agenda_check.mjs"


class AgendaNavegadorTest(unittest.TestCase):
    def test_regresion_en_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(RAIZ),
                           capture_output=True, text=True, timeout=180)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class CaminoIATest(unittest.TestCase):
    def test_tmaichat_existe_donde_se_llama(self):
        self.assertIn("tmAIChat(", REVOLICO,
                      "si ya nadie la llama, este test sobra")
        self.assertRegex(
            COPILOTO, r"window\.tmAIChat\s*=",
            "los botones «✨ Mejorar con IA» llaman a tmAIChat y no la define "
            "nadie: su propio guard los deja mudos para siempre.",
        )

    def test_una_clave_de_claude_va_a_anthropic(self):
        # Sin comentarios y sin cortar por la primera llave: la función tiene
        # llaves anidadas, y los comentarios de aquí nombran "sk-ant-" al
        # contar el fallo — buscarlo con ellos dentro da por bueno un código
        # que ya no lo mira.
        ini = COPILOTO.find("async function iaLlamarModelo(")
        fin = COPILOTO.find("window.iaLlamarModelo =", ini)
        self.assertTrue(0 < ini < fin, "se perdió iaLlamarModelo")
        cuerpo = re.sub(r"^\s*//.*$", "", COPILOTO[ini:fin], flags=re.M)
        i_ant = cuerpo.find("sk-ant-")
        self.assertNotEqual(i_ant, -1,
                            "sin rama para sk-ant-, una clave de Claude acaba "
                            "en el endpoint de otro proveedor y da 401.")
        self.assertIn("api.anthropic.com", cuerpo)
        # Y antes del `else` que manda todo lo demás a DeepSeek.
        i_else = cuerpo.find("api.deepseek.com")
        self.assertTrue(0 < i_ant < i_else,
                        "la rama de Claude tiene que decidirse ANTES del "
                        "respaldo que manda el resto a DeepSeek.")

    def test_la_llamada_desde_el_navegador_lleva_su_cabecera(self):
        """Sin ella el navegador corta la llamada por CORS y se ve igual que
        una clave mala: el panel llama a la API desde el móvil del dueño, no
        desde un servidor."""
        self.assertIn("anthropic-dangerous-direct-browser-access", COPILOTO)
        self.assertIn("https://api.anthropic.com", ADMIN,
                      "el CSP de admin.html tiene que permitir el dominio")

    def test_esperar_al_token_no_puede_colgar_el_motor(self):
        m = re.search(r"async function _firma\([\s\S]*?\n\}", COPILOTO)
        self.assertIsNotNone(m, "se perdió _firma")
        self.assertIn("Promise.race", m.group(0),
                      "TMAuth.token() se espera sin tope y está fuera del "
                      "AbortController de getJson: si no resuelve, buildTasks "
                      "no termina nunca y el copiloto se queda mudo.")


class AgendaSinMotorPropioTest(unittest.TestCase):
    """La agenda LEE las tareas del copiloto; no las vuelve a calcular.

    Dos motores analizando el mismo catálogo acaban diciendo cosas distintas —
    ya pasó con las tablas de siglas de nightly_agent.py y admin-copilot.js— y
    el que se equivoque será el que nadie mira.
    """

    def setUp(self):
        # De llave a llave no vale: la función tiene llaves anidadas y un
        # `[\s\S]*?\n\}` la corta por la primera, dejando fuera justo el
        # trozo que estos tests miran. Se recorta por la función siguiente.
        ini = ADMIN.find("function renderAgendaInicio(){")
        fin = ADMIN.find("function agendaAbrir(", ini)
        self.assertTrue(0 < ini < fin, "se perdió renderAgendaInicio")
        # Sin los comentarios: uno de ellos cuenta el fallo y menciona
        # "nada urgente" ANTES de que el código lo escriba, y el orden que
        # miran estos tests es el del código.
        self.agenda = re.sub(r"^\s*//.*$", "", ADMIN[ini:fin], flags=re.M)

    def test_lee_las_tareas_del_copiloto(self):
        self.assertIn("window.tmCopilotoTareas", self.agenda)

    def test_los_botones_ejecutan_por_el_camino_del_copiloto(self):
        self.assertIn("tmCopilotoAbrirTarea", ADMIN,
                      "abrir una tarea desde Inicio tiene que pasar por la "
                      "misma función que el botón de la burbuja, o arreglar "
                      "un caso en una deja la otra rota.")

    def test_no_puede_cantar_victoria_antes_de_calcular(self):
        i_listo = self.agenda.find("tmCopilotoListo")
        i_nada = self.agenda.lower().find("nada urgente")
        self.assertTrue(0 < i_listo < i_nada,
                        "«nada urgente» tiene que ir detrás de comprobar que "
                        "el motor ya terminó una pasada; si no, la pantalla "
                        "dice que todo va bien mientras aún está mirando.")


if __name__ == "__main__":
    unittest.main()
