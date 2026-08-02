"""Cada llamada del navegador a la RTDB, cruzada con la regla de su ruta.

El modo de fallo de este repo no es el 403: es el `.catch(()=>{})` que lo
esconde. Una regla que se endurece de más deja ocho sitios diciendo "✅
eliminado" sin eliminar nada, y la suite entera sigue en verde.

Aquí se recorren TODOS los ficheros que hablan con Firebase (no solo un par),
se extrae ruta + método, y se comprueba contra la regla que gobierna esa ruta.
Lo único que se afirma es lo que se puede afirmar leyendo las reglas: que un
DELETE no puede pasar si la regla exige que newData exista.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGLAS = json.loads((RAIZ / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]

# Todo lo que puede hablar con la RTDB, no una muestra.
FUENTES = sorted(
    [p for p in (RAIZ / "js").glob("*.js") if "tm-bundle" not in p.name]
    + list((RAIZ / "js" / "src").glob("*.src.js"))
    + list(RAIZ.glob("*.html"))
)

# fetch(<lo que sea>/<ruta>.json ... method: 'X'
LLAMADA = re.compile(
    r"""fetch\(\s*[^)]*?['"`/]([a-z_][\w]*)(/[^'"`]*)?\.json[^)]*?\)""",
    re.I | re.S)
METODO = re.compile(r"""method\s*:\s*['"](\w+)['"]""", re.I)

# Nombres que aparecen en URLs que no son de la RTDB (GitHub API, etc.).
AJENOS = {"repos", "contents", "git", "actions", "api", "raw", "workflows",
          "dispatches", "blobs", "trees", "commits", "refs", "heads"}


def _llamadas():
    """(fichero, linea, raiz_del_nodo, resto_de_ruta, metodo)"""
    for f in FUENTES:
        if not f.is_file():
            continue
        txt = f.read_text(encoding="utf-8", errors="ignore")
        for m in LLAMADA.finditer(txt):
            raiz = m.group(1)
            if raiz in AJENOS or raiz not in REGLAS:
                continue
            met = METODO.search(m.group(0))
            yield (f.name, txt[:m.start()].count("\n") + 1, raiz,
                   m.group(2) or "", (met.group(1).upper() if met else "GET"))


def _regla_write(raiz: str, resto: str):
    """La regla .write que gobierna la ruta: la más profunda que exista.

    En RTDB basta con que la del nodo o la de un ancestro conceda, así que se
    devuelven todas las de la cadena para poder razonar sobre ellas.
    """
    nodo, cadena = REGLAS[raiz], []
    if ".write" in nodo:
        cadena.append(nodo[".write"])
    for tramo in [t for t in resto.split("/") if t]:
        if tramo in nodo:
            nodo = nodo[tramo]
        else:
            comodines = [k for k in nodo if k.startswith("$")]
            if not comodines:
                return cadena
            nodo = nodo[comodines[0]]
        if ".write" in nodo:
            cadena.append(nodo[".write"])
    return cadena


def _exige_que_exista(expr) -> bool:
    """La regla rechaza cualquier borrado."""
    if expr is True:
        return False
    if not isinstance(expr, str):
        return True
    e = expr.replace(" ", "")
    return "newData.exists()" in e and "!newData.exists()" not in e


class BorradosQueLaReglaRechazaTest(unittest.TestCase):

    def test_ningun_delete_del_cliente_esta_condenado_al_403(self):
        # Si la regla lo rechaza, el .catch vacio lo oculta y la funcion miente:
        # "suscriptor eliminado", "notificaciones desactivadas"… y nada cambia.
        fallos = []
        for fichero, linea, raiz, resto, metodo in _llamadas():
            if metodo != "DELETE":
                continue
            cadena = _regla_write(raiz, resto)
            if cadena and all(_exige_que_exista(w) for w in cadena):
                fallos.append(f"{fichero}:{linea} DELETE /{raiz}{resto} "
                              f"→ la regla exige newData.exists()")
        self.assertEqual([], fallos, "borrados que siempre devolverán 403:\n"
                         + "\n".join(fallos))

    def test_ninguna_llamada_apunta_a_una_ruta_sin_regla(self):
        # Sin regla propia manda la raiz, que es false/false.
        pat = re.compile(r"""fetch\(\s*[^)]*?(?:base|rtdbUrl|rtdb|url|db)\s*"""
                         r"""(?:\+\s*['"]/|\}/)([a-z_][\w]*)""", re.I)
        fallos = set()
        for f in FUENTES:
            if not f.is_file():
                continue
            txt = f.read_text(encoding="utf-8", errors="ignore")
            for m in pat.finditer(txt):
                if m.group(1) not in AJENOS and m.group(1) not in REGLAS:
                    fallos.add(f"{f.name}: /{m.group(1)}")
        self.assertEqual(set(), fallos, "rutas sin regla propia: " + str(sorted(fallos)))


class CoberturaTest(unittest.TestCase):
    """Que el escáner siga viendo algo: si un refactor cambia la forma de las
    llamadas y aquí deja de detectarse nada, los tests de arriba pasarían
    vacíos y no protegerían nada."""

    def test_el_escaner_encuentra_llamadas(self):
        llamadas = list(_llamadas())
        self.assertGreater(len(llamadas), 25,
                           "el patrón dejó de reconocer las llamadas a Firebase")
        self.assertGreater(len({c[0] for c in llamadas}), 4,
                           "solo se está mirando un puñado de ficheros")
        self.assertIn("DELETE", {c[4] for c in llamadas},
                      "no se está viendo ningún borrado: el patrón se rompió")


if __name__ == "__main__":
    unittest.main()
