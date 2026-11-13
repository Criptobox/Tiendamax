#!/usr/bin/env python3
"""El icono de la app instalada sigue al tema de temporada.

El icono de una app ya instalada lo pone el sistema a partir de manifest.json,
no la página: Chrome en Android vuelve a leer el manifest de vez en cuando y,
si los iconos cambiaron, actualiza el de la pantalla de inicio. Así que el
manifest tiene que decir, cada día, los iconos del tema que toca.
(iOS no actualiza nunca el icono de una app ya añadida: allí cambia solo el de
la pestaña, que lo hace index.html al momento.)

Qué tema toca lo decide la MISMA regla que el bloque #tm-tema-regla de
index.html/admin.html, con la elección del panel (config.json → tema) y la
fecha de Cuba. test_tema_estacional.py compara las dos reglas día a día de un
año entero: tres copias que se separan son tres respuestas distintas.

Escribe manifest.json solo si cambió y lo dice en $GITHUB_OUTPUT (cambio=1).

    python scripts/tema_icono.py [--fecha AAAA-MM-DD]
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parents[1]
MANIFEST = RAIZ / "manifest.json"
CONFIG = RAIZ / "config.json"
TEMAS = ("navidad", "halloween")
CADUCA_MS = 45 * 864e5


def temporada(d: date) -> str:
    m, x, y = d.month, d.day, d.year
    if m == 12:
        return f"navidad-{y}"
    if m == 1 and x <= 6:
        return f"navidad-{y - 1}"
    if (m == 10 and x >= 24) or (m == 11 and x <= 1):
        return f"halloween-{y}"
    return ""


def tema_efectivo(cfg, d: date, ahora_ms: float) -> str:
    t = temporada(d)
    modo = cfg.get("modo") if isinstance(cfg, dict) else None
    if modo in TEMAS and ahora_ms - float(cfg.get("ts") or 0) < CADUCA_MS:
        return modo
    if modo == "off" and cfg.get("temporada") == t:
        return ""
    return t.split("-")[0]


def icono(src: str, tema: str) -> str:
    nombre = src.rsplit("/", 1)[-1]
    return f"/iconos/{tema}/{nombre}" if tema else f"/iconos/{nombre}"


def aplicar(manifest: dict, tema: str) -> dict:
    nuevo = dict(manifest)
    nuevo["icons"] = [dict(i, src=icono(i["src"], tema)) for i in manifest.get("icons", [])]
    return nuevo


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--fecha", help="AAAA-MM-DD (por defecto, hoy en Cuba)")
    a = ap.parse_args(argv)
    zona = ZoneInfo("America/Havana")
    if a.fecha:
        d = date.fromisoformat(a.fecha)
        ahora = datetime.combine(d, time(12), zona)
    else:
        ahora = datetime.now(zona)
        d = ahora.date()
    try:
        cfg = json.loads(CONFIG.read_text(encoding="utf-8")).get("tema")
    except Exception:
        cfg = None
    tema = tema_efectivo(cfg, d, ahora.timestamp() * 1000)
    texto = MANIFEST.read_text(encoding="utf-8")
    manifest = json.loads(texto)
    nuevo = json.dumps(aplicar(manifest, tema), ensure_ascii=False, indent=4) + "\n"
    cambio = json.loads(nuevo) != manifest
    if cambio:
        MANIFEST.write_text(nuevo, encoding="utf-8")
    print(f"{d}: tema {tema or 'ninguno'} · manifest {'actualizado' if cambio else 'ya estaba al día'}")
    salida = os.environ.get("GITHUB_OUTPUT")
    if salida:
        with open(salida, "a", encoding="utf-8") as f:
            f.write(f"cambio={1 if cambio else 0}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
