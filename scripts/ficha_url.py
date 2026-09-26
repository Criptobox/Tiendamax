"""La dirección pública de la ficha de un producto: /p/<nombre-corto>.

El `slug` lo propone el panel (marca y modelo, máx. 28 caracteres) y
regenerate_artifacts.py publica la ficha en p/<slug>.html, que GitHub Pages
sirve también sin el .html. Sin un slug válido, p/producto-<id>.html, que
existe siempre: como ficha o como salto a la dirección nueva.

Mismo criterio que tmUrlProducto (js/src/tm-patches.src.js): si uno aceptara
un nombre que el otro rechaza, el panel publicaría enlaces a una página que
el generador nunca creó.
"""
import re

SITE = "https://tiendamax.org"
SLUG_MAX = 28
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def slug_valido(s) -> bool:
    return (isinstance(s, str) and 3 <= len(s) <= SLUG_MAX + 12
            and bool(_SLUG_RE.match(s)) and not s.startswith("producto-"))


def url_ficha(p: dict) -> str:
    s = (p or {}).get("slug")
    return f"{SITE}/p/{s}" if slug_valido(s) else f"{SITE}/p/producto-{(p or {}).get('id', '')}.html"
