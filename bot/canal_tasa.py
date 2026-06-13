#!/usr/bin/env python3
"""
TiendaMax — Publica la tasa del día en el canal Telegram.
Lee tasaMN de config.json y suma +10 para la tasa cliente.
"""
import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
import requests

BOT_TOKEN = os.environ["BOT_TOKEN"]
CHANNEL   = os.environ.get("TELEGRAM_CHANNEL", "@TiendaMaxWeb")
TZ        = ZoneInfo("America/Havana")


def send(text: str) -> bool:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": CHANNEL, "text": text, "parse_mode": "Markdown"},
        timeout=10,
    )
    return r.status_code == 200


def main() -> int:
    try:
        with open("config.json") as f:
            cfg = json.load(f)
    except Exception as e:
        print(f"❌ No se pudo leer config.json: {e}", file=sys.stderr)
        return 1

    tasa_base = float(cfg.get("tasaMN") or 0)
    if tasa_base <= 0:
        print("❌ tasaMN no disponible.", file=sys.stderr)
        return 1

    tasa_cliente = tasa_base + 10
    hoy = datetime.now(TZ).strftime("%d/%m/%Y")

    mensaje = (
        f"📈 *Tasa del día — {hoy}*\n\n"
        f"💵 *1 USD = {tasa_cliente:.0f} CUP*\n"
        f"_(Fuente: elTOQUE · actualizado hoy)_\n\n"
        f"🛍️ Visita nuestra tienda: tiendamax.org"
    )

    if send(mensaje):
        print(f"✅ Tasa publicada en canal: 1 USD = {tasa_cliente:.0f} CUP")
        return 0
    else:
        print("❌ Error enviando la tasa al canal.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
