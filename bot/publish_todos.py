#!/usr/bin/env python3
"""
TiendaMax — Publicar TODOS los productos activos en el canal Telegram.
Se lanza manualmente desde GitHub Actions (workflow_dispatch).
"""
import json
import os
import sys
import time
import requests

BOT_TOKEN  = os.environ["BOT_TOKEN"]
CHANNEL    = os.environ.get("TELEGRAM_CHANNEL", "@TiendaMaxWeb")
TIENDA_URL = "https://tiendamax.org"
MSG_FILE   = "bot/telegram_messages.json"
DELAY      = 2  # segundos entre mensajes para no saturar


def send_photo(photo_url: str, caption: str) -> int | None:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto",
        json={"chat_id": CHANNEL, "photo": photo_url, "caption": caption, "parse_mode": "Markdown"},
        timeout=15,
    )
    if r.status_code == 200:
        return r.json()["result"]["message_id"]
    return None


def send_text(text: str) -> int | None:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": CHANNEL, "text": text, "parse_mode": "Markdown"},
        timeout=15,
    )
    if r.status_code == 200:
        return r.json()["result"]["message_id"]
    return None


def enviar(texto: str, imagen: str = "") -> int | None:
    if imagen and imagen.startswith("http"):
        mid = send_photo(imagen, texto)
        if mid:
            return mid
    return send_text(texto)


def precio_fmt(v) -> str:
    try:
        p = float(v)
        return f"${p:.2f} USD" if p > 0 else ""
    except Exception:
        return str(v) if v else ""


def main() -> int:
    try:
        with open("products.json") as f:
            productos = json.load(f)
        if not isinstance(productos, list):
            productos = []
    except Exception as e:
        print(f"❌ No se pudo leer products.json: {e}", file=sys.stderr)
        return 1

    try:
        with open(MSG_FILE) as f:
            msg_ids = json.load(f)
    except Exception:
        msg_ids = {}

    activos = [p for p in productos if isinstance(p, dict) and int(p.get("stock", 0)) > 0]
    print(f"📢 Publicando {len(activos)} productos activos en {CHANNEL}...")

    publicados = 0
    for p in activos:
        pid     = str(p.get("id", ""))
        nombre  = p.get("nombre", "Producto")
        precio  = precio_fmt(p.get("precioActual") or p.get("precio"))
        cat     = p.get("categoria", "")
        img     = p.get("imagen") or p.get("foto") or ""
        link    = f"{TIENDA_URL}/p/producto-{pid}.html"

        try:
            pa = float(p.get("precioActual") or 0)
            po = float(p.get("precioOriginal") or 0)
            pct = round((po-pa)/po*100) if po > pa > 0 else 0
        except Exception:
            pct = 0

        lines = [
            f"🛍️ *{nombre}*",
            f"💰 *{precio}*" if precio else "",
            f"🏷️ *-{pct}% descuento*" if pct >= 5 else "",
            f"📦 _{cat}_" if cat else "",
            "",
            f"👉 [Ver en tienda]({link})",
        ]
        texto = "\n".join(l for l in lines if l is not None)

        mid = enviar(texto, img)
        if mid:
            msg_ids[pid] = mid
            print(f"  ✅ {nombre}")
            publicados += 1
        else:
            print(f"  ❌ Error: {nombre}", file=sys.stderr)

        time.sleep(DELAY)

    with open(MSG_FILE, "w") as f:
        json.dump(msg_ids, f, indent=2)

    print(f"\n✅ {publicados}/{len(activos)} productos publicados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
