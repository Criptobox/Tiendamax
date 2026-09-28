"""El vale del gestor: de qué almacén recoge el cliente, y las condiciones
(ATENCIÓN) que escribe el dueño.

El comportamiento lo comprueba tests/vale_almacen_check.mjs en un navegador
de verdad, que se corre desde aquí. Lo de este fichero son los contratos que
se leen en el código.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "vale_almacen_check.mjs"
VALE = (ROOT / "vale.html").read_text(encoding="utf-8")


def cuerpo(nombre):
    m = (re.search(r"^(?:async )?function " + nombre + r"\([^)]*\)\{$(.*?)^\}$", VALE, re.S | re.M)
         or re.search(r"^(?:async )?function " + nombre + r"\([^)]*\)\{(.*)\}$", VALE, re.M))
    if not m:
        raise AssertionError(f"no encuentro function {nombre}() en vale.html")
    return m.group(1)


class EnNavegadorTest(unittest.TestCase):
    def test_vale(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_todo_lo_que_manda_el_vale_pregunta_el_almacen(self):
        """Un camino de envío que se salte la pregunta manda al cliente sin
        dirección, y nadie lo nota hasta que llama preguntando dónde es."""
        for nombre in ("copiarVale", "enviarValeWA", "enviarValeImagenWA"):
            self.assertIn("conAlmacen(", cuerpo(nombre), nombre)

    def test_los_almacenes_son_los_del_panel(self):
        """Una lista propia en el vale se desincroniza de 🏭 Almacenes. Y las
        direcciones no se escriben en el código: el repo es público y la de
        recogida depende del producto."""
        self.assertIn("/almacenes.json", cuerpo("cargarAlmacenesVale"))
        self.assertIn("tm_almacenes_borrados", cuerpo("listaAlmacenes"))

    def test_las_condiciones_van_a_privado(self):
        self.assertIn("/privado/vale_config/atencion.json", VALE)
        self.assertIn("textoAtencion()", cuerpo("construirTextoVale"))
        self.assertNotIn("•   Horarios de atención al cliente:", VALE,
                         "las condiciones del texto no pueden seguir escritas a mano: no saldrían las editadas")

    def test_cancelar_compartir_por_el_nombre_del_error(self):
        """Chrome rechaza con un DOMException llamado AbortError cuyo mensaje
        es «Share canceled»: mirando solo el mensaje, cancelar descargaba."""
        self.assertIn("e.name==='AbortError'", cuerpo("_enviarValeImagenWA"))


if __name__ == "__main__":
    unittest.main()
