#!/usr/bin/env python3
"""
TiendaMax — Alertas admin via Telegram
Corre cada 10 min via GitHub Actions (admin-alerts.yml).
Alerta sobre: pedidos (interesados), lista de espera y suscriptores push.
"""
import json
import os
import sys
from datetime import datetime

import requests

BOT_TOKEN     = os.environ["BOT_TOKEN"]
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


def check_interesados(db, last_ts: int) -> list[str]:
    """Clientes que tocaron 'Pedir' (WhatsApp) en un producto."""
    try:
        data = db.reference("interesados").get() or {}
    except Exception as e:
        print(f"⚠️  Error leyendo interesados: {e}", file=sys.stderr)
        return []

    nuevos: list[str] = []
    for prod_id, entries in data.items():
        if not isinstance(entries, dict):
            continue
        for _ts_key, entry in entries.items():
            if not isinstance(entry, dict):
                continue
            ts = int(entry.get("ts", 0))
            if ts > last_ts:
                nombre = entry.get("producto") or prod_id
                nuevos.append(nombre)
    return nuevos


def check_lista_espera(db, last_ts: int) -> list[str]:
    """Clientes que se pusieron en lista de espera de un producto agotado."""
    try:
        data = db.reference("lista_espera").get() or {}
    except Exception as e:
        print(f"⚠️  Error leyendo lista_espera: {e}", file=sys.stderr)
        return []

    nuevos: list[str] = []
    for prod_id, entries in data.items():
        if not isinstance(entries, dict):
            continue
        for _entry_id, entry in entries.items():
            if not isinstance(entry, dict):
                continue
            ts = int(entry.get("ts", 0))
            if ts > last_ts:
                nuevos.append(prod_id)
    return nuevos


def check_push_tokens(db, last_ts: int, last_count):
    """Nuevos suscriptores push o cancelaciones."""
    try:
        tokens = db.reference("tokens").get() or {}
        total  = len(tokens) if isinstance(tokens, dict) else 0
        nuevos = [
            v for v in tokens.values()
            if isinstance(v, dict) and int(v.get("timestamp", 0)) > last_ts
        ]
    except Exception as e:
        print(f"⚠️  Error leyendo tokens: {e}", file=sys.stderr)
        return 0, 0, 0

    perdidos = max(0, (last_count or total) - total) if last_count is not None else 0
    return total, len(nuevos), perdidos


def main() -> int:
    db = init_firebase()
    if not db:
        return 1

    meta_ref   = db.reference("admin_meta")
    meta       = meta_ref.get() or {}
    first_run  = "last_alert_ts" not in meta
    last_ts    = int(meta.get("last_alert_ts", 0))
    last_count = meta.get("last_token_count")
    now_ts     = int(datetime.now().timestamp() * 1000)

    alertas: list[str] = []

    if not first_run:
        # ── Pedidos por WhatsApp ──────────────────────────────────────
        interesados = check_interesados(db, last_ts)
        if interesados:
            productos_str = "\n".join(f"  • {n}" for n in interesados[:10])
            extra = f"\n  _(y {len(interesados)-10} más)_" if len(interesados) > 10 else ""
            alertas.append(
                f"🛒 *{len(interesados)} pedido{'s' if len(interesados) > 1 else ''} via WhatsApp*\n"
                f"{productos_str}{extra}"
            )

        # ── Lista de espera ───────────────────────────────────────────
        espera = check_lista_espera(db, last_ts)
        if espera:
            # Agrupar por producto y contar
            from collections import Counter
            conteo = Counter(espera)
            lineas = "\n".join(f"  • {prod} ({n})" for prod, n in conteo.most_common(8))
            alertas.append(
                f"⏳ *{len(espera)} entrada{'s' if len(espera) > 1 else ''} en lista de espera*\n"
                f"{lineas}"
            )

        # ── Suscriptores push ─────────────────────────────────────────
        total_push, nuevos_push, perdidos_push = check_push_tokens(db, last_ts, last_count)
        if nuevos_push:
            alertas.append(
                f"🔔 *{nuevos_push} nuevo{'s' if nuevos_push > 1 else ''} suscriptor{'es' if nuevos_push > 1 else ''} push*\n"
                f"Total en lista: *{total_push}*"
            )
        if perdidos_push:
            alertas.append(
                f"📉 *{perdidos_push} suscriptor{'es' if perdidos_push > 1 else ''} canceló{'aron' if perdidos_push > 1 else ''} push*\n"
                f"Total en lista: *{total_push}*"
            )
    else:
        # Primera ejecución: obtener total de tokens para referencia futura
        try:
            tokens = db.reference("tokens").get() or {}
            total_push = len(tokens) if isinstance(tokens, dict) else 0
        except Exception:
            total_push = 0
        print("Primera ejecución: estado inicializado.")

    # ── Enviar ────────────────────────────────────────────────────────
    if alertas:
        msg = "⚡ *TiendaMax — Actividad reciente*\n\n" + "\n\n".join(alertas)
        try:
            send_telegram(msg)
            print(f"✅ {len(alertas)} alerta(s) enviada(s) a Telegram.")
        except Exception as e:
            print(f"❌ Error enviando a Telegram: {e}", file=sys.stderr)
            return 1
    else:
        if not first_run:
            print("Sin actividad nueva desde la última revisión.")

    # ── Actualizar estado ─────────────────────────────────────────────
    meta["last_alert_ts"]    = now_ts
    if not first_run:
        meta["last_token_count"] = total_push
    else:
        meta["last_token_count"] = total_push
    meta_ref.set(meta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
