"""Los <script> inline de admin.html e index.html deben compilar.

admin.html lleva más de 2000 líneas de lógica de negocio dentro de un solo
<script>, y ese bloque va envuelto en un IIFE: un error de sintaxis en
cualquier punto no rompe una función, tumba el bloque entero y deja el admin
sin publicar, sin CRUD y sin configuración. Como no pasa por el bundle, ni
build_js_bundle.py ni ningún otro test lo miraban.

Esto es exactamente lo que pasó al añadir el código de recuperación: una
edición se comió la cabecera de fillAgregarCategorias y se cayó todo el
panel. En el navegador se veía como "esta función no está definida", que
manda a buscar el problema al sitio equivocado.
"""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PAGINAS = ["admin.html", "index.html", "404.html"]

# Se salta los <script src=...> (no tienen cuerpo) y los que no son JS
# ejecutable, como application/ld+json del SEO.
BLOQUE = re.compile(r"<script(?P<attrs>[^>]*)>(?P<cuerpo>.*?)</script>", re.S | re.I)
COMENTARIO = re.compile(r"<!--.*?-->", re.S)


def _sin_comentarios(html: str) -> str:
    """Vacía los comentarios HTML conservando sus saltos de línea.

    Hay comentarios que mencionan <script defer> al explicar por qué un
    fichero se carga aparte; sin esto se leerían como un bloque de verdad y
    el test denunciaría un error de sintaxis que no existe. Se sustituye por
    los mismos saltos de línea para que las líneas que se reportan sigan
    coincidiendo con el fichero real.
    """
    return COMENTARIO.sub(lambda m: "\n" * m.group(0).count("\n"), html)


def _bloques_js(html: str):
    html = _sin_comentarios(html)
    for m in BLOQUE.finditer(html):
        attrs = m.group("attrs").lower()
        if "src=" in attrs:
            continue
        if "type=" in attrs and "javascript" not in attrs and "module" not in attrs:
            continue
        cuerpo = m.group("cuerpo").strip()
        if cuerpo:
            yield html[:m.start()].count("\n") + 1, cuerpo


@unittest.skipIf(shutil.which("node") is None, "node no disponible")
class SintaxisInlineTest(unittest.TestCase):

    def test_los_scripts_inline_compilan(self):
        fallos = []
        for pagina in PAGINAS:
            f = RAIZ / pagina
            if not f.is_file():
                continue
            for linea, cuerpo in _bloques_js(f.read_text(encoding="utf-8")):
                with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                                 encoding="utf-8") as tmp:
                    tmp.write(cuerpo)
                    ruta = tmp.name
                try:
                    r = subprocess.run(["node", "--check", ruta],
                                       capture_output=True, text=True)
                    if r.returncode != 0:
                        detalle = r.stderr.strip().splitlines()
                        pista = next((l for l in detalle if "Error" in l), detalle[:1])
                        fallos.append(f"{pagina}: <script> de la línea {linea} → {pista}")
                finally:
                    Path(ruta).unlink(missing_ok=True)
        self.assertEqual([], fallos, "hay <script> inline que no compilan:\n" +
                         "\n".join(fallos))


if __name__ == "__main__":
    unittest.main()
