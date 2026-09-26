"""Categorías y subcategorías apagadas desde el panel.

El panel guarda el interruptor en categorias.json, clave `apagadas`:

    {"categorias":    {"ROPA": {"off": true, "ts": 1790000000000}},
     "subcategorias": {"WIFI": {"ANTENAS Y CPE": {"off": true, "ts": ...}}}}

`off: false` es una categoría que se volvió a encender (se deja la entrada
para que la fusión entre teléfonos sepa cuál es más reciente), así que lo
que cuenta es `off`, no que la clave exista.

Un producto está apagado si lo está su categoría o su subcategoría. Los
nombres se comparan sin tildes ni mayúsculas, igual que `tmCatApagada` en
js/src/tm-data.src.js: si aquí se comparara distinto, la página /p/ de un
producto seguiría existiendo mientras la tienda lo esconde, o al revés.
"""
import json
import unicodedata
from pathlib import Path


def _norm(s) -> str:
    s = unicodedata.normalize("NFD", str(s if s is not None else ""))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip().upper()


class Apagadas:
    def __init__(self, datos=None):
        self.cats: set[str] = set()
        self.subs: set[tuple[str, str]] = set()
        if not isinstance(datos, dict):
            return
        cs = datos.get("categorias")
        for k, e in (cs.items() if isinstance(cs, dict) else []):
            if isinstance(e, dict) and e.get("off") is True:
                self.cats.add(_norm(k))
        ss = datos.get("subcategorias")
        for c, m in (ss.items() if isinstance(ss, dict) else []):
            if not isinstance(m, dict):
                continue
            for s, e in m.items():
                if isinstance(e, dict) and e.get("off") is True:
                    self.subs.add((_norm(c), _norm(s)))

    @property
    def hay(self) -> bool:
        return bool(self.cats or self.subs)

    def categoria(self, cat) -> bool:
        return _norm(cat) in self.cats

    def producto(self, p) -> bool:
        if not isinstance(p, dict):
            return False
        c = _norm(p.get("categoria"))
        if not c:
            return False
        if c in self.cats:
            return True
        sub = p.get("subcategoria")
        return bool(sub) and (c, _norm(sub)) in self.subs

    def visibles(self, productos) -> list:
        return [p for p in (productos or []) if not self.producto(p)]


def leer(path) -> Apagadas:
    """Lee categorias.json. Si no se puede leer, nada está apagado: el
    fichero lo sirve el mismo repo, y fallar cerrado aquí borraría todas las
    páginas /p/ por un JSON roto."""
    try:
        datos = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return Apagadas()
    return Apagadas(datos.get("apagadas") if isinstance(datos, dict) else None)
