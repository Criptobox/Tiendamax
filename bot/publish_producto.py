#!/usr/bin/env python3
"""
TiendaMax — Autopublicación en canal Telegram
Detecta productos nuevos comparando con el commit anterior y los publica.
Corre via GitHub Actions cuando cambia products.json o data.json.
"""
import json
import os
import subprocess
import sys
import requests

BOT_TOKEN       = os.environ["BOT_TOKEN"]
CHANNEL         = os.environ.get("TELEGRAM_CHANNEL", "@TiendaMaxWeb")
TIENDA_URL      = "https://tiendamax.org"


def send_telegram_photo(photo_url: str, caption: str) -> bool:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto",
        json={"chat_id": CHANNEL, "photo": photo_url, "caption": caption, "parse_mode": "Markdown"},
        timeout=15,
    )
    return r.status_code == 200


def send_telegram_text(text: str) -> bool:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": CHANNEL, "text": text, "parse_mode": "Markdown", "disable_web_page_preview": False},
        timeout=15,
    )
    return r.status_code == 200


def get_previous_products() -> dict:
    """Lee products.json del commit anterior para detectar novedades."""
    try:
        result = subprocess.run(
            ["git", "show", "HEAD~1:products.json"],
            capture_output=True, text=True, check=True
        )
        data = json.loads(result.stdout)
        if isinstance(data, list):
            return {str(p.get("id")): p for p in data if isinstance(p, dict)}
        return {}
    except Exception:
        return {}


def get_current_products() -> list:
    """Lee products.json del working tree actual."""
    try:
        with open("products.json") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [p for p in data if isinstance(p, dict)]
        return []
    except Exception:
        return []


def format_precio(precio) -> str:
    try:
        p = float(precio)
        return f"${p:.2f} USD" if p > 0 else ""
    except Exception:
        return str(precio) if precio else ""


def build_producto_link(producto: dict) -> str:
    pid = producto.get("id", "")
    nombre = producto.get("nombre", "").lower().replace(" ", "-")
    return f"{TIENDA_URL}/p/producto-{pid}.html"


def publicar_producto(p: dict) -> bool:
    nombre   = p.get("nombre", "Producto nuevo")
    precio   = format_precio(p.get("precioActual") or p.get("precio", ""))
    precio_o = format_precio(p.get("precioOriginal", ""))
    cat      = p.get("categoria", "")
    desc     = p.get("descripcion", "")[:120]
    img      = p.get("imagen") or p.get("foto") or ""
    link     = build_producto_link(p)

    descuento = ""
    try:
        pa = float(p.get("precioActual") or 0)
        po = float(p.get("precioOriginal") or 0)
        if po > pa > 0:
            pct = round((po - pa) / po * 100)
            descuento = f"🏷️ *-{pct}% de descuento* (antes {precio_o})\n"
    except Exception:
        pass

    lines = [
        f"🛍️ *{nombre}*",
        f"💰 *{precio}*" if precio else "",
        descuento,
        f"📦 {cat}" if cat else "",
        f"_{desc}…_" if desc else "",
        "",
        f"👉 [Ver en tienda]({link})",
        f"📲 [Pedir por WhatsApp]({TIENDA_URL})",
    ]
    caption = "\n".join(l for l in lines if l is not None)

    if img and img.startswith("http"):
        ok = send_telegram_photo(img, caption)
        if ok:
            return True

    return send_telegram_text(caption)


def main() -> int:
    current  = get_current_products()
    previous = get_previous_products()

    nuevos = [p for p in current if str(p.get("id")) not in previous]

    if not nuevos:
        print("ℹ️  Sin productos nuevos — nada que publicar.")
        return 0

    print(f"📢 {len(nuevos)} producto(s) nuevo(s) detectado(s).")
    errores = 0
    for p in nuevos[:5]:  # máximo 5 por push para no saturar
        nombre = p.get("nombre", str(p.get("id")))
        ok = publicar_producto(p)
        if ok:
            print(f"  ✅ Publicado: {nombre}")
        else:
            print(f"  ❌ Error publicando: {nombre}", file=sys.stderr)
            errores += 1

    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
