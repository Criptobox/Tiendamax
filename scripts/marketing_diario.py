#!/usr/bin/env python3
"""
TiendaMax — Agente de marketing diario (Telegram)

Cada mañana arma el "pack del día" y se lo manda al admin por Telegram,
listo para reenviar en 2 toques:

1. PACK DEL DÍA — 3 productos CON stock, rotando el catálogo completo de
   forma determinista por fecha (día N muestra unos, día N+1 los
   siguientes; todo el catálogo cicla sin repetir seguido y sin necesidad
   de guardar estado). Cada producto va como foto + texto de venta listo
   (precio USD y MN, escasez si aplica, link a su página /p/ y hashtags)
   para reenviar directo a WhatsApp Estados o grupos de Facebook.

2. CHECKLIST REVOLICO — lista de qué anuncios renovar hoy (productos en
   stock) y cuáles NO renovar (agotados), para no pagar/renovar anuncios
   de cosas que no hay.

Por qué no publica solo: WhatsApp no tiene API de Estados, la API de
grupos de Facebook fue eliminada, y Revolico no tiene API — automatizar
esas cuentas con bots/navegador arriesga baneo del número/cuenta del
negocio. Este agente elimina el 90% del trabajo (elegir, redactar,
diseñar, decidir) y deja solo el reenvío manual, que es seguro.

Corre a diario vía GitHub Actions (marketing-diario.yml). Sin estado:
la rotación es una función pura de la fecha y el catálogo.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("America/Havana")
SITE = "https://tiendamax.org"
PACK_SIZE = 3
MAX_LISTA_REVOLICO = 15


def cargar_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def limpiar(s) -> str:
    # quita el zero-width space que traen varios nombres del catálogo
    return str(s or "").replace("​", "").strip()


def productos_activos(productos: list[dict]) -> list[dict]:
    return [p for p in productos if p.get("activo") is not False]


def con_stock(productos: list[dict]) -> list[dict]:
    return [p for p in productos_activos(productos) if int(p.get("stock") or 0) > 0]


def seleccionar_pack(productos: list[dict], fecha: datetime, n: int = PACK_SIZE) -> list[dict]:
    """
    Rotación determinista: ordena los productos en stock por id y toma una
    ventana que avanza n posiciones por día. Sin estado, idempotente, y
    todo el catálogo cicla completo antes de repetir.
    """
    disponibles = sorted(con_stock(productos), key=lambda p: str(p.get("id")))
    if not disponibles:
        return []
    dia = fecha.toordinal()
    start = (dia * n) % len(disponibles)
    pack = [disponibles[(start + i) % len(disponibles)] for i in range(min(n, len(disponibles)))]
    # sin duplicados si el catálogo es más chico que n
    vistos, unicos = set(), []
    for p in pack:
        pid = str(p.get("id"))
        if pid not in vistos:
            vistos.add(pid)
            unicos.append(p)
    return unicos


def tasa_mn(config: dict) -> int:
    try:
        tasa = float(config.get("tasaMN") or 0)
        margen = float(config.get("margenMN", 10) or 0)
        return int(round(tasa + margen)) if tasa > 0 else 0
    except Exception:
        return 0


def imagen_absoluta(p: dict) -> str:
    img = ""
    if isinstance(p.get("imagenes"), list) and p["imagenes"]:
        img = str(p["imagenes"][0] or "")
    if not img:
        img = str(p.get("imagen") or "")
    img = img.strip()
    if img.startswith("http"):
        return img
    if img:
        return f"{SITE}/{img.lstrip('/')}"
    return ""


def hashtag(s: str) -> str:
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", limpiar(s)).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^A-Za-z0-9]", "", s)
    return s


def armar_caption(p: dict, tasa: int) -> str:
    nombre = limpiar(p.get("nombre")) or "Producto TiendaMax"
    precio = float(p.get("precioActual") or 0)
    precio_orig = float(p.get("precioOriginal") or 0)
    stock = int(p.get("stock") or 0)
    cat = limpiar(p.get("categoria"))

    lineas = [f"🔥 {nombre}", ""]
    precio_txt = f"💵 ${precio:.2f} USD"
    if tasa > 0:
        precio_txt += f"  ·  ${round(precio * tasa):,} MN".replace(",", " ")
    lineas.append(precio_txt)
    if precio_orig > precio > 0:
        pct = round((1 - precio / precio_orig) * 100)
        lineas.append(f"🏷️ Antes ${precio_orig:.2f} — ¡{pct}% de rebaja!")
    if 0 < stock <= 3:
        lineas.append(f"⚡ ¡Últimas {stock} unidades!")
    lineas += [
        "✅ Garantía · Pago contra entrega · Envíos",
        "",
        "📲 Pídelo directo por WhatsApp:",
        f"🌐 {SITE}/p/producto-{p.get('id')}.html",
        "",
    ]
    tags = ["#TiendaMax", "#Cuba", "#OfertasCuba"]
    ct = hashtag(cat)
    if ct:
        tags.append("#" + ct.capitalize())
    lineas.append(" ".join(tags))
    return "\n".join(lineas)


def listas_revolico(productos: list[dict]) -> tuple[list[str], list[str]]:
    activos = productos_activos(productos)
    renovar = [limpiar(p.get("nombre")) for p in activos if int(p.get("stock") or 0) > 0]
    no_renovar = [limpiar(p.get("nombre")) for p in activos if int(p.get("stock") or 0) <= 0]
    return renovar, no_renovar


def mensaje_revolico(productos: list[dict]) -> str:
    renovar, no_renovar = listas_revolico(productos)
    partes = ["📡 CHECKLIST REVOLICO — hoy", ""]
    partes.append(f"✅ Renovar (en stock, {len(renovar)}):")
    for nm in renovar[:MAX_LISTA_REVOLICO]:
        partes.append(f"  • {nm}")
    if len(renovar) > MAX_LISTA_REVOLICO:
        partes.append(f"  … y {len(renovar) - MAX_LISTA_REVOLICO} más")
    partes.append("")
    partes.append(f"⛔ NO renovar (agotados, {len(no_renovar)}):")
    for nm in no_renovar[:MAX_LISTA_REVOLICO]:
        partes.append(f"  • {nm}")
    if len(no_renovar) > MAX_LISTA_REVOLICO:
        partes.append(f"  … y {len(no_renovar) - MAX_LISTA_REVOLICO} más")
    return "\n".join(partes)


def tg(metodo: str, payload: dict) -> bool:
    token = os.environ["BOT_TOKEN"]
    r = requests.post(f"https://api.telegram.org/bot{token}/{metodo}", json=payload, timeout=20)
    if not r.ok:
        print(f"  Telegram {metodo} HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
    return r.ok


def main() -> int:
    chat = os.environ["ADMIN_CHAT_ID"]
    productos = cargar_json(ROOT / "productos.json", [])
    config = cargar_json(ROOT / "config.json", {})
    if not isinstance(productos, list) or not productos:
        print("❌ productos.json vacío o ilegible", file=sys.stderr)
        return 1

    hoy = datetime.now(TZ)
    tasa = tasa_mn(config)
    pack = seleccionar_pack(productos, hoy)

    fecha_txt = hoy.strftime("%d/%m")
    tg("sendMessage", {
        "chat_id": chat,
        "text": (
            f"☀️ Pack de marketing — {fecha_txt}\n\n"
            f"{len(pack)} producto(s) de hoy, listos para reenviar a WhatsApp "
            f"Estados y grupos de Facebook (mantén pulsado → Reenviar / Copiar). "
            f"Mañana toca otro grupo del catálogo, se rota solo."
        ),
    })

    enviados = 0
    for p in pack:
        caption = armar_caption(p, tasa)
        img = imagen_absoluta(p)
        ok = False
        if img:
            ok = tg("sendPhoto", {"chat_id": chat, "photo": img, "caption": caption[:1024]})
        if not ok:
            ok = tg("sendMessage", {"chat_id": chat, "text": caption[:3900]})
        if ok:
            enviados += 1

    tg("sendMessage", {"chat_id": chat, "text": mensaje_revolico(productos)[:3900]})

    print(f"✅ Pack enviado: {enviados}/{len(pack)} productos + checklist Revolico.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
