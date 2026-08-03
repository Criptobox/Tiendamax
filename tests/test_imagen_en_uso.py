"""
Corre la regresión de imagenEnUso() (tests/imagen_en_uso_check.mjs) dentro de
unittest, que es lo que ejecuta CI (run-tests.yml).

La lógica vive en js/src/tm-data.src.js, así que las comprobaciones están
escritas en Node contra ese mismo archivo — reimplementarlas en Python las
dejaría desincronizadas del código real a la primera modificación.

Además se comprueba aquí, en Python, que ninguna imagen referenciada por el
catálogo falte del repo: es el síntoma que dejó el bug (img_1783179797781.webp,
el inversor Tataliken 4000W), y el que se ve en la tienda.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tests" / "imagen_en_uso_check.mjs"

# Igual que _rutaImagenDesdeUrl() en js/src/tm-data.src.js
RUTA_IMG = re.compile(r"(?:^|/)imagenes/([\w.\-]+\.(?:webp|jpg|jpeg|png))(?:[?#]|$)", re.I)


def _urls_de(producto):
    for k in ("imagen", "imagenSecundaria"):
        v = producto.get(k)
        if isinstance(v, str):
            yield v
    v = producto.get("imagenes")
    if isinstance(v, list):
        for u in v:
            if isinstance(u, str):
                yield u


def _catalogo(nombre):
    try:
        d = json.loads((ROOT / nombre).read_text(encoding="utf-8"))
    except Exception:
        return []
    return d if isinstance(d, list) else (d.get("productos") or [])


class ImagenEnUsoTest(unittest.TestCase):
    def test_regresion_en_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node no está disponible en este entorno")
        r = subprocess.run(
            [node, str(CHECK)], cwd=str(ROOT),
            capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(r.returncode, 0, "\n" + (r.stderr or r.stdout).strip())


class EstadoDelCatalogoTest(unittest.TestCase):
    def test_ninguna_foto_del_catalogo_falta_del_repo(self):
        faltan = {}
        for nombre in ("productos.json", "productos-lite.json"):
            for p in _catalogo(nombre):
                for u in _urls_de(p):
                    m = RUTA_IMG.search(u)
                    if m and not (ROOT / "imagenes" / m.group(1)).exists():
                        faltan.setdefault(m.group(1), set()).add(str(p.get("id")))
        self.assertEqual(
            {}, {k: sorted(v) for k, v in faltan.items()},
            "hay productos apuntando a imágenes que no existen en el repo "
            "(se ven rotas en la tienda)",
        )


if __name__ == "__main__":
    unittest.main()
