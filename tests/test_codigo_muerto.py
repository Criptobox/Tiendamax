"""Funciones JS que ya no llama nadie.

Una función muerta no rompe nada, y ese es justo el problema: se lee, se
mantiene y se copia como si estuviera viva. En este repo hubo 57 —los botones
que las llamaban se fueron cuando el panel pasó de index.html a admin.html, y
las funciones se quedaron. Varias tocaban ids del DOM que ya no existen en
ningún HTML, así que ni siquiera habrían funcionado si alguien las hubiera
llamado.

Cómo se cuenta una referencia, y por qué así:

  · Solo cuentan los archivos que EJECUTA un navegador. `scripts/*.py` y los
    workflows citan nombres de funciones en comentarios; contarlos escondió
    `copiarParaFacebook`, cuya única "referencia" era una línea de
    build_js_bundle.py explicando el orden del bundle.
  · No cuentan las líneas que son enteramente un comentario. `copiarYAbrirRevolico`
    se escondía detrás del comentario que la describía, justo encima.
  · Sí cuentan los HTML enteros, atributos incluidos: `onclick="foo()"` y
    `data-action="foo"` son llamadas de verdad — event-delegation.js resuelve
    el segundo con `window[name]`.
  · NO se intenta quitar comentarios de bloque ni de fin de línea: un `/*`
    dentro de una cadena se comía medio archivo y daba por muertas funciones
    perfectamente vivas.

Los bundles generados (`js/tm-bundle.js`, `js/src/*.js` minificados) quedan
fuera: son copias, y contarlas haría que toda función pareciera usada.
"""
import re
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Lo que un navegador carga como código fuente.
FUENTES = (sorted(ROOT.glob("js/src/*.src.js"))
           + [p for p in sorted(ROOT.glob("js/*.js")) if p.name != "tm-bundle.js"]
           + [ROOT / n for n in ("index.html", "admin.html", "vale.html", "404.html")])

# Dónde puede estar la llamada.
PATRONES = ("*.html", "*.js", "*.json", "js/*.js", "js/src/*.src.js",
            "p/*.html", "c/*.html")

DEFINICIONES = (
    re.compile(r"^[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(", re.M),
    re.compile(r"^[ \t]*(?:window\.)?([A-Za-z_$][\w$]*)[ \t]*=[ \t]*"
               r"(?:async[ \t]+)?function[ \t]*\(", re.M),
    re.compile(r"^[ \t]*(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*"
               r"(?:async[ \t]*)?\([^)\n]*\)[ \t]*=>", re.M),
)
IDENTIFICADOR = re.compile(r"[A-Za-z_$][\w$]*")


def sin_lineas_de_comentario(texto):
    return "\n".join(l for l in texto.split("\n")
                     if not re.match(r"\s*(//|\*|/\*|<!--)", l))


class CodigoMuertoTest(unittest.TestCase):
    def test_ninguna_funcion_se_queda_sin_quien_la_llame(self):
        universo = {}
        for patron in PATRONES:
            for p in ROOT.glob(patron):
                if p.name == "tm-bundle.js":
                    continue
                universo[p] = p.read_text(encoding="utf-8", errors="replace")
        self.assertIn(ROOT / "admin.html", universo, "el universo se quedó sin admin.html")

        usos = Counter()
        for texto in universo.values():
            usos.update(IDENTIFICADOR.findall(sin_lineas_de_comentario(texto)))

        definidas = {}
        for p in FUENTES:
            if not p.exists():
                continue
            texto = p.read_text(encoding="utf-8")
            for rx in DEFINICIONES:
                for m in rx.finditer(texto):
                    definidas.setdefault(m.group(1), []).append(p.name)

        muertas = sorted(
            (n, sorted(set(a))) for n, a in definidas.items()
            # <=2 letras: nombres de una letra dentro de funciones minificadas
            # a mano y contadores; no vale la pena perseguirlos.
            if len(n) > 2 and usos[n] <= len(a)
        )
        self.assertEqual(
            muertas, [],
            "estas funciones no las llama nadie — o se borran, o falta el "
            "botón que debía llamarlas:\n" +
            "\n".join(f"  {n}  ({', '.join(a)})" for n, a in muertas),
        )


if __name__ == "__main__":
    unittest.main()
