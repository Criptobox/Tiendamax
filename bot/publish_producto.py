#!/usr/bin/env python3
"""
TiendaMax — Autopublicación en canal Telegram.
Detecta y publica:
  1. Productos nuevos
  2. Rebajas de precio (precioActual bajó)
  3. Oferta del día (ofertaDiaId cambió en config.json)
  4. Productos en oferta por tiempo limitado (tienen precioOriginal > precioActual)
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from card_generator import generate_card
    _CARD_ENABLED = True
except Exception:
    _CARD_ENABLED = False

BOT_TOKEN   = os.environ["BOT_TOKEN"]
CHANNEL     = os.environ.get("TELEGRAM_CHANNEL", "@TiendaMaxWeb")
TIENDA_URL  = "https://tiendamax.org"
TZ          = ZoneInfo("America/Havana")
MSG_FILE    = "bot/telegram_messages.json"


# ── Helpers de Telegram ─────────────────────────────────────────────────────

def load_msg_ids() -> dict:
    try:
        with open(MSG_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_msg_ids(ids: dict):
    with open(MSG_FILE, "w") as f:
        json.dump(ids, f, indent=2)


def delete_message(message_id: int) -> bool:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/deleteMessage",
        json={"chat_id": CHANNEL, "message_id": message_id},
        timeout=10,
    )
    return r.status_code == 200


def send_card_bytes(card_bytes: bytes, caption: str) -> int | None:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto",
        data={"chat_id": CHANNEL, "caption": caption, "parse_mode": "Markdown"},
        files={"photo": ("card.png", card_bytes, "image/png")},
        timeout=30,
    )
    if r.status_code == 200:
        return r.json()["result"]["message_id"]
    return None


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


def enviar_card(p: dict, caption: str) -> int | None:
    """Generate branded card image and send; falls back to plain photo/text."""
    if _CARD_ENABLED:
        nombre   = p.get("nombre", "")
        categoria = p.get("categoria", "")
        img_url  = p.get("imagen") or p.get("foto") or ""
        link     = link_producto(p)
        try:
            card_bytes = generate_card(nombre, categoria, img_url, link)
            if card_bytes:
                mid = send_card_bytes(card_bytes, caption)
                if mid:
                    return mid
        except Exception:
            pass
    # fallback
    return enviar(caption, p.get("imagen") or p.get("foto") or "")


# ── Helpers de datos ─────────────────────────────────────────────────────────

def precio_fmt(v) -> str:
    try:
        p = float(v)
        return f"${p:.2f} USD" if p > 0 else ""
    except Exception:
        return str(v) if v else ""


def descuento_pct(pa, po) -> int:
    try:
        pa, po = float(pa), float(po)
        if po > pa > 0:
            return round((po - pa) / po * 100)
    except Exception:
        pass
    return 0


def link_producto(p: dict) -> str:
    return f"{TIENDA_URL}/p/producto-{p.get('id','')}.html"


def git_show(path: str, ref: str = "HEAD~1") -> str:
    try:
        r = subprocess.run(
            ["git", "show", f"{ref}:{path}"],
            capture_output=True, text=True, check=True
        )
        return r.stdout
    except Exception:
        return ""


def cargar_json_file(path: str) -> dict | list:
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def productos_dict(data) -> dict:
    if isinstance(data, list):
        return {str(p.get("id")): p for p in data if isinstance(p, dict)}
    return {}


# ── Caption minimalista para tarjetas (sin precio, fuerza visita a la tienda) ─

def caption_card(p: dict, badge: str) -> str:
    nombre = p.get("nombre", "Producto")
    cat    = p.get("categoria", "")
    link   = link_producto(p)
    lines  = [
        f"{badge}",
        f"🛍️ *{nombre}*",
        f"📦 _{cat}_" if cat else "",
        "",
        f"👉 [Ver precio en tiendamax.org]({link})",
    ]
    return "\n".join(l for l in lines if l is not None)


# ── Mensajes por tipo de evento ──────────────────────────────────────────────

def msg_nuevo(p: dict) -> str:
    nombre = p.get("nombre", "Producto nuevo")
    precio = precio_fmt(p.get("precioActual") or p.get("precio"))
    cat    = p.get("categoria", "")
    desc   = (p.get("descripcion") or "")[:100]
    pct    = descuento_pct(p.get("precioActual"), p.get("precioOriginal"))
    link   = link_producto(p)

    lines = [
        f"🆕 *Nuevo producto disponible*\n",
        f"🛍️ *{nombre}*",
        f"💰 *{precio}*" if precio else "",
        f"🏷️ *-{pct}% descuento*" if pct >= 5 else "",
        f"📦 _{cat}_" if cat else "",
        f"_{desc}…_" if desc else "",
        "",
        f"👉 [Ver producto]({link})",
    ]
    return "\n".join(l for l in lines if l is not None)


def msg_rebaja(p: dict, precio_anterior: float) -> str:
    nombre   = p.get("nombre", "Producto")
    precio_n = precio_fmt(p.get("precioActual"))
    precio_v = precio_fmt(precio_anterior)
    pct      = descuento_pct(p.get("precioActual"), precio_anterior)
    link     = link_producto(p)
    img      = p.get("imagen") or p.get("foto") or ""

    lines = [
        f"🔥 *¡Bajó el precio!*\n",
        f"🛍️ *{nombre}*",
        f"💰 *{precio_n}* ~~{precio_v}~~" if precio_v else f"💰 *{precio_n}*",
        f"⬇️ *-{pct}% más barato*" if pct >= 1 else "",
        "",
        f"👉 [Comprar ahora]({link})",
    ]
    return "\n".join(l for l in lines if l is not None), img


def msg_oferta_dia(p: dict, texto_oferta: str = "") -> str:
    nombre = p.get("nombre", "Producto")
    precio = precio_fmt(p.get("precioActual") or p.get("precio"))
    pct    = descuento_pct(p.get("precioActual"), p.get("precioOriginal"))
    link   = link_producto(p)
    img    = p.get("imagen") or p.get("foto") or ""

    subtitulo = texto_oferta or "Oferta especial por tiempo limitado"

    lines = [
        f"🔥 *¡OFERTA DEL DÍA!*\n",
        f"🛍️ *{nombre}*",
        f"_{subtitulo}_" if subtitulo else "",
        f"💰 *{precio}*" if precio else "",
        f"🏷️ *-{pct}% de descuento*" if pct >= 5 else "",
        "",
        f"⏰ Oferta por tiempo limitado",
        f"👉 [Ver oferta]({link})",
    ]
    return "\n".join(l for l in lines if l is not None), img


# ── Lógica principal ─────────────────────────────────────────────────────────

def main() -> int:
    prev_prods_raw  = git_show("products.json")
    prev_config_raw = git_show("config.json")

    curr_prods  = cargar_json_file("products.json")
    curr_config = cargar_json_file("config.json")

    curr_dict = productos_dict(curr_prods)
    prev_dict = productos_dict(json.loads(prev_prods_raw) if prev_prods_raw else [])
    prev_cfg  = json.loads(prev_config_raw) if prev_config_raw else {}

    msg_ids   = load_msg_ids()
    publicados = 0
    errores    = 0

    # ── 0. Productos agotados → eliminar mensaje del canal ───────────────────
    for pid, p_prev in prev_dict.items():
        p_curr = curr_dict.get(pid)
        if not p_curr:
            continue
        prev_stock = int(p_prev.get("stock", 1))
        curr_stock = int(p_curr.get("stock", 1))
        if prev_stock > 0 and curr_stock == 0 and pid in msg_ids:
            deleted = delete_message(msg_ids[pid])
            nombre  = p_curr.get("nombre", pid)
            if deleted:
                print(f"  🗑️ Eliminado (agotado): {nombre}")
                del msg_ids[pid]
            else:
                print(f"  ⚠️ No se pudo eliminar mensaje de: {nombre}")

    # ── 1. Productos nuevos ──────────────────────────────────────────────────
    nuevos = [p for pid, p in curr_dict.items() if pid not in prev_dict]
    for p in nuevos[:3]:
        cap    = caption_card(p, "🆕 *Nuevo producto disponible*")
        mid    = enviar_card(p, cap)
        pid    = str(p.get("id"))
        nombre = p.get("nombre", pid)
        if mid:
            msg_ids[pid] = mid
            print(f"  ✅ Nuevo: {nombre}")
            publicados += 1
        else:
            print(f"  ❌ Error publicando nuevo: {nombre}", file=sys.stderr)
            errores += 1

    # ── 2. Rebajas de precio ─────────────────────────────────────────────────
    for pid, p_curr in curr_dict.items():
        if pid not in prev_dict:
            continue
        p_prev = prev_dict[pid]
        try:
            pa_curr = float(p_curr.get("precioActual") or 0)
            pa_prev = float(p_prev.get("precioActual") or 0)
            if pa_prev > 0 and pa_curr > 0 and pa_curr < pa_prev:
                pct = descuento_pct(pa_curr, pa_prev)
                badge = f"🔥 *¡Bajó el precio!*{f' (-{pct}%)' if pct >= 1 else ''}"
                cap  = caption_card(p_curr, badge)
                mid  = enviar_card(p_curr, cap)
                nombre = p_curr.get("nombre", pid)
                if mid:
                    msg_ids[pid] = mid
                    print(f"  ✅ Rebaja: {nombre} ({pa_prev}→{pa_curr})")
                    publicados += 1
                else:
                    print(f"  ❌ Error publicando rebaja: {nombre}", file=sys.stderr)
                    errores += 1
        except Exception:
            pass

    # ── 3. Oferta del día (cambió ofertaDiaId) ───────────────────────────────
    oferta_id_curr = str(curr_config.get("ofertaDiaId") or "")
    oferta_id_prev = str(prev_cfg.get("ofertaDiaId") or "")
    if oferta_id_curr and oferta_id_curr != oferta_id_prev:
        p = curr_dict.get(oferta_id_curr)
        if p:
            texto_oferta = curr_config.get("ofertaDiaTexto") or "Oferta especial por tiempo limitado"
            cap  = caption_card(p, f"🔥 *¡OFERTA DEL DÍA!*\n_{texto_oferta}_")
            mid  = enviar_card(p, cap)
            nombre = p.get("nombre", oferta_id_curr)
            if mid:
                msg_ids[oferta_id_curr] = mid
                print(f"  ✅ Oferta del día: {nombre}")
                publicados += 1
            else:
                print(f"  ❌ Error publicando oferta del día", file=sys.stderr)
                errores += 1

    save_msg_ids(msg_ids)

    if publicados == 0 and errores == 0:
        print("ℹ️  Sin eventos nuevos para publicar en el canal.")

    return 1 if errores > 0 and publicados == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
