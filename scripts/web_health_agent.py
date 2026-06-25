#!/usr/bin/env python3
"""
TiendaMax — Agente Health Web
Revisa la tienda publicada y avisa por Telegram si algo importante falla.

Chequeos sin navegador pesado:
- Home, admin, offline, manifest, service worker, sitemap, productos.json
- Validez de JSON/manifest/productos
- PWA mínima: manifest + iconos + SW con fetch/push
- Páginas /p/ para productos recientes
- Imágenes principales de muestra
- Tiempo de respuesta básico

Estado/anti-spam: guarda última firma en Firebase /admin_meta/web_health.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = os.environ.get("SITE_URL", "https://tiendamax.org").rstrip("/")
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
ADMIN_CHAT_ID = os.environ.get("ADMIN_CHAT_ID", "")
TZ = ZoneInfo("America/Havana")
TIMEOUT = 15
WARN_SLOW_SECONDS = 6.0
REPEAT_ALERT_HOURS = 2


@dataclass
class Result:
    level: str  # ok | warn | fail
    name: str
    detail: str = ""
    ms: int | None = None


def send_telegram(text: str) -> None:
    if not BOT_TOKEN or not ADMIN_CHAT_ID:
        print("Telegram no configurado; mensaje:\n" + text)
        return
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": ADMIN_CHAT_ID, "text": text[:3900]},
        timeout=12,
    )
    r.raise_for_status()


def init_firebase():
    try:
        import firebase_admin
        from firebase_admin import credentials, db
    except Exception:
        return None
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_json:
        return None
    try:
        cred_dict = json.loads(sa_json)
        cred = credentials.Certificate(cred_dict)
        db_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})
        return db
    except Exception as e:
        print(f"⚠️ Firebase no disponible para estado health: {e}", file=sys.stderr)
        return None


def req(path_or_url: str, method: str = "GET") -> tuple[requests.Response | None, float, str]:
    url = path_or_url if path_or_url.startswith("http") else urljoin(SITE_URL + "/", path_or_url.lstrip("/"))
    t0 = time.perf_counter()
    try:
        r = requests.request(
            method,
            url,
            timeout=TIMEOUT,
            allow_redirects=True,
            headers={"User-Agent": "TiendaMaxHealthAgent/1.0"},
        )
        return r, time.perf_counter() - t0, ""
    except Exception as e:
        return None, time.perf_counter() - t0, str(e)


def check_http(path: str, label: str, must_contain: str | None = None) -> tuple[Result, str]:
    r, dt, err = req(path)
    ms = int(dt * 1000)
    if r is None:
        return Result("fail", label, f"sin respuesta: {err}", ms), ""
    if r.status_code >= 500:
        return Result("fail", label, f"HTTP {r.status_code}", ms), r.text[:200000]
    if r.status_code >= 400:
        return Result("fail", label, f"HTTP {r.status_code}", ms), r.text[:200000]
    text = r.text
    if must_contain and must_contain not in text:
        return Result("warn", label, f"no contiene: {must_contain}", ms), text[:200000]
    if dt > WARN_SLOW_SECONDS:
        return Result("warn", label, f"lento: {dt:.1f}s", ms), text[:200000]
    return Result("ok", label, f"HTTP {r.status_code}", ms), text[:200000]


def safe_json(text: str) -> Any:
    return json.loads(text)


def load_local_products() -> list[dict]:
    try:
        return json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
    except Exception:
        return []


def main() -> int:
    results: list[Result] = []

    # Básicos
    home_res, home = check_http("/", "Home", "TiendaMax")
    results.append(home_res)
    results.append(check_http("/admin.html", "Admin", "TiendaMax Admin")[0])
    results.append(check_http("/offline.html", "Offline", None)[0])
    results.append(check_http("/sitemap.xml", "Sitemap", "urlset")[0])

    # Manifest
    manifest_res, manifest_txt = check_http("/manifest.json", "Manifest", None)
    try:
        manifest = safe_json(manifest_txt)
        icons = manifest.get("icons") or []
        sizes = " ".join(str(i.get("sizes", "")) for i in icons)
        if not manifest.get("start_url") or not manifest.get("display"):
            manifest_res = Result("fail", "Manifest", "falta start_url/display", manifest_res.ms)
        elif "192" not in sizes or "512" not in sizes:
            manifest_res = Result("warn", "Manifest", "faltan iconos 192/512", manifest_res.ms)
        else:
            manifest_res = Result("ok", "Manifest", "PWA manifest OK", manifest_res.ms)
    except Exception as e:
        manifest_res = Result("fail", "Manifest", f"JSON inválido: {e}", manifest_res.ms)
    results.append(manifest_res)

    # Service worker
    sw_res, sw_txt = check_http("/sw.js", "Service Worker", "CACHE_NAME")
    if sw_res.level != "fail":
        missing = [x for x in ["addEventListener('fetch'", "addEventListener('push'", "CACHE_NAME"] if x not in sw_txt]
        if missing:
            sw_res = Result("warn", "Service Worker", "faltan señales: " + ", ".join(missing), sw_res.ms)
        else:
            sw_res = Result("ok", "Service Worker", "fetch + push OK", sw_res.ms)
    results.append(sw_res)

    # Productos JSON live
    prod_res, prod_txt = check_http("/productos.json", "Productos JSON", None)
    live_products: list[dict] = []
    try:
        live_products = safe_json(prod_txt)
        if not isinstance(live_products, list) or not live_products:
            prod_res = Result("fail", "Productos JSON", "lista vacía o inválida", prod_res.ms)
        else:
            ids = [str(p.get("id")) for p in live_products]
            dup = len(ids) - len(set(ids))
            missing = [p.get("id") for p in live_products if not p.get("nombre") or p.get("precioActual") is None or p.get("stock") is None]
            if dup:
                prod_res = Result("fail", "Productos JSON", f"{dup} ID duplicado(s)", prod_res.ms)
            elif missing:
                prod_res = Result("warn", "Productos JSON", f"{len(missing)} producto(s) con campos básicos faltantes", prod_res.ms)
            else:
                prod_res = Result("ok", "Productos JSON", f"{len(live_products)} productos OK", prod_res.ms)
    except Exception as e:
        prod_res = Result("fail", "Productos JSON", f"JSON inválido: {e}", prod_res.ms)
    results.append(prod_res)

    # Si el live no cargó, usa local para páginas esperadas
    products = live_products if live_products else load_local_products()
    products_sorted = sorted(products, key=lambda p: str(p.get("id", "")), reverse=True)

    # Páginas /p/ de muestra: recientes + algunos primeros
    sample = []
    seen = set()
    for p in products_sorted[:10] + products[:5]:
        pid = str(p.get("id", ""))
        if pid and pid not in seen:
            seen.add(pid); sample.append(p)
    page_fails = []
    for p in sample[:12]:
        pid = p.get("id")
        r, dt, err = req(f"/p/producto-{pid}.html")
        if r is None or r.status_code >= 400:
            page_fails.append(f"{pid}: {err or 'HTTP '+str(r.status_code)}")
        elif "og:title" not in r.text and "Producto" not in r.text:
            page_fails.append(f"{pid}: sin OG/title")
    if page_fails:
        results.append(Result("fail", "Páginas /p/", "; ".join(page_fails[:5])))
    elif sample:
        results.append(Result("ok", "Páginas /p/", f"{len(sample[:12])} páginas de muestra OK"))

    # Imágenes principales de muestra
    img_fails = []
    checked = 0
    for p in products[:12]:
        img = str(p.get("imagen") or "")
        if not img or img.startswith("data:"):
            if img.startswith("data:"):
                img_fails.append(f"{p.get('id')}: imagen base64")
            continue
        url = img if img.startswith("http") else urljoin(SITE_URL + "/", img.lstrip("/"))
        r, dt, err = req(url, method="GET")
        checked += 1
        if r is None or r.status_code >= 400:
            img_fails.append(f"{p.get('id')}: {err or 'HTTP '+str(r.status_code)}")
        if checked >= 8:
            break
    if img_fails:
        results.append(Result("warn", "Imágenes", "; ".join(img_fails[:5])))
    elif checked:
        results.append(Result("ok", "Imágenes", f"{checked} imágenes de muestra OK"))

    # Señales seguridad/SEO básicas en home
    if home:
        if "Content-Security-Policy" not in home:
            results.append(Result("warn", "Seguridad", "Home sin meta CSP visible"))
        if "application/ld+json" not in home:
            results.append(Result("warn", "SEO", "Home sin JSON-LD visible"))

    fails = [r for r in results if r.level == "fail"]
    warns = [r for r in results if r.level == "warn"]
    status = "fail" if fails else "warn" if warns else "ok"
    signature = "|".join(f"{r.level}:{r.name}:{r.detail}" for r in fails + warns)

    db = init_firebase()
    meta_ref = db.reference("admin_meta/web_health") if db else None
    meta = meta_ref.get() if meta_ref else {}
    if not isinstance(meta, dict):
        meta = {}

    prev_status = meta.get("status")
    prev_sig = meta.get("signature")
    last_alert = meta.get("last_alert_ts") or 0
    try:
        last_alert = int(last_alert)
    except Exception:
        last_alert = 0

    should_alert = False
    if status != "ok" and (signature != prev_sig or time.time() - last_alert > REPEAT_ALERT_HOURS * 3600):
        should_alert = True
    if status == "ok" and prev_status and prev_status != "ok":
        should_alert = True

    now_dt = datetime.now(TZ)
    if should_alert:
        if status == "ok":
            msg = "✅ TiendaMax Health Agent\nLa tienda volvió a estar OK.\n" + now_dt.strftime("%d/%m/%Y %I:%M %p")
        else:
            title = "🚨 TiendaMax Health Agent" if fails else "⚠️ TiendaMax Health Agent"
            msg_lines = [title, now_dt.strftime("%d/%m/%Y %I:%M %p"), f"Sitio: {SITE_URL}", ""]
            if fails:
                msg_lines.append("FALLAS:")
                msg_lines += [f"• {r.name}: {r.detail}" for r in fails[:8]]
                msg_lines.append("")
            if warns:
                msg_lines.append("AVISOS:")
                msg_lines += [f"• {r.name}: {r.detail}" for r in warns[:8]]
                msg_lines.append("")
            msg_lines.append("Acción sugerida: abre el admin y revisa Copiloto/Sistema. Si falla /p/, regenera artefactos.")
            msg = "\n".join(msg_lines)
        send_telegram(msg)
        meta["last_alert_ts"] = int(time.time())

    meta.update({
        "status": status,
        "signature": signature,
        "checked_at": now_dt.isoformat(),
        "fails": [r.__dict__ for r in fails[:20]],
        "warns": [r.__dict__ for r in warns[:20]],
        "ok_count": len([r for r in results if r.level == "ok"]),
    })
    if meta_ref:
        meta_ref.set(meta)

    # Log completo para Actions
    print(f"Health status: {status} | ok={meta['ok_count']} warn={len(warns)} fail={len(fails)}")
    for r in results:
        ms = f" ({r.ms}ms)" if r.ms is not None else ""
        print(f"[{r.level.upper()}] {r.name}{ms}: {r.detail}")

    # Fallar el workflow solo con fallas duras; warnings no rompen.
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
