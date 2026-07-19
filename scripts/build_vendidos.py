#!/usr/bin/env python3
"""
TiendaMax — Agrega /ventas de Firebase RTDB a un JSON estático (vendidos.json)
con el total real de unidades vendidas por producto.

Por qué: el badge "🔥 Más vendido" de las tarjetas hoy es un flag manual
que activa el admin a mano (⭐ en "Gestionar productos"), no un dato real.
Este script sí agrega las ventas reales (/ventas, ya público en
firebase-rules.json) para mostrar "🔥 N vendidos" con datos verdaderos.

Ejecutar cada 3 horas desde GitHub Actions. No requiere
FIREBASE_SERVICE_ACCOUNT: /ventas tiene ".read": true.

Salida: vendidos.json con forma:
  { "actualizado": "2026-07-19T12:00:00Z", "por_producto": { "<id>": 7, ... } }
"""
from __future__ import annotations
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config.json"
OUT_PATH = ROOT / "vendidos.json"
TIMEOUT = 25


def _atomic_write(path: Path, content: str) -> None:
    tmp = path.parent / f".{path.name}.tmp"
    try:
        tmp.write_text(content, encoding="utf-8")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


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
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": "TiendaMax-build-vendidos/1.0"})
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

    print(f"↪ Descargando ventas desde {base}/ventas.json ...")
    data = _fetch_json(f"{base}/ventas.json")
    if data is None:
        print("❌ No se pudo descargar /ventas.json", file=sys.stderr)
        return 1

    por_producto: dict[str, int] = {}
    if isinstance(data, dict):
        for venta_id, venta in data.items():
            if not isinstance(venta, dict):
                continue
            pid = venta.get("productoId")
            if pid is None:
                continue
            cantidad = venta.get("cantidad")
            try:
                cantidad = int(cantidad) if cantidad is not None else 1
            except (TypeError, ValueError):
                cantidad = 1
            if cantidad < 0:
                continue
            key = str(pid)
            por_producto[key] = por_producto.get(key, 0) + cantidad

    out = {
        "actualizado": datetime.now(timezone.utc).isoformat(),
        "por_producto": por_producto,
    }
    new_content = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    old_content = OUT_PATH.read_text(encoding="utf-8") if OUT_PATH.exists() else ""
    if new_content == old_content:
        print("ℹ️ Sin cambios en vendidos.json.")
        return 0
    _atomic_write(OUT_PATH, new_content)
    print(f"✅ vendidos.json escrito: {len(por_producto)} productos con ventas registradas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
