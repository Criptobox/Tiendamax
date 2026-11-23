#!/usr/bin/env python3
"""Corre las pruebas de tests/ en PARALELO (y, si se quiere, solo las afectadas).

La suite entera tarda unos 12 minutos porque `unittest discover` corre una
prueba a la vez, y casi todo el tiempo se va en pruebas que abren un navegador y
esperan. Esas pruebas no se pisan entre sí (cada una levanta su servidor en un
puerto libre), así que se reparten en N procesos.

    python3 scripts/correr_tests.py                 # todo, en paralelo (N = núcleos)
    python3 scripts/correr_tests.py -j 4            # N procesos
    python3 scripts/correr_tests.py --cambios       # solo lo relacionado con lo que cambió
    python3 scripts/correr_tests.py --cambios --base origin/main
    python3 scripts/correr_tests.py test_bot_max test_max_audit   # módulos concretos
    python3 scripts/correr_tests.py --lista         # qué correría, sin correr

`--cambios` es para el día a día: mira qué archivos cambiaron respecto a la rama
base y elige las pruebas que NOMBRAN esos archivos (en su .py o en su .mjs). Es
una ayuda, no una garantía: antes de subir a main se corre la suite completa.

Los tiempos de cada módulo se guardan en `.tests_tiempos.json` (no se sube) para
repartir mejor la próxima vez: lo más lento primero y cada proceso con la misma
carga.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
TESTS = RAIZ / "tests"
TIEMPOS = RAIZ / ".tests_tiempos.json"
PESO_POR_DEFECTO = 8.0      # segundos supuestos para un módulo sin medir


def modulos():
    return sorted(p.stem for p in TESTS.glob("test_*.py"))


def leer_tiempos():
    try:
        return json.loads(TIEMPOS.read_text(encoding="utf-8"))
    except Exception:
        return {}


def repartir(mods, n, tiempos):
    """Reparto codicioso: el módulo más lento al proceso menos cargado."""
    cubos = [{"carga": 0.0, "mods": []} for _ in range(max(1, n))]
    for m in sorted(mods, key=lambda x: -tiempos.get(x, PESO_POR_DEFECTO)):
        c = min(cubos, key=lambda c: c["carga"])
        c["mods"].append(m)
        c["carga"] += tiempos.get(m, PESO_POR_DEFECTO)
    return [c["mods"] for c in cubos if c["mods"]]


def archivos_cambiados(base):
    def git(*a):
        r = subprocess.run(["git", *a], cwd=str(RAIZ), capture_output=True, text=True)
        return r.stdout.split("\n") if r.returncode == 0 else []
    fs = set(git("diff", "--name-only", base + "...HEAD")) | set(git("diff", "--name-only")) \
        | set(git("diff", "--name-only", "--cached")) | set(git("ls-files", "--others", "--exclude-standard"))
    return {f for f in fs if f}


def referencias(mod):
    """Rutas del repo que nombra una prueba (su .py y los .mjs que lanza)."""
    textos = []
    py = TESTS / (mod + ".py")
    if py.exists():
        t = py.read_text(encoding="utf-8", errors="replace")
        textos.append(t)
        for m in re.findall(r"[\w./-]+\.mjs", t):
            f = TESTS / Path(m).name
            if f.exists():
                textos.append(f.read_text(encoding="utf-8", errors="replace"))
    texto = "\n".join(textos)
    return set(re.findall(r"[\w./-]+\.(?:js|py|html|json|css|md|txt)", texto))


def relacionadas(mods, cambios):
    sel = []
    for m in mods:
        propio = {f"tests/{m}.py"} | {f"tests/{Path(x).name}" for x in re.findall(r"[\w./-]+\.mjs", (TESTS / (m + ".py")).read_text(encoding="utf-8", errors="replace"))}
        if propio & cambios:
            sel.append(m)
            continue
        refs = referencias(m)
        base = {Path(r).name for r in refs}
        for c in cambios:
            # el archivo cambiado, o su versión .src/minificada, o por el nombre suelto
            nombre = Path(c).name
            n2 = nombre.replace(".src.js", ".js")
            if c in refs or nombre in base or n2 in base:
                sel.append(m)
                break
    return sel


def correr_cubo(args):
    idx, mods = args
    t0 = time.time()
    cmd = [sys.executable, "-m", "unittest", "-v"] + [f"tests.{m}" for m in mods]
    r = subprocess.run(cmd, cwd=str(RAIZ), capture_output=True, text=True)
    return idx, mods, r.returncode, r.stdout + r.stderr, time.time() - t0


def tiempos_por_modulo(salida, mods):
    """unittest -v no da tiempos: se reparte el del cubo por número de pruebas."""
    cuentas = {m: len(re.findall(rf"\(tests\.{m}\.", salida)) for m in mods}
    return cuentas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modulos", nargs="*", help="módulos de tests/ (con o sin test_ delante)")
    ap.add_argument("-j", "--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--cambios", action="store_true", help="solo las pruebas relacionadas con lo que cambió")
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--lista", action="store_true")
    a = ap.parse_args()

    todos = modulos()
    if a.modulos:
        mods = []
        for m in a.modulos:
            m = m.replace("tests.", "").replace(".py", "")
            if not m.startswith("test_"):
                m = "test_" + m
            if m not in todos:
                print(f"No existe tests/{m}.py"); return 2
            mods.append(m)
    elif a.cambios:
        cambios = archivos_cambiados(a.base)
        mods = relacionadas(todos, cambios)
        print(f"{len(cambios)} archivo(s) cambiado(s) → {len(mods)} módulo(s) de prueba relacionados")
    else:
        mods = todos

    if a.lista:
        print("\n".join(mods)); return 0
    if not mods:
        print("Nada que correr."); return 0

    tiempos = leer_tiempos()
    cubos = repartir(mods, min(a.jobs, len(mods)), tiempos)
    print(f"Corriendo {len(mods)} módulos en {len(cubos)} proceso(s)…", flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=len(cubos)) as ex:
        resultados = list(ex.map(correr_cubo, enumerate(cubos)))
    total = fallos = errores = saltadas = 0
    mal = []
    for idx, ms, rc, salida, dur in resultados:
        m = re.search(r"Ran (\d+) tests? in", salida)
        n = int(m.group(1)) if m else 0
        total += n
        f = re.search(r"failures=(\d+)", salida); e = re.search(r"errors=(\d+)", salida); s = re.search(r"skipped=(\d+)", salida)
        fallos += int(f.group(1)) if f else 0
        errores += int(e.group(1)) if e else 0
        saltadas += int(s.group(1)) if s else 0
        if rc != 0:
            mal.append((idx, ms, salida))
        # tiempo medido del cubo repartido entre sus módulos según su número de pruebas
        cuentas = tiempos_por_modulo(salida, ms)
        suma = sum(cuentas.values()) or len(ms)
        for mod in ms:
            peso = (cuentas.get(mod, 0) or 1) / suma
            tiempos[mod] = round(dur * peso, 1)
        print(f"  proceso {idx + 1}: {len(ms)} módulos, {n} pruebas, {dur:5.0f}s {'OK' if rc == 0 else 'FALLÓ'}", flush=True)
    try:
        TIEMPOS.write_text(json.dumps(tiempos, indent=1, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
    dur = time.time() - t0
    for idx, ms, salida in mal:
        print("\n" + "=" * 70 + f"\nProceso {idx + 1} FALLÓ ({', '.join(ms)})\n" + "=" * 70)
        bloques = re.findall(r"(?ms)^(?:FAIL|ERROR): .*?(?=^(?:FAIL|ERROR): |^-{70}\nRan |\Z)", salida)
        print("\n".join(b.strip()[:1800] for b in bloques[:8]) or salida[-3000:])
    print(f"\n{'OK' if not mal else 'FALLÓ'}: {total} pruebas en {dur:.0f}s"
          + (f" ({saltadas} saltadas)" if saltadas else "")
          + (f" · {fallos} fallo(s), {errores} error(es)" if mal else ""))
    return 0 if not mal else 1


if __name__ == "__main__":
    sys.exit(main())
