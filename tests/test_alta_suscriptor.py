"""El alta de un suscriptor en /tokens, y sus dos formas de fallar en silencio.

1. La regla de /tokens exige que `timestamp` caiga a ±15 minutos de `now`, y
   `now` es la hora de Firebase. Mandando `Date.now()` —la hora del teléfono—
   un móvil con el reloj desajustado se llevaba un 401 y se quedaba sin
   registrar para siempre. Se manda {".sv":"timestamp"}: lo pone el servidor
   al escribir y nunca puede quedar fuera de la ventana.

2. Tener el token de FCM no es estar suscrito. Si el PUT no entra, el teléfono
   no está en la lista y no le llega nada — pero la tienda decía "🔔
   ¡Notificaciones activadas!" igualmente, porque solo miraba si había token en
   localStorage. El cliente se iba convencido de que estaba dado de alta.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
REGLAS = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]

FUENTES_QUE_ESCRIBEN = ["js/push-fix.js", "js/src/tm-patches.src.js"]


class SelloDeTiempoDelServidorTest(unittest.TestCase):

    def test_la_regla_sigue_exigiendo_una_marca_reciente(self):
        # Si esto cambia, el test de abajo deja de defender nada.
        self.assertIn("now - 900000", REGLAS["tokens"]["$tokenId"][".validate"])

    def test_nadie_manda_la_hora_del_telefono_al_dar_de_alta(self):
        fallos = []
        for nombre in FUENTES_QUE_ESCRIBEN:
            texto = (RAIZ / nombre).read_text(encoding="utf-8")
            for m in re.finditer(r"/tokens/[^\n]*?\n(?:[^\n]*\n){0,20}?[^\n]*?"
                                 r"timestamp:\s*([^,\n]+)", texto):
                valor = m.group(1).strip()
                if "sv" not in valor:
                    fallos.append(f"{nombre}: timestamp: {valor}")
        self.assertEqual([], fallos,
                         "la hora del teléfono la rechaza la regla si el reloj "
                         "va desajustado:\n" + "\n".join(fallos))


class ElAltaFallidaSeNotaTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.push_fix = (RAIZ / "js" / "push-fix.js").read_text(encoding="utf-8")

    def test_registrar_devuelve_false_si_la_escritura_no_entra(self):
        # Antes se anotaba en la consola y se devolvía true igual.
        i = self.push_fix.index("await escribirTokenRTDB(cfg, token)")
        bloque = self.push_fix[i:i + 700]
        self.assertIn("return false", bloque,
                      "sin token escrito en /tokens no hay suscripción que anunciar")

    def test_hay_forma_de_preguntar_si_el_alta_esta_confirmada(self):
        self.assertIn("window.tmPushRegistrado", self.push_fix)

    def test_la_tienda_no_canta_exito_solo_por_tener_token(self):
        for nombre in ("js/src/tm-iife.src.js", "js/src/tm-patches.src.js"):
            with self.subTest(fichero=nombre):
                self.assertIn("tmPushRegistrado",
                              (RAIZ / nombre).read_text(encoding="utf-8"),
                              "mira solo localStorage.fcmToken: dice 'activadas' "
                              "aunque el alta no haya llegado a la base")


if __name__ == "__main__":
    unittest.main()
