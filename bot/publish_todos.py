#!/usr/bin/env python3
"""
TiendaMax — Publicar TODOS los productos activos en el canal Telegram.
Se lanza manualmente desde GitHub Actions (workflow_dispatch).
"""
import json
import os
import sys
import time
from html import escape as he
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from card_generator import generate_card
    _CARD_ENABLED = True
except Exception:
    _CARD_ENABLED = False

BOT_TOKEN  = os.environ["BOT_TOKEN"]
CHANNEL    = os.environ.get("TELEGRAM_CHANNEL", "@TiendaMaxWeb")
TIENDA_URL = "https://tiendamax.org"
MSG_FILE   = "bot/telegram_messages.json"
DELAY      = 2  # segundos entre mensajes para no saturar


def send_card_bytes(card_bytes: bytes, caption: str) -> int | None:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto",
        data={"chat_id": CHANNEL, "caption": caption, "parse_mode": "HTML"},
        files={"photo": ("card.jpg", card_bytes, "image/jpeg")},
        timeout=30,
    )
    if r.status_code == 200:
        return r.json()["result"]["message_id"]
    print(f"    send_card_bytes error {r.status_code}: {r.text[:200]}", file=sys.stderr)
    return None


def send_photo(photo_url: str, caption: str) -> int | None:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto",
        json={"chat_id": CHANNEL, "photo": photo_url, "caption": caption, "parse_mode": "HTML"},
        timeout=15,
    )
    if r.status_code == 200:
        return r.json()["result"]["message_id"]
    print(f"    send_photo error {r.status_code}: {r.text[:200]}", file=sys.stderr)
    return None


def send_text(text: str) -> int | None:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": CHANNEL, "text": text, "parse_mode": "HTML"},
        timeout=15,
    )
    if r.status_code == 200:
        return r.json()["result"]["message_id"]
    print(f"    send_text error {r.status_code}: {r.text[:200]}", file=sys.stderr)
    return None


def enviar(texto: str, imagen: str = "") -> int | None:
    if imagen and imagen.startswith("http"):
        mid = send_photo(imagen, texto)
        if mid:
            return mid
    return send_text(texto)


def main() -> int:
    try:
        with open("productos.json") as f:
            productos = json.load(f)
        if not isinstance(productos, list):
            productos = []
    except Exception as e:
        print(f"❌ No se pudo leer productos.json: {e}", file=sys.stderr)
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
        pid       = str(p.get("id", ""))
        nombre    = p.get("nombre", "Producto")
        categoria = p.get("categoria", "")
        img       = p.get("imagen") or p.get("foto") or ""
        link      = f"{TIENDA_URL}/p/producto-{pid}.html"

        # HTML parse_mode — escape para evitar errores con caracteres especiales
        lines = [
            f"🛍️ <b>{he(nombre)}</b>",
            f"📦 <i>{he(categoria)}</i>" if categoria else "",
            "",
            f'👉 <a href="{link}">Ver precio en tiendamax.org</a>',
        ]
        caption = "\n".join(l for l in lines if l is not None)

        mid = None
        if _CARD_ENABLED:
            try:
                card_bytes = generate_card(nombre, categoria, img, link)
                if card_bytes:
                    mid = send_card_bytes(card_bytes, caption)
            except Exception as ex:
                print(f"    card error: {ex}", file=sys.stderr)
        if not mid:
            mid = enviar(caption, img)
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
    return 0 if publicados > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
