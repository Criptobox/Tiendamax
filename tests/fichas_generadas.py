"""Dónde está la ficha de cada producto en p/ (para los tests).

La ficha vive en p/<slug>.html; p/producto-<id>.html y los nombres anteriores
son saltos a ella (ver preparar_rutas en scripts/regenerate_artifacts.py).
Un test que mire producto-<id>.html estaría comprobando el salto, no la ficha.
"""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
P_DIR = RAIZ / "p"


def es_salto(html: str) -> bool:
    return 'http-equiv="refresh"' in html


def _catalogo():
    try:
        return json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def ficha_de(p: dict) -> Path | None:
    """La ficha de verdad del producto, o None si no hay página."""
    candidatos = []
    if p.get("slug"):
        candidatos.append(P_DIR / f"{p['slug']}.html")
    candidatos.append(P_DIR / f"producto-{p.get('id')}.html")
    for f in candidatos:
        if f.exists() and not es_salto(f.read_text(encoding="utf-8", errors="ignore")):
            return f
    return None


def fichas() -> list[Path]:
    """Todas las fichas (no los saltos), en orden estable."""
    if not P_DIR.is_dir():
        return []
    return sorted(f for f in P_DIR.glob("*.html")
                  if not es_salto(f.read_text(encoding="utf-8", errors="ignore")))


def pid_de(f: Path) -> str:
    """El id del producto de una ficha, sea cual sea su nombre de fichero."""
    for p in _catalogo():
        if f == ficha_de(p):
            return str(p.get("id"))
    return f.stem.replace("producto-", "")
