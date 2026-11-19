"""El catálogo en vivo: lo que el dueño cambia le llega a Max y a la tienda al momento.

El fallo era silencioso. Max comparaba el catálogo con una firma de «cuántos hay,
el primero y el último», así que un producto que se agotaba o cambiaba de precio
no la movía; y la tienda leía productos-lite.json una sola vez al abrir. Con el
chat abierto, Max ofrecía lo que ya no había y nada daba error.

tests/catalogo_vivo_check.mjs lo prueba en un navegador con un servidor que cambia
el catálogo a mitad de la conversación. Aquí además se fija la estructura que lo
sostiene, porque un cambio inocente a cualquiera de estas piezas la rompe sin ruido.
"""
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "catalogo_vivo_check.mjs"
CEREBRO = (ROOT / "js" / "src" / "tm-bot-cerebro.src.js").read_text(encoding="utf-8")
DATA = (ROOT / "js" / "src" / "tm-data.src.js").read_text(encoding="utf-8")


class CatalogoVivoTest(unittest.TestCase):
    def test_en_un_navegador(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run([node, str(CHECK)], cwd=str(ROOT), capture_output=True,
                           text=True, timeout=240)
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())

    def test_la_firma_de_max_mira_lo_que_cambia(self):
        i = CEREBRO.index("function refrescarCatalogo(")
        cuerpo = CEREBRO[i:i + 1400]
        for campo in ("p.stock", "p.precioActual", "p.precioOriginal", "p.nombre", "p.categoria", "p.moneda"):
            self.assertIn(campo, cuerpo, f"la firma del catálogo de Max debe incluir {campo}")

    def test_max_se_pone_al_dia_antes_de_contestar_y_al_abrir(self):
        self.assertRegex(CEREBRO, r"function _ponerAlDia\(")
        # En sendMessage, junto a la pausa de «escribiendo» (no suma espera visible).
        i = CEREBRO.index("async function sendMessage(")
        self.assertIn("_ponerAlDia(", CEREBRO[i:i + 1800])
        j = CEREBRO.index("function openPanel(")
        self.assertIn("_ponerAlDia(", CEREBRO[j:j + 300])

    def test_la_revision_nunca_corre_en_el_panel(self):
        # En el panel `productos` es el catálogo que se PUBLICA: sustituirlo por
        # el del sitio se leería como borrar lo editado y sin publicar.
        i = DATA.index("function tmRefrescarCatalogoVivo(")
        self.assertIn("_tmEsPanel()", DATA[i:i + 300])

    def test_la_revision_pregunta_al_servidor_y_vacia_el_filtro_en_memoria(self):
        i = DATA.index("function tmRefrescarCatalogoVivo(")
        cuerpo = DATA[i:i + 6000]
        # `no-cache` = petición condicional; sin esto Pages sirve su copia de 10 min.
        self.assertIn("cache: 'no-cache'", cuerpo)
        # La memoria del filtro de la rejilla mira solo cuántos hay y el primero.
        self.assertIn("_tmFiltroCacheKey = null", cuerpo)
        # Una descarga fallida no es «no cambió»: nada se pisa.
        self.assertRegex(cuerpo, r"if \(!dataCat && !dataProd\) return false")

    def test_cargador_y_revision_comparten_la_preparacion_de_productos(self):
        # Dos copias de «arreglar las fotos, conservar comisión y reseñas» acabarían
        # guardando productos distintos según el camino.
        self.assertEqual(DATA.count("function _tmPrepararProductos("), 1)
        self.assertGreaterEqual(len(re.findall(r"_tmPrepararProductos\(", DATA)), 3)


if __name__ == "__main__":
    unittest.main()
