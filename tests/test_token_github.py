"""El aviso de que hay que cambiar el token de GitHub.

Cuando el PAT caduca, «Actualizar tienda» responde 401 y el panel lo enseña
como un fallo de red: se vuelve a tocar, y otra vez, y el catálogo se queda
sin publicar sin que nada explique por qué. La tarea del Copiloto solo sirve
si ese día se abre el panel, que es justo lo que no pasa cuando no hay nada
urgente — por eso también sale un push.

Lo que se protege aquí es la parte de Python; el cálculo y la pantalla los
comprueba tests/token_check.mjs en un navegador.
"""

import importlib.util
import shutil
import subprocess
import time
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SCRIPT = RAIZ / "scripts" / "send_notifications.py"

_spec = importlib.util.spec_from_file_location("send_notifications", SCRIPT)
SN = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(SN)

DIA_MS = 86400000


class _Ref:
    def __init__(self, valor): self.valor = valor
    def get(self): return self.valor


class _DB:
    def __init__(self, meta): self.meta = meta
    def reference(self, ruta):
        assert ruta == "privado/github_token", ruta
        return _Ref(self.meta)


class AvisoDelTokenTest(unittest.TestCase):
    """`avisar_token_github` decide; el envío se sustituye por un espía."""

    def setUp(self):
        self.enviados = []
        self._push = SN.enviar_push_admin
        self._dia = SN.es_hora_diurna
        SN.enviar_push_admin = lambda api, db, t, c, link=None, tag=None: (
            self.enviados.append((t, c, tag)) or True)
        SN.es_hora_diurna = lambda: True

    def tearDown(self):
        SN.enviar_push_admin = self._push
        SN.es_hora_diurna = self._dia

    def _correr(self, meta, ultimo=None):
        up = ultimo if ultimo is not None else {}
        SN.avisar_token_github(None, _DB(meta), up)
        return up

    def _creado_hace(self, dias):
        return time.time() * 1000 - dias * DIA_MS

    def test_sin_fecha_de_creacion_no_avisa(self):
        """Que falte `creado` no es que valga cero.

        Tratarlo como 0 —el epoch— hace que el token «venciera» en 1970 y
        manda un push de «venció hace 20 000 días» a un token recién puesto.
        Y suponer «lo creó hoy» es el otro lado del mismo invento: un «te
        quedan 90 días» sobre un token que lleva tres meses puesto es el
        dato falso exacto que se venía a dar. No se sabe: no se avisa.
        """
        self._correr({"dias": 90, "aviso": 5})
        self._correr({"creado": 0, "dias": 90, "aviso": 5})
        self.assertEqual(
            [], self.enviados,
            "sin fecha de creación el aviso es inventado, en la dirección que sea")

    def test_sin_nada_configurado_no_avisa(self):
        for meta in (None, {}, "texto", []):
            self._correr(meta)
        self.assertEqual([], self.enviados)

    def test_lejos_del_vencimiento_no_molesta(self):
        self._correr({"creado": self._creado_hace(10), "dias": 90, "aviso": 5})
        self.assertEqual([], self.enviados)

    def test_dentro_de_la_ventana_avisa(self):
        self._correr({"creado": self._creado_hace(86), "dias": 90, "aviso": 5})
        self.assertEqual(1, len(self.enviados))
        titulo, cuerpo, tag = self.enviados[0]
        self.assertIn("4 día", titulo)
        self.assertEqual("admin-token", tag)

    def test_vencido_lo_dice_y_explica_el_sintoma(self):
        # Sin esto se busca el fallo en el sitio equivocado: el 401 de GitHub
        # se ve en el panel como si no hubiera internet.
        self._correr({"creado": self._creado_hace(95), "dias": 90, "aviso": 5})
        titulo, cuerpo, _ = self.enviados[0]
        self.assertIn("venció", titulo.lower())
        self.assertIn("parece falta de internet", cuerpo)

    def test_la_duracion_es_la_que_puso_el_gestor(self):
        # 30 días con aviso a 3: a los 28 toca, con los 90 de por defecto no.
        self._correr({"creado": self._creado_hace(28), "dias": 30, "aviso": 3})
        self.assertEqual(1, len(self.enviados), "un token de 30 días vence a los 30, no a los 90")

    def test_no_repite_el_mismo_aviso_cada_media_hora(self):
        # El cron corre cada 30 min; sin freno, el aviso sería una alarma que
        # se aprende a ignorar, que es peor que no tenerla.
        up = self._correr({"creado": self._creado_hace(88), "dias": 90, "aviso": 5})
        self.assertEqual(1, len(self.enviados))
        self._correr({"creado": self._creado_hace(88), "dias": 90, "aviso": 5}, up)
        self.assertEqual(1, len(self.enviados), "dos pushes seguidos del mismo aviso")

    def test_de_noche_no_suena(self):
        SN.es_hora_diurna = lambda: False
        self._correr({"creado": self._creado_hace(88), "dias": 90, "aviso": 5})
        self.assertEqual([], self.enviados, "el móvil del dueño también duerme")

    def test_un_fallo_leyendo_no_tumba_el_cron(self):
        class Rota:
            def reference(self, ruta): raise RuntimeError("sin red")
        SN.avisar_token_github(None, Rota(), {})   # no debe propagar
        self.assertEqual([], self.enviados)


class ElTokenNoViajaTest(unittest.TestCase):
    def test_solo_suben_tres_cifras(self):
        # /privado lo lee solo la cuenta del dueño, pero el token no tiene
        # por qué estar ahí: con las fechas basta para contar.
        src = (RAIZ / "js" / "src" / "tm-ui.src.js").read_text(encoding="utf-8")
        cuerpo = src[src.index("function _tmTokenSubir"):]
        cuerpo = cuerpo[:cuerpo.index("\n}")]
        self.assertIn("creado", cuerpo)
        self.assertNotIn("githubToken", cuerpo,
                         "el token no sube: solo cuándo se creó, cuánto dura y la antelación")

    def test_el_panel_y_el_cron_leen_el_mismo_sitio(self):
        # Dos rutas distintas y el aviso del teléfono contaría otra cosa que
        # el de la pantalla, sin que nadie lo note.
        ui = (RAIZ / "js" / "src" / "tm-ui.src.js").read_text(encoding="utf-8")
        py = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("/privado/github_token.json", ui)
        self.assertIn('reference("privado/github_token")', py)


class EnNavegadorTest(unittest.TestCase):
    def test_la_pantalla_se_comporta(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(RAIZ / "tests" / "token_check.mjs")],
                           cwd=str(RAIZ), capture_output=True, text=True, timeout=600)
        self.assertEqual(0, r.returncode, "\n" + (r.stderr or r.stdout).strip())


if __name__ == "__main__":
    unittest.main()
