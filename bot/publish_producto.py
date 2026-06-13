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

BOT_TOKEN   = os.environ["BOT_TOKEN"]
CHANNEL     = os.environ.get("TELEGRAM_CHANNEL", "@TiendaMaxWeb")
TIENDA_URL  = "https://tiendamax.org"
TZ          = ZoneInfo("America/Havana")


# ── Helpers de Telegram ─────────────────────────────────────────────────────

def send_photo(photo_url: str, caption: str) -> bool:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto",
        json={"chat_id": CHANNEL, "photo": photo_url, "caption": caption, "parse_mode": "Markdown"},
        timeout=15,
    )
    return r.status_code == 200


def send_text(text: str) -> bool:
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": CHANNEL, "text": text, "parse_mode": "Markdown"},
        timeout=15,
    )
    return r.status_code == 200


def enviar(texto: str, imagen: str = "") -> bool:
    if imagen and imagen.startswith("http"):
        ok = send_photo(imagen, texto)
        if ok:
            return True
    return send_text(texto)


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

    prev_cfg = json.loads(prev_config_raw) if prev_config_raw else {}

    publicados = 0
    errores    = 0

    # ── 1. Productos nuevos ──────────────────────────────────────────────────
    nuevos = [p for pid, p in curr_dict.items() if pid not in prev_dict]
    for p in nuevos[:3]:
        img  = p.get("imagen") or p.get("foto") or ""
        text = msg_nuevo(p)
        ok   = enviar(text, img)
        nombre = p.get("nombre", str(p.get("id")))
        if ok:
            print(f"  ✅ Nuevo: {nombre}")
            publicados += 1
        else:
            print(f"  ❌ Error publicando nuevo: {nombre}", file=sys.stderr)
            errores += 1

    # ── 2. Rebajas de precio ─────────────────────────────────────────────────
    for pid, p_curr in curr_dict.items():
        if pid not in prev_dict:
            continue  # ya tratado como nuevo
        p_prev = prev_dict[pid]
        try:
            pa_curr = float(p_curr.get("precioActual") or 0)
            pa_prev = float(p_prev.get("precioActual") or 0)
            if pa_prev > 0 and pa_curr > 0 and pa_curr < pa_prev:
                text, img = msg_rebaja(p_curr, pa_prev)
                ok = enviar(text, img)
                nombre = p_curr.get("nombre", pid)
                if ok:
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
            texto_oferta = curr_config.get("ofertaDiaTexto") or ""
            text, img = msg_oferta_dia(p, texto_oferta)
            ok = enviar(text, img)
            nombre = p.get("nombre", oferta_id_curr)
            if ok:
                print(f"  ✅ Oferta del día: {nombre}")
                publicados += 1
            else:
                print(f"  ❌ Error publicando oferta del día", file=sys.stderr)
                errores += 1

    if publicados == 0 and errores == 0:
        print("ℹ️  Sin eventos nuevos para publicar en el canal.")

    return 1 if errores > 0 and publicados == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
