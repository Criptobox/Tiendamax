"""
Corre la regresión de caducidad de los push (tests/notificaciones_check.mjs)
dentro de unittest, y comprueba las costuras que ese motor no ve: que la página
avise al service worker cuando el cliente entra a la tienda, y que el aviso no
se muestre marcado como permanente.

Nada de esto lanza un error si se rompe. El síntoma es un aviso que se queda en
el teléfono del cliente durante horas repitiendo algo que ya no es cierto — que
es justo como se descubrió: "🏷️ 4 productos rebajados" seguía puesto por la
noche con uno de los cuatro agotado.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "notificaciones_check.mjs"
SW = ROOT / "firebase-messaging-sw.js"
PUSH_FIX = ROOT / "js" / "push-fix.js"


class CaducidadTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class LaPaginaAvisaAlWorkerTest(unittest.TestCase):
    """Los avisos los pinta firebase-messaging-sw.js, que vive en su propio
    ámbito (/firebase-cloud-messaging-push-scope). Desde la página no basta con
    navigator.serviceWorker.ready —ese es el sw.js de la raíz y no ve esas
    notificaciones—: hay que recorrer todos los registros."""

    @classmethod
    def setUpClass(cls):
        cls.push = PUSH_FIX.read_text(encoding="utf-8")
        cls.sw = SW.read_text(encoding="utf-8")

    def test_la_tienda_apaga_sus_avisos_al_abrirse(self):
        self.assertIn("getRegistrations()", self.push,
                      "con ready() solo se ve el sw.js de la raíz, que no pintó "
                      "esas notificaciones")
        self.assertIn("getNotifications()", self.push)
        self.assertIn("visibilitychange", self.push,
                      "también al volver a la tienda desde otra app: si el push "
                      "llegó con la pestaña detrás, sigue en la bandeja")

    def test_los_avisos_del_dueno_no_se_apagan_con_la_tienda(self):
        """Los recordatorios de trabajo llegan al teléfono del dueño con tag
        admin-*. Que abra su propia tienda no puede borrárselos."""
        for nombre, src in (("js/push-fix.js", self.push),
                            ("firebase-messaging-sw.js", self.sw)):
            with self.subTest(archivo=nombre):
                self.assertIn('"admin"', src.replace("'", '"'),
                              f"{nombre}: falta excluir los avisos del dueño")

    def test_el_aviso_no_se_marca_como_permanente(self):
        """requireInteraction lo deja fijo hasta que se toca. Con el texto
        congelado que llevan, eso es justo lo que no queremos."""
        self.assertIn("requireInteraction: false", self.sw)


if __name__ == "__main__":
    unittest.main()
