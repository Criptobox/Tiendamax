"""Max + IA: la IA solo interpreta; el catálogo contesta (max_ia_check / max_ia_worker_check)."""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")
WORKER = (ROOT / "mini-services" / "max-ia" / "worker.js").read_text(encoding="utf-8")
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")


def _node(nombre):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node no está disponible")
    return subprocess.run([node, str(ROOT / "tests" / nombre)], cwd=str(ROOT), capture_output=True, text=True, timeout=300)


class EnNodeTest(unittest.TestCase):
    def test_worker(self):
        r = _node("max_ia_worker_check.mjs")
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_en_el_navegador(self):
        r = _node("max_ia_check.mjs")
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class ContratosTest(unittest.TestCase):
    def test_sin_url_en_el_meta_no_hay_ia(self):
        """El interruptor: el meta viene vacío hasta que el dueño pone la URL del Worker."""
        m = re.search(r'<meta name="tm-bot-ia" content="([^"]*)">', INDEX)
        self.assertIsNotNone(m, "falta <meta name=tm-bot-ia> en index.html")

    def test_la_ia_solo_se_consulta_cuando_max_no_supo(self):
        i = CEREBRO.index("async function _mejorarConIA")
        self.assertIn("if(!data || !data.sinRespuesta) return null", CEREBRO[i:i + 300])
        self.assertIn("if(data.sinRespuesta && _iaUrl())", CEREBRO)

    def test_al_servicio_solo_viaja_texto_y_catalogo(self):
        i = CEREBRO.index("async function _preguntarIA")
        cuerpo = CEREBRO[i:i + 2200]
        self.assertIn("JSON.stringify({ q, cat })", cuerpo)
        for prohibido in ("localStorage", "telefono", "tel:", "nombre del cliente"):
            self.assertNotIn(prohibido, cuerpo)

    def test_el_worker_valida_ids_y_origen(self):
        self.assertIn("idsValidos.has(x)", WORKER)
        self.assertIn("ORIGENES.includes(origen)", WORKER)
        self.assertNotIn("sk-", WORKER, "ninguna clave en el código")


if __name__ == "__main__":
    unittest.main()
