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

    meta_ref  = db.reference("admin_meta")
    meta      = meta_ref.get() or {}
    first_run = "last_alert_ts" not in meta
    last_ts   = meta.get("last_alert_ts", 0)
    last_count = meta.get("last_token_count")  # None si nunca se guardó
    now_ts    = int(datetime.now().timestamp() * 1000)

    try:
        tokens = db.reference("tokens").get() or {}
        total  = len(tokens) if isinstance(tokens, dict) else 0
        nuevos = [
            v for v in tokens.values()
            if isinstance(v, dict) and int(v.get("timestamp", 0)) > last_ts
        ]
    except Exception as e:
        print(f"❌ Error leyendo tokens: {e}", file=sys.stderr)
        return 1

    alertas: list[str] = []

    if not first_run:
        # Nuevos suscriptores
        if nuevos:
            n = len(nuevos)
            alertas.append(
                f"🔔 *{n} nuevo{'s' if n > 1 else ''} suscriptor{'es' if n > 1 else ''}*\n"
                f"Total en lista push: *{total}*"
            )

        # Suscriptores perdidos
        if last_count is not None and total < last_count:
            perdidos = last_count - total
            alertas.append(
                f"📉 *{perdidos} suscriptor{'es' if perdidos > 1 else ''} canceló{'aron' if perdidos > 1 else ''} las notificaciones*\n"
                f"Total en lista push: *{total}*"
            )

    if first_run:
        print("Primera ejecución: estado inicializado.")
    elif alertas:
        try:
            send_telegram("\n\n".join(alertas))
            print(f"✅ {len(alertas)} alerta(s) enviada(s).")
        except Exception as e:
            print(f"❌ Error Telegram: {e}", file=sys.stderr)
            return 1
    else:
        print("Sin cambios en suscriptores.")

    meta["last_alert_ts"]    = now_ts
    meta["last_token_count"] = total
    meta_ref.set(meta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
