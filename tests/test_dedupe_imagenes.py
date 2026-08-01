"""Imágenes idénticas repetidas en imagenes/.

Como el nombre sale de Date.now(), subir la misma foto dos veces crea dos
ficheros distintos con el mismo contenido. A diferencia de las huérfanas (que
cubre limpiar_imagenes.py), estas SÍ están referenciadas: hay que reapuntar las
referencias a la copia que se conserva antes de borrar las demás.
"""
import hashlib
import re
import subprocess
import sys
import unittest
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

IMG_DIR = RAIZ / "imagenes"
THUMB_DIR = IMG_DIR / "thumbs"
SCRIPT = RAIZ / "scripts" / "dedupe_imagenes.py"
EXTS = {".webp", ".jpg", ".jpeg", ".png"}


def _imagenes():
    if not IMG_DIR.is_dir():
        return []
    return [p for p in IMG_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in EXTS]


class ScriptDedupeTest(unittest.TestCase):

    def test_no_toca_nada_sin_pedirselo(self):
        src = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('"--aplicar", action="store_true"', src)
        self.assertIn("if not args.aplicar:", src)

    def test_reescribe_antes_de_borrar(self):
        # Al revés dejaría productos apuntando a una imagen ya inexistente si
        # el proceso se cortara por el medio.
        src = SCRIPT.read_text(encoding="utf-8")
        i_reescribe = src.index("f.write_text(nuevo")
        i_borra = src.index("f.unlink()")
        self.assertLess(i_reescribe, i_borra)

    def test_mira_las_mismas_fuentes_que_limpiar_imagenes(self):
        # Si una de las dos listas se queda corta, un script daría por muerta
        # una imagen que la otra ve viva.
        import dedupe_imagenes as ded
        import limpiar_imagenes as lim
        self.assertEqual(set(lim.FUENTES_FIJAS), set(ded.FUENTES_FIJAS))
        self.assertEqual(set(lim.GLOBS), set(ded.GLOBS))

    def test_el_informe_no_deja_ficheros_sucios(self):
        antes = subprocess.run(["git", "status", "--porcelain"], cwd=RAIZ,
                               capture_output=True, text=True).stdout
        subprocess.run([sys.executable, str(SCRIPT)], cwd=RAIZ,
                       capture_output=True, text=True, check=True)
        despues = subprocess.run(["git", "status", "--porcelain"], cwd=RAIZ,
                                 capture_output=True, text=True).stdout
        self.assertEqual(antes, despues, "el modo informe no debe modificar nada")


class EstadoDelRepoTest(unittest.TestCase):
    """El resultado de haber pasado el dedupe: que no vuelva a colarse."""

    def test_no_quedan_imagenes_duplicadas(self):
        por_hash = defaultdict(list)
        for p in _imagenes():
            por_hash[hashlib.md5(p.read_bytes()).hexdigest()].append(p.name)
        dups = {h: n for h, n in por_hash.items() if len(n) > 1}
        self.assertEqual({}, dups, f"{len(dups)} grupo(s) de imágenes idénticas")

    def test_ninguna_referencia_apunta_al_vacio(self):
        disco = {p.name for p in _imagenes()}
        patron = re.compile(r"(?:img|banner)_[\w.\-]*\.(?:webp|jpg|jpeg|png)", re.I)
        fuentes = [RAIZ / n for n in ("productos.json", "productos-lite.json",
                                      "combos.json", "banners.json", "index.html")]
        fuentes += list((RAIZ / "p").glob("*.html"))
        fuentes += list((RAIZ / "c").glob("*.html"))
        rotas = set()
        for f in fuentes:
            if not f.is_file():
                continue
            texto = f.read_text(encoding="utf-8", errors="ignore")
            rotas |= {n for n in patron.findall(texto) if n not in disco}
        self.assertEqual(set(), rotas, "hay referencias a imágenes que no existen")

    def test_cada_miniatura_tiene_su_original(self):
        if not THUMB_DIR.is_dir():
            self.skipTest("sin miniaturas")
        disco = {p.name for p in _imagenes()}
        sueltas = {p.name for p in THUMB_DIR.iterdir()
                   if p.is_file() and p.name not in disco}
        self.assertEqual(set(), sueltas,
                         "miniaturas cuyo original ya se borró")


if __name__ == "__main__":
    unittest.main()
