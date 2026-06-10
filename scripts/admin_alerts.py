#!/usr/bin/env python3
"""
TiendaMax — Alertas admin por Telegram
Detecta eventos nuevos desde la última ejecución y notifica al admin.
Diseñado para correr en GitHub Actions cada 30 min via admin-alerts.yml.
No requiere el bot de Render corriendo — llama la API de Telegram directamente.
"""
import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

TZ = ZoneInfo("America/Havana")
BOT_TOKEN = os.environ["BOT_TOKEN"]
ADMIN_CHAT_ID = os.environ["ADMIN_CHAT_ID"]


def send_telegram(text: str) -> None:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": ADMIN_CHAT_ID, "text": text, "parse_mode": "Markdown"},
        timeout=10,
    )
    r.raise_for_status()


def init_firebase():
    import firebase_admin
    from firebase_admin import credentials, db

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_json:
        print("❌ FIREBASE_SERVICE_ACCOUNT no configurada.", file=sys.stderr)
        return None
    try:
        cred_dict = json.loads(sa_json)
        cred = credentials.Certificate(cred_dict)
        db_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})
        return db
    except Exception as e:
        print(f"❌ Error Firebase: {e}", file=sys.stderr)
        return None


def _safe(text: str, max_len: int = 40) -> str:
    """Escapa caracteres problemáticos de Markdown en texto de usuario."""
    return str(text)[:max_len].replace("*", "").replace("_", "").replace("`", "")


def main() -> int:
    db = init_firebase()
    if not db:
        return 1

    meta_ref = db.reference("admin_meta")
    meta = meta_ref.get() or {}
    first_run = "last_alert_ts" not in meta
    last_ts: int = meta.get("last_alert_ts", 0)
    now_ts = int(datetime.now().timestamp() * 1000)
    new_meta = dict(meta)
    alerts: list[str] = []

    # ── 1. Nuevos suscriptores push ───────────────────────────────────────
    try:
        tokens = db.reference("tokens").get() or {}
        nuevos_subs = [
            v for v in tokens.values()
            if isinstance(v, dict) and int(v.get("timestamp", 0)) > last_ts
        ]
        if nuevos_subs and not first_run:
            total = len(tokens)
            n = len(nuevos_subs)
            alerts.append(
                f"🔔 *{n} nuevo{'s' if n > 1 else ''} suscriptor{'es' if n > 1 else ''}*\n"
                f"Total en lista push: *{total}*"
            )
    except Exception as e:
        print(f"⚠️ tokens: {e}", file=sys.stderr)

    # ── 2. Nuevas reseñas (por conteo) ────────────────────────────────────
    try:
        resenas = db.reference("resenas").get() or {}
        total_res = sum(len(v) for v in resenas.values() if isinstance(v, dict))
        last_res_count = meta.get("last_resenas_count", total_res)
        nuevas_res = total_res - last_res_count
        if nuevas_res > 0 and not first_run:
            alerts.append(
                f"⭐ *{nuevas_res} nueva{'s' if nuevas_res > 1 else ''} reseña{'s' if nuevas_res > 1 else ''}*"
            )
        new_meta["last_resenas_count"] = total_res
    except Exception as e:
        print(f"⚠️ resenas: {e}", file=sys.stderr)

    # ── 3. Nuevas ventas ──────────────────────────────────────────────────
    try:
        ventas_raw = db.reference("ventas").get() or {}
        ventas = list(ventas_raw.values()) if isinstance(ventas_raw, dict) else []
        nuevas_v = [
            v for v in ventas
            if isinstance(v, dict) and int(v.get("id", 0)) > last_ts
        ]
        if nuevas_v and not first_run:
            total_v = sum(v.get("total", 0) for v in nuevas_v)
            prods = ", ".join(
                f"{_safe(v.get('producto', '?'))} x{v.get('cantidad', 1)}"
                for v in nuevas_v[:3]
            )
            suffix = " …" if len(nuevas_v) > 3 else ""
            alerts.append(
                f"🛒 *{len(nuevas_v)} venta{'s' if len(nuevas_v) > 1 else ''} nueva{'s' if len(nuevas_v) > 1 else ''}*\n"
                f"{prods}{suffix}\n💰 *${total_v:.2f} USD*"
            )
    except Exception as e:
        print(f"⚠️ ventas: {e}", file=sys.stderr)

    # ── 4. Nuevos interesados ─────────────────────────────────────────────
    try:
        interesados = db.reference("interesados").get() or {}
        nuevos_int: list[str] = []
        for entries in interesados.values():
            if isinstance(entries, dict):
                for entry in entries.values():
                    if isinstance(entry, dict) and int(entry.get("ts", 0)) > last_ts:
                        nuevos_int.append(_safe(entry.get("producto", "?")))
        if nuevos_int and not first_run:
            prods = ", ".join(nuevos_int[:4])
            suffix = " …" if len(nuevos_int) > 4 else ""
            alerts.append(
                f"📋 *{len(nuevos_int)} interesado{'s' if len(nuevos_int) > 1 else ''}* en: {prods}{suffix}"
            )
    except Exception as e:
        print(f"⚠️ interesados: {e}", file=sys.stderr)

    # ── 5. Nuevas peticiones "avísame cuando vuelva" ──────────────────────
    try:
        avisos = db.reference("avisos_stock").get() or {}
        nuevos_av: list[str] = []
        for prod_id, entries in avisos.items():
            if isinstance(entries, dict):
                for entry in entries.values():
                    if isinstance(entry, dict) and int(entry.get("timestamp", 0)) > last_ts:
                        nuevos_av.append(_safe(prod_id))
        if nuevos_av and not first_run:
            prods = ", ".join(sorted(set(nuevos_av)))
            alerts.append(
                f"🔁 *{len(nuevos_av)} 'avísame cuando vuelva'*\nProductos: {prods}"
            )
    except Exception as e:
        print(f"⚠️ avisos_stock: {e}", file=sys.stderr)

    # ── Enviar o inicializar ──────────────────────────────────────────────
    if first_run:
        print("Primera ejecución: estado inicializado. No se envían alertas.")
    elif alerts:
        now_str = datetime.now(TZ).strftime("%d/%m %H:%M")
        text = f"⚡ *TiendaMax — {now_str}*\n\n" + "\n\n".join(alerts)
        try:
            send_telegram(text)
            print(f"✅ {len(alerts)} alerta(s) enviada(s).")
        except Exception as e:
            print(f"❌ Error Telegram: {e}", file=sys.stderr)
            return 1
    else:
        print("Sin novedades.")

    new_meta["last_alert_ts"] = now_ts
    meta_ref.set(new_meta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
