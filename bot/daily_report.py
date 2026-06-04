#!/usr/bin/env python3
"""
Envía el reporte diario al admin de TiendaMax por Telegram.
Diseñado para correr en GitHub Actions (cron diario).
No necesita el bot corriendo — usa la API de Telegram directamente.
"""
import os, json, asyncio, base64
from datetime import datetime, date
from zoneinfo import ZoneInfo
import httpx

BOT_TOKEN    = os.environ["BOT_TOKEN"]
ADMIN_ID     = int(os.environ["ADMIN_CHAT_ID"])
FIREBASE_URL = os.environ["FIREBASE_URL"].rstrip("/")
GH_TOKEN     = os.environ["GITHUB_TOKEN"]
GH_REPO      = os.environ.get("GITHUB_REPO", "criptobox/tiendamax")
TZ           = ZoneInfo("America/Havana")


async def fb_get(path: str):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{FIREBASE_URL}/{path}.json")
        r.raise_for_status()
        return r.json()

async def gh_get_file(path: str):
    url = f"https://api.github.com/repos/{GH_REPO}/contents/{path}"
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(url, headers={"Authorization": f"token {GH_TOKEN}"})
        r.raise_for_status()
        data = r.json()
    return json.loads(base64.b64decode(data["content"]).decode())

async def send_telegram(text: str):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(url, json={
            "chat_id": ADMIN_ID,
            "text": text,
            "parse_mode": "Markdown",
        })
        r.raise_for_status()

async def main():
    hoy = date.today().strftime("%d/%m/%Y")
    now = datetime.now(TZ)

    try:
        ventas_raw = await fb_get("ventas") or {}
        vistas_raw = await fb_get("analytics/vistas") or {}
        wa_raw     = await fb_get("analytics/whatsapp") or {}
    except Exception as e:
        await send_telegram(f"❌ Reporte diario: error leyendo Firebase — {e}")
        return

    ventas = list(ventas_raw.values()) if isinstance(ventas_raw, dict) else []
    ventas_hoy = [v for v in ventas if v.get("fecha") == hoy]
    def _fecha_en_mes(fecha_str: str, año: int, mes: int) -> bool:
        try:
            d = datetime.strptime(fecha_str, "%d/%m/%Y")
            return d.year == año and d.month == mes
        except ValueError:
            return False

    ventas_mes = [v for v in ventas if _fecha_en_mes(v.get("fecha", ""), now.year, now.month)]

    def _sum(vs): return sum(v.get("total", 0) for v in vs)
    def _cnt(raw): return sum(
        (v.get("count") if isinstance(v, dict) else v) or 0
        for v in raw.values()
    ) if isinstance(raw, dict) else 0

    total_vistas = _cnt(vistas_raw)
    total_wa     = _cnt(wa_raw)
    conversion   = f"{total_wa/total_vistas*100:.1f}%" if total_vistas else "—"

    # Top 3
    conteo: dict[str, int] = {}
    for v in ventas:
        n = v.get("producto", "?")
        conteo[n] = conteo.get(n, 0) + v.get("cantidad", 1)
    top3 = sorted(conteo.items(), key=lambda x: x[1], reverse=True)[:3]

    lines = [
        f"☀️ *Reporte diario — {hoy}*",
        "",
        f"🛒 Ventas hoy:  {len(ventas_hoy)} · *${_sum(ventas_hoy):.2f} USD*",
        f"📅 Ventas mes:  {len(ventas_mes)} · *${_sum(ventas_mes):.2f} USD*",
        "",
        f"👁️ Vistas:      {total_vistas:,}",
        f"💬 WhatsApp:   {total_wa:,}",
        f"📈 Conversión:  {conversion}",
    ]

    if top3:
        lines += ["", "🏆 *Más vendidos:*"]
        for i, (nom, cant) in enumerate(top3, 1):
            lines.append(f"  {i}. {nom[:40]} — {cant} uds")

    # Stock
    try:
        prods = await gh_get_file("productos.json")
        if isinstance(prods, list):
            sin_stock  = [p["nombre"] for p in prods if int(p.get("stock", 0)) == 0]
            stock_bajo = [p for p in prods if 0 < int(p.get("stock", 0)) <= 3]
            if sin_stock:
                lines += ["", f"🚫 *Sin stock ({len(sin_stock)}):* " +
                          ", ".join(sin_stock[:5]) + (" …" if len(sin_stock) > 5 else "")]
            if stock_bajo:
                lines += ["⚠️ *Stock bajo:* " +
                          ", ".join(f"{p['nombre']} ({p['stock']})" for p in stock_bajo[:4])]
    except Exception:
        pass

    await send_telegram("\n".join(lines))
    print("✅ Reporte enviado.")

if __name__ == "__main__":
    asyncio.run(main())
