#!/usr/bin/env python3
"""
TiendaMax — Reporte diario 9 PM (hora Cuba)
Resumen del día: ventas, suscriptores, reseñas, interesados, avísame.
Corre via GitHub Actions (telegram-daily-report.yml).
"""
import json
import os
import sys
from datetime import datetime

import requests
from zoneinfo import ZoneInfo

TZ           = ZoneInfo("America/Havana")
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

    now      = datetime.now(TZ)
    hoy_str  = now.strftime("%d/%m/%Y")
    # Inicio del día en ms para comparar timestamps de cliente
    hoy_inicio_ms = int(now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)

    lines = [f"📊 *Reporte TiendaMax — {hoy_str}*", ""]

    # ── 1. Ventas del día ──────────────────────────────────────────────────
    try:
        ventas_raw  = db.reference("ventas").get() or {}
        ventas      = list(ventas_raw.values()) if isinstance(ventas_raw, dict) else []
        ventas_hoy  = [v for v in ventas if isinstance(v, dict) and v.get("fecha") == hoy_str]
        total_usd   = sum(v.get("total", 0) for v in ventas_hoy)
        lines.append(f"🛒 Ventas: *{len(ventas_hoy)}* · ${total_usd:.2f} USD")

        if ventas_hoy:
            conteo: dict[str, int] = {}
            for v in ventas_hoy:
                n = v.get("producto", "?")
                conteo[n] = conteo.get(n, 0) + v.get("cantidad", 1)
            for nom, cant in sorted(conteo.items(), key=lambda x: x[1], reverse=True)[:3]:
                lines.append(f"   • {nom[:35]} × {cant}")
    except Exception as e:
        lines.append(f"🛒 Ventas: error — {e}")

    # ── 2. Suscriptores push ───────────────────────────────────────────────
    try:
        tokens      = db.reference("tokens").get() or {}
        total_subs  = len(tokens) if isinstance(tokens, dict) else 0
        nuevos_hoy  = sum(
            1 for v in tokens.values()
            if isinstance(v, dict) and int(v.get("timestamp", 0)) >= hoy_inicio_ms
        )
        nuevos_str  = f" _(+{nuevos_hoy} hoy)_" if nuevos_hoy else ""
        lines.append(f"🔔 Suscriptores push: *{total_subs}*{nuevos_str}")
    except Exception as e:
        lines.append(f"🔔 Suscriptores: error — {e}")

    # ── 3. Reseñas del día ─────────────────────────────────────────────────
    try:
        resenas_raw = db.reference("resenas").get() or {}
        resenas_hoy = sum(
            1
            for prod_rs in resenas_raw.values() if isinstance(prod_rs, dict)
            for r in prod_rs.values()
            if isinstance(r, dict) and r.get("fecha") == hoy_str
        )
        if resenas_hoy:
            lines.append(f"⭐ Reseñas hoy: *{resenas_hoy}*")
    except Exception:
        pass

    # ── 4. Interesados del día ─────────────────────────────────────────────
    try:
        interesados_raw = db.reference("interesados").get() or {}
        prods_int: list[str] = []
        for entries in interesados_raw.values():
            if isinstance(entries, dict):
                for entry in entries.values():
                    if isinstance(entry, dict) and int(entry.get("ts", 0)) >= hoy_inicio_ms:
                        prods_int.append(str(entry.get("producto", "?"))[:30])
        if prods_int:
            prods_str = ", ".join(prods_int[:4]) + (" …" if len(prods_int) > 4 else "")
            lines.append(f"📋 Interesados hoy: *{len(prods_int)}* — {prods_str}")
    except Exception:
        pass

    # ── 5. "Avísame cuando vuelva" del día ────────────────────────────────
    try:
        avisos_raw = db.reference("avisos_stock").get() or {}
        prods_av: list[str] = []
        for prod_id, entries in avisos_raw.items():
            if isinstance(entries, dict):
                for entry in entries.values():
                    if isinstance(entry, dict) and int(entry.get("timestamp", 0)) >= hoy_inicio_ms:
                        prods_av.append(str(prod_id))
        if prods_av:
            prods_str = ", ".join(sorted(set(prods_av))[:4]) + (" …" if len(prods_av) > 4 else "")
            lines.append(f"🔁 Avísame cuando vuelva: *{len(prods_av)}* — {prods_str}")
    except Exception:
        pass

    try:
        send_telegram("\n".join(lines))
        print("✅ Reporte diario enviado.")
    except Exception as e:
        print(f"❌ Error Telegram: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
