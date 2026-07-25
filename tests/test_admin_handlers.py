"""
Todo el JS principal de admin.html vive dentro de un IIFE:

    <script>
    (function(){
      ...
      function pubCatCartelesLote(...){ ... }
      ...
      window.pubSwitch=pubSwitch; window.pubShareAct=pubShareAct;   <-- exports
    })();
    </script>

Una función declarada ahí dentro NO existe para los onclick="" del HTML si no
se exporta a `window` al final del bloque. Cuando falta el export el botón
queda mudo: no pasa nada, no sale ningún error a la vista, y la única pista
es un ReferenceError en la consola del navegador.

Ya pasó dos veces (los botones de "Compartir/Descargar todas" de la pestaña
Publicar y los de mantenimiento de suscriptores en Analytics), así que se
comprueba automáticamente: toda función que se llame desde un manejador
inline y esté declarada dentro del IIFE tiene que estar exportada.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "admin.html"

HANDLERS = re.compile(
    r"""\bon(?:click|change|input|submit|blur|focus|keyup)\s*=\s*(["'])(.*?)\1""",
    re.S,
)
LLAMADA = re.compile(r"\b([A-Za-z_$][\w$]*)\s*\(")
DECLARADA = re.compile(r"^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(", re.M)
EXPORTADA = re.compile(r"\bwindow\.([A-Za-z_$][\w$]*)\s*=")
BLOQUE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)
CABECERA = re.compile(r"^(?:\s|/\*.*?\*/|//[^\n]*\n)+", re.S)


def funciones_dentro_de_iifes(src: str) -> set:
    """
    Nombres declarados dentro de un bloque <script> envuelto en un IIFE.

    Solo esos necesitan export: los declarados en un bloque suelto (como el
    de la pantalla de acceso) ya son globales de por sí.
    """
    nombres = set()
    for cuerpo in BLOQUE.findall(src):
        if CABECERA.sub("", cuerpo).startswith("(function"):
            nombres.update(DECLARADA.findall(cuerpo))
    return nombres


def sin_interpolaciones(s: str) -> str:
    """
    Quita los `${...}` de un manejador inline, contando llaves para soportar
    los anidados (`${esc(x).replace(/a/g,'b')}`).

    Lo de dentro de `${...}` se evalúa al CONSTRUIR el HTML, en el ámbito del
    IIFE, así que no necesita estar exportado — solo lo de fuera, que es lo
    que el navegador compila al hacer click.
    """
    out, i = [], 0
    while i < len(s):
        if s.startswith("${", i):
            nivel, i = 1, i + 2
            while i < len(s) and nivel:
                if s[i] == "{":
                    nivel += 1
                elif s[i] == "}":
                    nivel -= 1
                i += 1
        else:
            out.append(s[i])
            i += 1
    return "".join(out)


class AdminHandlersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = ADMIN.read_text(encoding="utf-8")

    def test_funciones_de_onclick_estan_exportadas_a_window(self):
        llamadas = set()
        for _, cuerpo in HANDLERS.findall(self.src):
            llamadas.update(LLAMADA.findall(sin_interpolaciones(cuerpo)))

        declaradas = funciones_dentro_de_iifes(self.src)
        exportadas = set(EXPORTADA.findall(self.src))

        # Solo interesan las declaradas dentro de un IIFE de admin.html: las
        # de js/*.js y las de los bloques sueltos ya son globales.
        faltan = sorted((llamadas & declaradas) - exportadas)
        self.assertFalse(
            faltan,
            "Estas funciones se llaman desde un onclick pero no se exportan a "
            "window, así que el botón no hace nada. Añádelas a la lista de "
            "`window.X=X;` al final del IIFE de admin.html:\n  - "
            + "\n  - ".join(faltan),
        )

    def test_el_chequeo_detecta_un_export_que_falta(self):
        """El test de arriba solo vale si de verdad falla cuando falta un
        export — si no, pasaría siempre y no protegería de nada."""
        roto = self.src.replace("window.pubCatCartelesLote=pubCatCartelesLote;", "")
        self.assertNotEqual(roto, self.src, "no se encontró el export de referencia")

        llamadas = set()
        for _, cuerpo in HANDLERS.findall(roto):
            llamadas.update(LLAMADA.findall(sin_interpolaciones(cuerpo)))
        faltan = (llamadas & funciones_dentro_de_iifes(roto)) - set(EXPORTADA.findall(roto))
        self.assertIn("pubCatCartelesLote", faltan)


if __name__ == "__main__":
    unittest.main()
