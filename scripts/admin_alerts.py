#!/usr/bin/env python3
"""
TiendaMax — Alerta admin: nuevos suscriptores push
Corre cada 30 min via GitHub Actions (admin-alerts.yml).
Solo notifica si aparece un deviceId que nunca se había visto.
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

    # Conjunto de IDs conocidos (claves de /tokens que ya notificamos)
    known_ids: set = set(meta.get("known_token_ids") or [])
    first_run = not known_ids and "known_token_ids" not in meta

    try:
        tokens = db.reference("tokens").get() or {}
        current_ids: set = set(tokens.keys()) if isinstance(tokens, dict) else set()
        total = len(current_ids)
    except Exception as e:
        print(f"❌ Error leyendo tokens: {e}", file=sys.stderr)
        return 1

    alertas: list[str] = []

    if not first_run:
        nuevos_ids  = current_ids - known_ids   # IDs que no habíamos visto
        perdidos_ids = known_ids - current_ids   # IDs que desaparecieron

        if nuevos_ids:
            n = len(nuevos_ids)
            alertas.append(
                f"🔔 *{n} nuevo{'s' if n > 1 else ''} suscriptor{'es' if n > 1 else ''}*\n"
                f"Total en lista push: *{total}*"
            )

        if perdidos_ids:
            p = len(perdidos_ids)
            alertas.append(
                f"📉 *{p} suscriptor{'es' if p > 1 else ''} canceló{'aron' if p > 1 else ''} las notificaciones*\n"
                f"Total en lista push: *{total}*"
            )

    if first_run:
        print(f"Primera ejecución: {total} suscriptores registrados como conocidos.")
    elif alertas:
        try:
            send_telegram("\n\n".join(alertas))
            print(f"✅ {len(alertas)} alerta(s) enviada(s).")
        except Exception as e:
            print(f"❌ Error Telegram: {e}", file=sys.stderr)
            return 1
    else:
        print("Sin cambios en suscriptores.")

    # Guardar el conjunto actualizado de IDs conocidos
    meta["known_token_ids"] = list(current_ids)
    meta_ref.set(meta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
