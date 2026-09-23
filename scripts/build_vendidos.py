#!/usr/bin/env python3
"""
TiendaMax — Agrega /ventas de Firebase RTDB a un JSON estático (vendidos.json)
con el total real de unidades vendidas por producto.

Por qué: el badge "🔥 Más vendido" de las tarjetas hoy es un flag manual
que activa el admin a mano (⭐ en "Gestionar productos"), no un dato real.
Este script sí agrega las ventas reales de /ventas para mostrar
"🔥 N vendidos" con datos verdaderos.

Ejecutar cada 3 horas desde GitHub Actions. REQUIERE
FIREBASE_SERVICE_ACCOUNT: /ventas se cerró (solo lo lee el dueño, ver
firebase-rules.json) porque las ventas son del negocio, no del público. Este
script leía /ventas sin credenciales, así que desde ese cierre Firebase le
contestaba 401 y el workflow falló cada 3 horas durante semanas, con
vendidos.json congelado. Lo que se publica aquí son solo recuentos por
producto; nunca clientes, precios ni canales.

Salida: vendidos.json con forma:
  { "actualizado": "2026-07-19T12:00:00Z", "por_producto": { "<id>": 7, ... } }
"""
from __future__ import annotations
import json
import os
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


def _leer_ventas_admin() -> dict | None:
    """Lee /ventas con la cuenta de servicio (salta las reglas del navegador)."""
    try:
        import firebase_admin
        from firebase_admin import credentials, db
        cred_dict = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
        if not firebase_admin._apps:
            firebase_admin.initialize_app(
                credentials.Certificate(cred_dict),
                {"databaseURL": f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"},
            )
        return db.reference("ventas").get() or {}
    except Exception as exc:
        print(f"  Error leyendo /ventas con la cuenta de servicio: {exc}", file=sys.stderr)
        return None


def main() -> int:
    if os.environ.get("FIREBASE_SERVICE_ACCOUNT"):
        print("↪ Leyendo /ventas con la cuenta de servicio ...")
        data = _leer_ventas_admin()
    else:
        base = _database_url()
        if not base:
            return 1
        print(f"⚠️ Sin FIREBASE_SERVICE_ACCOUNT: /ventas es privado y esto dará 401.", file=sys.stderr)
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

    # Se comparan los RECUENTOS, no el fichero: `actualizado` cambia en cada
    # pasada, así que comparar el texto entero hacía un commit (y un
    # despliegue de Pages) cada 3 horas aunque no se hubiera vendido nada.
    try:
        previo = json.loads(OUT_PATH.read_text(encoding="utf-8")).get("por_producto")
    except Exception:
        previo = None
    if previo == por_producto:
        print("ℹ️ Sin cambios en vendidos.json.")
        return 0
    out = {
        "actualizado": datetime.now(timezone.utc).isoformat(),
        "por_producto": por_producto,
    }
    new_content = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    _atomic_write(OUT_PATH, new_content)
    print(f"✅ vendidos.json escrito: {len(por_producto)} productos con ventas registradas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
