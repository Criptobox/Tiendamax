"""Lo que frenaba una venta en el móvil: búsqueda, pedido, MN y Max.

Ver tests/ventas_freno_check.mjs — nada de esto da error, el cliente
simplemente se va creyendo algo falso."""
import os
import shutil
import subprocess
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class VentasFrenoTest(unittest.TestCase):
    def test_en_navegador(self):
        if not shutil.which("node"):
            self.skipTest("sin node")
        r = subprocess.run(["node", os.path.join(RAIZ, "tests", "ventas_freno_check.mjs")],
                           capture_output=True, text=True, timeout=400)
        self.assertEqual(0, r.returncode, r.stdout[-3000:] + r.stderr[-3000:])

    def test_ningun_importe_mn_con_coma_de_miles(self):
        """toLocaleString('es-CU') da «80,750» en Chrome: en Cuba esa coma es decimal."""
        sucios = []
        for raiz, _, archivos in os.walk(os.path.join(RAIZ, "js", "src")):
            for a in archivos:
                if a.endswith(".src.js") and "bot" not in a:
                    src = open(os.path.join(raiz, a), encoding="utf-8").read()
                    if "toLocaleString('es-CU')" in src.replace("toLocaleString('es-CU') da", ""):
                        sucios.append(a)
        self.assertEqual([], sucios, "usa tmMN() para los importes en MN")


if __name__ == "__main__":
    unittest.main()
