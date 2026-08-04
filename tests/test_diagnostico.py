"""
Corre la regresión del diagnóstico de averías (tests/diagnostico_check.mjs)
dentro de unittest, que es lo que ejecuta CI, y valida codigos-error.json.

Ese JSON lo va llenando el admin a mano, copiando manuales. Una entrada mal
formada no rompe nada visible: el bot simplemente no encuentra el código y
contesta que no lo tiene — exactamente igual que si no lo hubieras escrito.
Se descubriría cuando un cliente pregunte y la respuesta sea la de siempre.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "diagnostico_check.mjs"
CODIGOS = ROOT / "codigos-error.json"
CEREBRO = ROOT / "js" / "src" / "tm-bot-cerebro.src.js"

# Las mismas que el cerebro usa para clasificar el aparato.
FAMILIAS = {
    "INVERSORES", "CONTROLADORES SOLARES", "BATERÍAS", "ROUTERS",
    "CÁMARAS", "ALARMAS", "CERRADURAS",
}


class DiagnosticoTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class CodigosErrorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.datos = json.loads(CODIGOS.read_text(encoding="utf-8"))

    def test_tiene_la_forma_que_espera_el_bot(self):
        self.assertIn("marcas", self.datos, "el bot lee la clave 'marcas'")
        self.assertIsInstance(self.datos["marcas"], dict)

    def test_el_ejemplo_no_esta_dentro_de_marcas(self):
        # Si el formato de muestra viviera bajo 'marcas', el bot lo serviría
        # como si fuera un código real de una marca llamada "MarcaDeEjemplo".
        self.assertNotIn("MarcaDeEjemplo", self.datos["marcas"])

    def test_cada_codigo_esta_completo(self):
        for marca, tabla in self.datos["marcas"].items():
            self.assertIsInstance(tabla, dict, f"{marca} debería ser un objeto de códigos")
            for codigo, e in tabla.items():
                ctx = f"{marca} → {codigo}"
                self.assertRegex(
                    codigo, r"^[A-Z]?\d{1,3}[A-Z]?$",
                    f"{ctx}: el código debe ir como sale en pantalla, en mayúsculas "
                    f"y sin espacios ('04', 'E03', 'F12') o el bot no lo encuentra",
                )
                self.assertIsInstance(e, dict, f"{ctx}: debería ser un objeto")
                self.assertTrue(str(e.get("significa", "")).strip(),
                                f"{ctx}: falta 'significa'")
                pasos = e.get("pasos")
                self.assertIsInstance(pasos, list, f"{ctx}: 'pasos' debe ser una lista")
                self.assertTrue(pasos, f"{ctx}: 'pasos' no puede estar vacío")
                for p in pasos:
                    self.assertIsInstance(p, str, f"{ctx}: cada paso es texto")
                fam = e.get("familia")
                if fam is not None:
                    self.assertIn(fam, FAMILIAS, f"{ctx}: familia desconocida {fam!r}")

    def test_ningun_paso_manda_a_abrir_el_aparato(self):
        # Abrirlo anula la garantía que este módulo existe para proteger.
        malo = re.compile(r"\b(abre|abrir|destapa|desarma)\b", re.I)
        for marca, tabla in self.datos["marcas"].items():
            for codigo, e in tabla.items():
                for p in e.get("pasos", []):
                    self.assertNotRegex(p, malo, f"{marca} → {codigo}: no mandes a abrirlo")


class DiagnosticoDeclaradoTest(unittest.TestCase):
    """El módulo puede funcionar y ser invisible: si sale del listado de
    capacidades, nadie descubre que Max diagnostica averías."""

    def test_aparece_en_las_capacidades(self):
        src = CEREBRO.read_text(encoding="utf-8")
        m = re.search(r"const CAPACIDADES = \[(.*?)\n  \];", src, re.S)
        self.assertIsNotNone(m, "no se encontró CAPACIDADES")
        self.assertIn("avería", m.group(1).lower())


if __name__ == "__main__":
    unittest.main()
