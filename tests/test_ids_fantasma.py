"""Elementos que el JS busca por id y ningún HTML crea.

`document.getElementById('x')` devuelve null cuando no existe. Si el código
comprueba antes de usarlo —`if (!x) return`— no pasa nada: la función se sale y
la pantalla se queda como estaba. Si lo usa directo —`.value`, `.innerHTML`—
tira un TypeError que corta la función ahí mismo, y todo lo que viniera detrás
no se ejecuta nunca.

Eso es lo que pasaba en `cargarConfiguracionGitHub`: rellenaba los tres campos
de GitHub y luego reventaba contra `#firebaseConfigJson`, que se quedó en el
panel viejo. No se veía nada raro —lo de detrás era igual de inútil— pero
cualquier línea que se añadiera al final de esa función habría sido código
muerto sin que nadie se enterara.

Solo se persiguen las desreferencias inmediatas. Los null comprobados son
legítimos y abundan a propósito: el mismo bundle lo cargan index.html,
admin.html y las páginas de producto, y cada una tiene unos elementos y otros
no. Perseguirlos aquí daría cientos de falsos positivos.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FUENTES = ([p for p in sorted(ROOT.glob("js/*.js")) if p.name != "tm-bundle.js"]
           + sorted(ROOT.glob("js/src/*.src.js")))
PAGINAS = [p for pat in ("*.html", "p/*.html", "c/*.html") for p in sorted(ROOT.glob(pat))]

BUSCA = re.compile(r"getElementById\(\s*['\"]([\w-]+)['\"]\s*\)")


def ids_que_existen():
    """Todo lo que llega a ser un id en el navegador.

    No basta con los `id="..."` del HTML: hay elementos que crea el JS, y hay
    ids que se pasan como ARGUMENTO al constructor del HTML —
    `tmCartelCardHTML('tmPubCartel')` acaba escribiendo id="${id}"— que ninguna
    búsqueda de `id="tmPubCartel"` encuentra. Sin esas dos fuentes el resultado
    se llena de fantasmas que sí existen.
    """
    ids = set()
    for p in PAGINAS + FUENTES:
        t = p.read_text(encoding="utf-8", errors="replace")
        ids |= set(re.findall(r'\bid=["\']?([\w-]+)', t))
        ids |= set(re.findall(r"\.id\s*=\s*['\"]([\w-]+)['\"]", t))
        ids |= set(re.findall(r"HTML\(\s*['\"]([\w-]+)['\"]", t))
        ids |= set(re.findall(r"_mensajeProvisional\([^,]*,\s*['\"]([\w-]+)['\"]", t))
    return ids


class IdsFantasmaTest(unittest.TestCase):
    def test_nadie_usa_directo_un_elemento_que_no_existe(self):
        ids = ids_que_existen()
        fallos = []
        for p in FUENTES + PAGINAS:
            for n, linea in enumerate(p.read_text(encoding="utf-8", errors="replace")
                                      .split("\n"), 1):
                for m in BUSCA.finditer(linea):
                    if m.group(1) in ids:
                        continue
                    resto = linea[m.end():].lstrip()
                    # `?.` es seguro; un `.` o `[` pegado detrás lo usa ya.
                    if re.match(r"[.\[]", resto) and not resto.startswith("?."):
                        fallos.append(f"  {p.name}:{n}  #{m.group(1)}\n"
                                      f"      {linea.strip()[:110]}")
        self.assertEqual(
            fallos, [],
            "esto tira un TypeError y corta la función por la mitad — o el "
            "elemento falta en el HTML, o sobra el código que lo busca:\n"
            + "\n".join(fallos),
        )


if __name__ == "__main__":
    unittest.main()
