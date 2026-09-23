#!/usr/bin/env python3
"""
Aplica a productos.json los cambios que sube el panel en cambios/*.json.

Por qué existe: "Actualizar tienda" subía el catálogo ENTERO (~540 KB en
base64) para cambiar un precio. Desde un móvil en Cuba eso eran decenas de
segundos de subida. Ahora el panel sube solo los productos que tocó, en un
fichero pequeño `cambios/<ms>-<azar>.json`, y este script los aplica aquí, en
GitHub Actions, donde la subida no le cuesta nada a nadie.

Forma de un fichero de cambios (lo escribe _tmSubirCambios en tm-catalog):

    {
      "v": 1,
      "creado": "2026-09-23T15:04:05.000Z",
      "productos":  [ {...producto completo...}, ... ],   # cambiados o nuevos
      "eliminados": [ "1784404666988", ... ],
      "posiciones": { "<id nuevo>": "<id del que va delante>" | null }
    }

Reglas, las mismas que seguía el panel al subir el catálogo entero:
  · Un producto que ya está se REEMPLAZA entero — si el gestor quitó una
    oferta, `precioOriginal` tiene que desaparecer, no quedarse —, salvo
    `descripcion`: el panel trabaja con el catálogo lite, sin descripciones,
    y si no la trae se conserva la que había (_tmPreservarDescripciones).
  · Uno nuevo va detrás del que tenía delante en el panel (`posiciones`):
    "Duplicar" lo pone arriba y "Nuevo producto" al final.
  · Los ficheros se aplican por orden de nombre, que empieza por la hora.

Modos:
  python scripts/aplicar_cambios.py
      Aplica los de cambios/ al productos.json del directorio, lo reescribe y
      BORRA los ficheros aplicados. Es lo que corre regenerate-artifacts.yml.
  python scripts/aplicar_cambios.py --ref HEAD --salida productos.json
      Lee productos.json y cambios/ tal como están en ese commit de git y
      escribe el resultado en --salida, sin borrar nada. Lo usan los
      workflows de Telegram y de notificaciones: se disparan con el push del
      panel, antes de que regenerate-artifacts haya aplicado nada.

Sale con código 1 si un fichero de cambios está mal formado: aplicarlo a
medias, o saltárselo en silencio, es perder un cambio que el gestor cree
publicado.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
CATALOGO = "productos.json"
CARPETA = "cambios"


class CambioInvalido(ValueError):
    pass


def validar(nombre: str, d) -> None:
    if not isinstance(d, dict) or d.get("v") != 1:
        raise CambioInvalido(f"{nombre}: no es un fichero de cambios v1")
    prods = d.get("productos", [])
    elim = d.get("eliminados", [])
    pos = d.get("posiciones", {})
    if not isinstance(prods, list) or not isinstance(elim, list) or not isinstance(pos, dict):
        raise CambioInvalido(f"{nombre}: productos/eliminados/posiciones con forma incorrecta")
    for p in prods:
        if not isinstance(p, dict) or p.get("id") in (None, "") or not str(p.get("nombre") or "").strip():
            raise CambioInvalido(f"{nombre}: producto sin id o sin nombre: {str(p)[:120]}")


def aplicar(catalogo: list, cambios: list[tuple[str, dict]]) -> list:
    """Devuelve el catálogo con los cambios aplicados, en orden. No toca la
    lista de entrada."""
    out = list(catalogo)
    for nombre, d in cambios:
        validar(nombre, d)
        fuera = {str(i) for i in d.get("eliminados", [])}
        if fuera:
            out = [p for p in out if str(p.get("id")) not in fuera]
        pos = {str(k): (None if v is None else str(v)) for k, v in d.get("posiciones", {}).items()}
        for p in d.get("productos", []):
            pid = str(p["id"])
            i = next((k for k, q in enumerate(out) if str(q.get("id")) == pid), None)
            if i is not None:
                nuevo = dict(p)
                if "descripcion" not in nuevo and "descripcion" in out[i]:
                    nuevo["descripcion"] = out[i]["descripcion"]
                out[i] = nuevo
                continue
            if pid in pos and pos[pid] is None:
                out.insert(0, dict(p))
                continue
            delante = pos.get(pid)
            j = next((k for k, q in enumerate(out) if str(q.get("id")) == delante), None) if delante else None
            if j is None:
                out.append(dict(p))
            else:
                out.insert(j + 1, dict(p))
    return out


def volcar(catalogo: list) -> str:
    # Mismo formato que JSON.stringify(x, null, 2) en el panel, para que un
    # fichero que no cambió no aparezca en el diff.
    return json.dumps(catalogo, indent=2, ensure_ascii=False)


# ── Lectura: del disco o de un commit ─────────────────────────────────────
def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=RAIZ, capture_output=True,
                          text=True, check=True).stdout


def leer_de_git(ref: str) -> tuple[list, list[tuple[str, dict]]]:
    catalogo = json.loads(_git("show", f"{ref}:{CATALOGO}"))
    try:
        nombres = [l for l in _git("ls-tree", "--name-only", f"{ref}", f"{CARPETA}/").splitlines()
                   if l.endswith(".json")]
    except subprocess.CalledProcessError:
        nombres = []
    cambios = [(Path(n).name, json.loads(_git("show", f"{ref}:{n}"))) for n in sorted(nombres)]
    return catalogo, cambios


def leer_de_disco(raiz: Path) -> tuple[list, list[tuple[str, dict]], list[Path]]:
    catalogo = json.loads((raiz / CATALOGO).read_text(encoding="utf-8"))
    ficheros = sorted((raiz / CARPETA).glob("*.json")) if (raiz / CARPETA).is_dir() else []
    cambios = [(f.name, json.loads(f.read_text(encoding="utf-8"))) for f in ficheros]
    return catalogo, cambios, ficheros


def main(argv=None, raiz: Path = RAIZ) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--ref", help="leer de este commit de git en vez del disco (no borra nada)")
    ap.add_argument("--salida", help="con --ref: dónde escribir el catálogo resultante")
    a = ap.parse_args(argv)

    try:
        if a.ref:
            catalogo, cambios = leer_de_git(a.ref)
            resultado = aplicar(catalogo, cambios)
            Path(a.salida or CATALOGO).write_text(volcar(resultado), encoding="utf-8")
            print(f"↪ {len(cambios)} fichero(s) de cambios aplicados en local ({a.ref}).")
            return 0

        catalogo, cambios, ficheros = leer_de_disco(raiz)
        if not cambios:
            print("ℹ️ No hay cambios del panel pendientes.")
            return 0
        resultado = aplicar(catalogo, cambios)
    except CambioInvalido as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1

    (raiz / CATALOGO).write_text(volcar(resultado), encoding="utf-8")
    for f in ficheros:
        f.unlink()
    n = sum(len(d.get("productos", [])) for _, d in cambios)
    m = sum(len(d.get("eliminados", [])) for _, d in cambios)
    print(f"✅ {len(cambios)} fichero(s) aplicados: {n} producto(s) cambiados, {m} eliminados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
