#!/usr/bin/env python3
"""
TiendaMax — Alerta admin: nuevos suscriptores push
Corre cada 30 min via GitHub Actions (admin-alerts.yml).
Solo notifica si alguien nuevo aceptó las notificaciones push.
"""
import json
import os
import sys
from datetime import datetime

import requests

BOT_TOKEN    = os.environ["BOT_TOKEN"]
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


def main() -> int:
    db = init_firebase()
    if not db:
        return 1

    meta_ref = db.reference("admin_meta")
    meta     = meta_ref.get() or {}
    first_run = "last_alert_ts" not in meta
    last_ts   = meta.get("last_alert_ts", 0)
    now_ts    = int(datetime.now().timestamp() * 1000)

    try:
        tokens = db.reference("tokens").get() or {}
        nuevos = [
            v for v in tokens.values()
            if isinstance(v, dict) and int(v.get("timestamp", 0)) > last_ts
        ]
    except Exception as e:
        print(f"❌ Error leyendo tokens: {e}", file=sys.stderr)
        return 1

    if not first_run and nuevos:
        total = len(tokens)
        n = len(nuevos)
        texto = (
            f"🔔 *{n} nuevo{'s' if n > 1 else ''} suscriptor{'es' if n > 1 else ''}*\n"
            f"Total en lista push: *{total}*"
        )
        try:
            send_telegram(texto)
            print(f"✅ Alerta enviada: {n} nuevo(s) suscriptor(es).")
        except Exception as e:
            print(f"❌ Error Telegram: {e}", file=sys.stderr)
            return 1
    elif first_run:
        print("Primera ejecución: estado inicializado.")
    else:
        print("Sin nuevos suscriptores.")

    meta["last_alert_ts"] = now_ts
    meta_ref.set(meta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
