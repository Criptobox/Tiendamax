#!/usr/bin/env python3
"""
TiendaMax — Sincroniza las reseñas de Firebase RTDB a un JSON estático
(`resenas-cache.json`) para que los clientes en Cuba (donde *.firebaseio.com
suele estar bloqueado) puedan ver las reseñas aunque Firebase no responda.

Ejecutar cada hora desde GitHub Actions. No requiere FIREBASE_SERVICE_ACCOUNT:
las reglas de Firebase permiten lectura pública de /resenas.

Salida: resenas-cache.json con forma:
  {
    "actualizado": "2026-07-08T12:00:00Z",
    "total": 47,
    "por_producto": {
      "1778104115783": [ { ...resena... }, ... ],
      ...
    }
  }
"""
from __future__ import annotations
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config.json"
OUT_PATH = ROOT / "resenas-cache.json"
TIMEOUT = 25  # segundos


def _database_url() -> str | None:
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        fb = cfg.get("firebaseConfig") or {}
        return fb.get("databaseURL") or (
            f"https://{fb['projectId']}-default-rtdb.firebaseio.com"
            if fb.get("projectId") else None
        )
    except Exception as exc:
        print(f"❌ No se pudo leer databaseURL de config.json: {exc}", file=sys.stderr)
        return None


def _fetch_json(url: str) -> dict | None:
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": "TiendaMax-sync-resenas/1.0"})
        if not r.ok:
            print(f"  HTTP {r.status_code} en {url}", file=sys.stderr)
            return None
        return r.json()
    except Exception as exc:
        print(f"  Error fetching {url}: {exc}", file=sys.stderr)
        return None


def main() -> int:
    base = _database_url()
    if not base:
        return 1

    print(f"↪ Descargando reseñas desde {base}/resenas.json ...")
    data = _fetch_json(f"{base}/resenas.json")
    if data is None:
        print("❌ No se pudo descargar /resenas.json", file=sys.stderr)
        return 1
    if not isinstance(data, dict) or not data:
        print("ℹ️ /resenas vacío o sin reseñas. Escribo cache vacío.")
        out = {
            "actualizado": datetime.now(timezone.utc).isoformat(),
            "total": 0,
            "por_producto": {},
        }
        OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return 0

    # data = { "productId": { "ts1": {...resena...}, "ts2": {...} }, ... }
    por_producto: dict[str, list] = {}
    total = 0
    for pid, entries in data.items():
        if not isinstance(entries, dict):
            continue
        lista = []
        for ts, r in entries.items():
            if not isinstance(r, dict):
                continue
            # Validación mínima: debe tener autor y texto
            if not r.get("autor") or not r.get("texto"):
                continue
            lista.append({
                "id": r.get("id") or int(ts) if str(ts).isdigit() else ts,
                "ts": r.get("ts") or (int(ts) if str(ts).isdigit() else None),
                "autor": r.get("autor", ""),
                "texto": r.get("texto", ""),
                "estrellas": int(r.get("estrellas") or 0),
                "fecha": r.get("fecha", ""),
                "productoId": str(pid),
                "productoNombre": r.get("productoNombre", ""),
                "comprador": bool(r.get("comprador")),
                # NO incluimos "imagen" (data URLs base64 son muy grandes y dispararían
                # el tamaño del JSON de cache a varios MB). La imagen solo vive en Firebase.
            })
        if lista:
            # Ordenar por ts/id descendente (más nuevas primero)
            lista.sort(key=lambda x: (x.get("ts") or 0) if isinstance(x.get("ts"), (int, float)) else 0, reverse=True)
            por_producto[str(pid)] = lista
            total += len(lista)

    out = {
        "actualizado": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "por_producto": por_producto,
    }
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✅ resenas-cache.json escrito: {total} reseñas en {len(por_producto)} productos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
