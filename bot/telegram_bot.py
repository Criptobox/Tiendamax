#!/usr/bin/env python3
"""
TiendaMax Bot — Asistente de gestión por Telegram
Comandos disponibles:
  (pegar mensaje WhatsApp) → detecta orden automáticamente
  /venta Nombre x2 $50    → registrar venta manual
  /stock                  → ver stock actual
  /reporte                → informe de ventas y analytics
  /ayuda                  → lista de comandos
"""
import asyncio
import os
import sys
import json
import re
import logging
import base64
from datetime import datetime, date
from zoneinfo import ZoneInfo

import httpx
from aiohttp import web
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    filters, ContextTypes, CallbackQueryHandler,
)

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(message)s",
    level=logging.INFO,
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────
BOT_TOKEN    = os.environ["BOT_TOKEN"]
ADMIN_ID     = int(os.environ["ADMIN_CHAT_ID"])
FIREBASE_URL = os.environ["FIREBASE_URL"].rstrip("/")
GH_TOKEN     = os.environ["GITHUB_TOKEN"]
GH_REPO      = os.environ.get("GITHUB_REPO", "criptobox/tiendamax")
TZ           = ZoneInfo("America/Havana")


def _safe_int(v, default=0):
    """int() tolerante: si el stock viene como '', 'agotado', None… no rompe."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# ══════════════════════════════════════════════════════════════
#  HELPERS — Firebase REST API
# ══════════════════════════════════════════════════════════════

async def fb_get(path: str):
    url = f"{FIREBASE_URL}/{path}.json"
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.json()

async def fb_post(path: str, data: dict) -> str:
    """Crea un nuevo nodo hijo con clave aleatoria. Retorna la clave."""
    url = f"{FIREBASE_URL}/{path}.json"
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(url, json=data)
        r.raise_for_status()
        return r.json().get("name", "ok")


# ══════════════════════════════════════════════════════════════
#  HELPERS — GitHub REST API
# ══════════════════════════════════════════════════════════════

_GH_HEADERS = lambda: {"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"}

async def gh_get_file(path: str) -> tuple[any, str]:
    """Retorna (parsed_content, sha)."""
    url = f"https://api.github.com/repos/{GH_REPO}/contents/{path}"
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(url, headers=_GH_HEADERS())
        r.raise_for_status()
        data = r.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    return json.loads(content), data["sha"]

async def gh_put_file(path: str, content: any, sha: str, commit_msg: str):
    body_str = json.dumps(content, ensure_ascii=False, indent=2) + "\n"
    encoded  = base64.b64encode(body_str.encode()).decode()
    url = f"https://api.github.com/repos/{GH_REPO}/contents/{path}"
    payload = {"message": commit_msg, "content": encoded, "sha": sha}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.put(url, json=payload, headers=_GH_HEADERS())
        r.raise_for_status()


# ══════════════════════════════════════════════════════════════
#  HELPERS — Productos
# ══════════════════════════════════════════════════════════════

async def get_productos() -> tuple[list, str]:
    prods, sha = await gh_get_file("productos.json")
    return (prods if isinstance(prods, list) else []), sha

def buscar_producto_en_lista(productos: list, nombre: str) -> int:
    """Retorna índice del producto con nombre más parecido. -1 si no encuentra."""
    nombre_lower = nombre.lower().strip()
    # Coincidencia exacta
    for i, p in enumerate(productos):
        if p.get("nombre", "").lower() == nombre_lower:
            return i
    # Coincidencia parcial (el nombre del mensaje contiene el nombre del producto)
    candidates = [i for i, p in enumerate(productos)
                  if nombre_lower in p.get("nombre", "").lower()
                  or p.get("nombre", "").lower() in nombre_lower]
    return candidates[0] if len(candidates) == 1 else -1

def _fecha_en_mes(fecha_str: str, año: int, mes: int) -> bool:
    """Comprueba si una fecha 'DD/MM/YYYY' pertenece al mes y año indicados."""
    try:
        d = datetime.strptime(fecha_str, "%d/%m/%Y")
        return d.year == año and d.month == mes
    except ValueError:
        return False


# ══════════════════════════════════════════════════════════════
#  PARSER — Mensaje WhatsApp "NUEVA ORDEN — TIENDAMAX"
# ══════════════════════════════════════════════════════════════

def parse_orden_wa(text: str) -> list[dict] | None:
    """
    Extrae lista de items de un mensaje con formato TiendaMax.
    Retorna None si el texto no es una orden TiendaMax.
    """
    if "NUEVA ORDEN" not in text or "TIENDAMAX" not in text:
        return None

    items = []
    lines = text.split("\n")
    for i, line in enumerate(lines):
        # Línea de producto: "🔹 *N.* Nombre del producto"
        m_prod = re.search(r'\*\d+\.\*\s+(.+)', line)
        if not m_prod:
            continue
        nombre = m_prod.group(1).strip("* \t")

        cantidad, precio = 1, 0.0
        for j in range(i + 1, min(i + 4, len(lines))):
            m_cant  = re.search(r'Cant[.:\s]*\*?(\d+)\*?', lines[j], re.IGNORECASE)
            m_prec  = re.search(r'\$([0-9]+\.?[0-9]*)\s*USD', lines[j])
            if m_cant:
                cantidad = int(m_cant.group(1))
            if m_prec:
                precio = float(m_prec.group(1))

        items.append({"nombre": nombre, "precio": precio, "cantidad": cantidad})

    return items if items else None


# ══════════════════════════════════════════════════════════════
#  LÓGICA — Registrar venta + bajar stock
# ══════════════════════════════════════════════════════════════

async def registrar_ventas_y_stock(items: list[dict]) -> list[str]:
    """
    Para cada item:
      1. Escribe venta en Firebase /ventas (una sola vez, sin race condition)
      2. Descuenta stock en productos.json con retry ante conflictos 409
    Retorna lista de mensajes de resultado.
    """
    resultados = []

    # ── 1. Registrar ventas en Firebase (nodo nuevo por venta, sin conflicto) ──
    fb_ok: dict[str, bool] = {}
    for item in items:
        nombre, cantidad, precio = item["nombre"], item["cantidad"], item["precio"]
        total = round(precio * cantidad, 2)
        now   = datetime.now(TZ)
        venta = {
            "id":         int(now.timestamp() * 1000),
            "productoId": 0,
            "producto":   nombre,
            "precio":     precio,
            "cantidad":   cantidad,
            "total":      total,
            "ganancia":   0,
            "fecha":      now.strftime("%d/%m/%Y"),
            "fuente":     "telegram",
        }
        try:
            await fb_post("ventas", venta)
            fb_ok[nombre] = True
        except Exception as e:
            fb_ok[nombre] = False
            resultados.append(f"⚠️ Firebase: {nombre} — {e}")

    # ── 2. Actualizar stock en GitHub con retry ante conflictos 409 ──
    MAX_INTENTOS = 3
    for intento in range(MAX_INTENTOS):
        try:
            prods, sha = await get_productos()
        except Exception as e:
            resultados.append(f"❌ No se pudo cargar productos.json: {e}")
            return resultados

        msgs_stock: list[str] = []
        stock_actualizado = False

        for item in items:
            nombre, cantidad, precio = item["nombre"], item["cantidad"], item["precio"]
            total = round(precio * cantidad, 2)
            ok    = fb_ok.get(nombre, True)

            idx = buscar_producto_en_lista(prods, nombre)
            if idx < 0:
                msgs_stock.append(
                    f"{'✅' if ok else '⚠️'} *{nombre}* × {cantidad}"
                    + (f" = ${total:.2f}" if precio else "")
                    + " · stock no actualizado (producto no encontrado)"
                )
                continue

            stock_antes = _safe_int(prods[idx].get("stock"))
            stock_nuevo = max(0, stock_antes - cantidad)
            prods[idx]["stock"] = stock_nuevo
            stock_actualizado = True

            alerta = " 🚨 *¡Sin stock!*" if stock_nuevo == 0 else \
                     (" ⚠️ Stock bajo" if stock_nuevo <= 3 else "")
            msgs_stock.append(
                f"{'✅' if ok else '⚠️'} *{nombre}* × {cantidad}"
                + (f" = ${total:.2f}" if precio else "")
                + f" · stock {stock_antes}→{stock_nuevo}{alerta}"
            )

        if not stock_actualizado:
            resultados.extend(msgs_stock)
            break

        nombres_str = ", ".join(it["nombre"] for it in items)
        try:
            await gh_put_file(
                "productos.json", prods, sha,
                f"bot: venta registrada — {nombres_str} [skip ci]"
            )
            resultados.extend(msgs_stock)
            break
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 409 and intento < MAX_INTENTOS - 1:
                log.warning(
                    "Conflicto 409 en productos.json "
                    f"(intento {intento + 1}/{MAX_INTENTOS}), reintentando en {2**intento}s…"
                )
                await asyncio.sleep(2 ** intento)
                continue
            resultados.extend(msgs_stock)
            resultados.append(f"⚠️ Error al actualizar stock en GitHub: {e}")
            break

    return resultados


# ══════════════════════════════════════════════════════════════
#  REPORTE DIARIO
# ══════════════════════════════════════════════════════════════

async def generar_reporte(periodo: str = "hoy") -> str:
    now = datetime.now(TZ)
    hoy = now.strftime("%d/%m/%Y")   # fecha en hora de Cuba (igual que las ventas)

    try:
        ventas_raw  = await fb_get("ventas") or {}
        vistas_raw  = await fb_get("analytics/vistas") or {}
        wa_raw      = await fb_get("analytics/whatsapp") or {}
    except Exception as e:
        return f"❌ Error leyendo Firebase: {e}"

    ventas = list(ventas_raw.values()) if isinstance(ventas_raw, dict) else []
    ventas_hoy = [v for v in ventas if v.get("fecha") == hoy]
    ventas_mes = [v for v in ventas if _fecha_en_mes(v.get("fecha", ""), now.year, now.month)]

    def _sum(vs): return sum(v.get("total", 0) for v in vs)
    def _cnt(raw): return sum(
        (v.get("count") if isinstance(v, dict) else v) or 0
        for v in raw.values()
    ) if isinstance(raw, dict) else 0

    total_vistas = _cnt(vistas_raw)
    total_wa     = _cnt(wa_raw)
    conversion   = f"{total_wa/total_vistas*100:.1f}%" if total_vistas else "—"

    # Top 3 productos más vendidos
    conteo: dict[str, int] = {}
    for v in ventas:
        conteo[v.get("producto", "?")] = conteo.get(v.get("producto", "?"), 0) + v.get("cantidad", 1)
    top3 = sorted(conteo.items(), key=lambda x: x[1], reverse=True)[:3]

    # Stock
    stock_lines = []
    try:
        prods, _ = await get_productos()
        sin_stock  = [p["nombre"] for p in prods if _safe_int(p.get("stock")) == 0]
        stock_bajo = [p for p in prods if 0 < _safe_int(p.get("stock")) <= 3]
        if sin_stock:
            stock_lines.append(f"🚫 Sin stock ({len(sin_stock)}): " + ", ".join(sin_stock[:5]) +
                                (" …" if len(sin_stock) > 5 else ""))
        if stock_bajo:
            stock_lines.append("⚠️ Stock bajo: " +
                                ", ".join(f"{p['nombre']} ({p['stock']})" for p in stock_bajo[:4]))
    except Exception:
        pass

    lines = [
        f"📊 *Reporte TiendaMax — {hoy}*",
        "",
        f"🛒 Hoy:    {len(ventas_hoy)} ventas · *${_sum(ventas_hoy):.2f} USD*",
        f"📅 Mes:    {len(ventas_mes)} ventas · *${_sum(ventas_mes):.2f} USD*",
        f"📦 Total:  {len(ventas)} ventas · *${_sum(ventas):.2f} USD*",
        "",
        f"👁️ Vistas:     {total_vistas:,}",
        f"💬 WhatsApp:  {total_wa:,}",
        f"📈 Conversión: {conversion}",
    ]
    if top3:
        lines += ["", "🏆 *Más vendidos:*"]
        for i, (nom, cant) in enumerate(top3, 1):
            lines.append(f"  {i}. {nom[:35]} — {cant} ud{'s' if cant != 1 else ''}")
    if stock_lines:
        lines += [""] + stock_lines

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════
#  ERROR HANDLER — notifica al admin y sigue corriendo
# ══════════════════════════════════════════════════════════════

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    log.error("Excepción no capturada:", exc_info=context.error)
    try:
        await context.bot.send_message(
            chat_id=ADMIN_ID,
            text=f"⚠️ *Error en bot:*\n`{type(context.error).__name__}: {context.error}`",
            parse_mode="Markdown",
        )
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════
#  DECORADOR — solo admin
# ══════════════════════════════════════════════════════════════

def solo_admin(fn):
    async def wrapper(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        if update.effective_user.id != ADMIN_ID:
            await update.message.reply_text("⛔ No autorizado.")
            return
        return await fn(update, ctx)
    return wrapper


# ══════════════════════════════════════════════════════════════
#  HANDLERS — Comandos
# ══════════════════════════════════════════════════════════════

@solo_admin
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 *TiendaMax Bot* listo\\.\n\n"
        "📋 *Cómo usarlo:*\n"
        "• Pega el mensaje de WhatsApp del cliente → lo registro automáticamente\n"
        "• `/venta Nombre x2 $50` → venta manual\n"
        "• `/stock` → estado del inventario\n"
        "• `/reporte` → ventas \\+ analytics\n"
        "• `/ayuda` → todos los comandos",
        parse_mode="MarkdownV2"
    )

@solo_admin
async def cmd_ayuda(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "*Comandos TiendaMax Bot:*\n\n"
        "`/venta Nombre x2 $50` — registrar venta manual\n"
        "`/stock` — ver inventario completo\n"
        "`/reporte` — informe de ventas y analytics\n"
        "`/productos` — lista todos los productos con precio y stock\n"
        "`/ayuda` — este mensaje\n\n"
        "📩 También puedes pegar directamente el mensaje de WhatsApp del cliente.",
        parse_mode="Markdown"
    )

@solo_admin
async def cmd_reporte(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    msg = await update.message.reply_text("⏳ Generando reporte…")
    texto = await generar_reporte()
    await msg.edit_text(texto, parse_mode="Markdown")

@solo_admin
async def cmd_stock(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        prods, _ = await get_productos()
    except Exception as e:
        await update.message.reply_text(f"❌ Error cargando productos: {e}")
        return

    sin_stock  = [p for p in prods if _safe_int(p.get("stock")) == 0]
    stock_bajo = sorted([p for p in prods if 0 < _safe_int(p.get("stock")) <= 3],
                        key=lambda p: p.get("stock", 0))
    con_stock  = [p for p in prods if _safe_int(p.get("stock")) > 3]

    lines = [
        f"📦 *Stock TiendaMax* ({len(prods)} productos)",
        f"✅ Con stock: {len(con_stock)}  ·  ⚠️ Bajo: {len(stock_bajo)}  ·  🚫 Agotado: {len(sin_stock)}",
    ]
    if stock_bajo:
        lines += ["", "⚠️ *Stock bajo (≤ 3 unidades):*"]
        for p in stock_bajo:
            lines.append(f"  • {p['nombre']} → *{p['stock']} ud{'s' if p['stock'] != 1 else ''}*")
    if sin_stock:
        lines += ["", "🚫 *Agotados:*"]
        for p in sin_stock[:12]:
            lines.append(f"  • {p['nombre']}")
        if len(sin_stock) > 12:
            lines.append(f"  … y {len(sin_stock) - 12} más")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")

@solo_admin
async def cmd_productos(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        prods, _ = await get_productos()
    except Exception as e:
        await update.message.reply_text(f"❌ {e}")
        return

    lines = [f"🛍️ *Productos ({len(prods)}):*", ""]
    for p in sorted(prods, key=lambda x: x.get("nombre", "")):
        stock = _safe_int(p.get("stock"))
        icono = "🚫" if stock == 0 else ("⚠️" if stock <= 3 else "✅")
        lines.append(f"{icono} {p['nombre']} — ${p.get('precioActual', 0):.2f} · {stock} uds")

    # Telegram tiene límite de 4096 chars por mensaje
    texto = "\n".join(lines)
    if len(texto) > 4000:
        texto = texto[:4000] + "\n…"
    await update.message.reply_text(texto, parse_mode="Markdown")

@solo_admin
async def cmd_venta_manual(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """
    Uso: /venta Nombre del producto x2 $50
         /venta "Nombre largo" x1 $120
    """
    texto = update.message.text.partition(" ")[2].strip()
    if not texto:
        await update.message.reply_text(
            "Uso: `/venta Nombre x2 $50`\nEjemplo: `/venta Router WiFi x1 $25`",
            parse_mode="Markdown"
        )
        return

    m = re.match(r'^(.+?)\s+x(\d+)\s+\$([0-9]+\.?[0-9]*)$', texto, re.IGNORECASE)
    if not m:
        await update.message.reply_text(
            "Formato incorrecto.\nUsa: `/venta Nombre x2 $50`",
            parse_mode="Markdown"
        )
        return

    nombre  = m.group(1).strip().strip("\"'")
    cant    = int(m.group(2))
    precio  = float(m.group(3))
    total   = round(precio * cant, 2)

    ctx.user_data["pending"] = [{"nombre": nombre, "precio": precio, "cantidad": cant}]

    kb = [[
        InlineKeyboardButton("✅ Confirmar", callback_data="confirmar"),
        InlineKeyboardButton("❌ Cancelar",  callback_data="cancelar"),
    ]]
    await update.message.reply_text(
        f"*¿Confirmar venta?*\n\n"
        f"📦 {nombre}\n"
        f"🔢 Cantidad: {cant}\n"
        f"💵 ${precio:.2f} USD c/u\n"
        f"💰 *Total: ${total:.2f} USD*",
        reply_markup=InlineKeyboardMarkup(kb),
        parse_mode="Markdown"
    )


# ══════════════════════════════════════════════════════════════
#  HANDLER — Texto libre (detecta orden WA)
# ══════════════════════════════════════════════════════════════

@solo_admin
async def handle_texto(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    text  = update.message.text or ""
    items = parse_orden_wa(text)

    if not items:
        await update.message.reply_text(
            "No reconocí una orden TiendaMax en ese mensaje.\n"
            "• Pega el mensaje completo de WhatsApp del cliente\n"
            "• O usa `/venta Nombre x2 $50` para registrar manualmente",
            parse_mode="Markdown"
        )
        return

    total = sum(it["precio"] * it["cantidad"] for it in items)
    lines = ["🛒 *Orden detectada:*", ""]
    for it in items:
        sub = it["precio"] * it["cantidad"]
        lines.append(f"• {it['nombre']} × {it['cantidad']}" +
                     (f" = ${sub:.2f}" if it["precio"] else ""))
    lines += ["", f"💰 *Total: ${total:.2f} USD*"]

    ctx.user_data["pending"] = items
    kb = [[
        InlineKeyboardButton("✅ Registrar", callback_data="confirmar"),
        InlineKeyboardButton("❌ Cancelar",  callback_data="cancelar"),
    ]]
    await update.message.reply_text(
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(kb),
        parse_mode="Markdown"
    )


# ══════════════════════════════════════════════════════════════
#  HANDLER — Callbacks (botones inline)
# ══════════════════════════════════════════════════════════════

async def handle_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query

    # Verificar que solo el admin pueda confirmar/cancelar
    if update.effective_user.id != ADMIN_ID:
        await q.answer("⛔ No autorizado.", show_alert=True)
        return

    await q.answer()

    if q.data == "cancelar":
        ctx.user_data.pop("pending", None)
        await q.edit_message_text("❌ Cancelado.")
        return

    if q.data == "confirmar":
        items = ctx.user_data.pop("pending", None)
        if not items:
            await q.edit_message_text("❌ Operación expirada. Repite el comando.")
            return
        await q.edit_message_text("⏳ Registrando…")
        resultados = await registrar_ventas_y_stock(items)
        total = sum(it["precio"] * it["cantidad"] for it in items)
        texto = "🎉 *Venta registrada*\n\n" + "\n".join(resultados)
        if total:
            texto += f"\n\n💰 *Total: ${total:.2f} USD*"
        await q.edit_message_text(texto, parse_mode="Markdown")


# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════

async def _health(request):
    return web.Response(text="OK")


async def _run(app):
    port = int(os.environ.get("PORT", 8080))

    # Servidor HTTP ligero — mantiene el servicio de Render despierto
    aio_app = web.Application()
    aio_app.router.add_get("/",       _health)
    aio_app.router.add_get("/health", _health)
    runner = web.AppRunner(aio_app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", port).start()
    log.info("Health endpoint escuchando en :%d", port)

    async with app:
        await app.initialize()
        await app.start()
        await app.updater.start_polling(allowed_updates=Update.ALL_TYPES)
        log.info("TiendaMax Bot iniciado (long-polling)…")
        try:
            await app.bot.send_message(chat_id=ADMIN_ID, text="🤖 Bot iniciado y listo.")
        except Exception:
            pass
        try:
            await asyncio.sleep(float("inf"))
        except (asyncio.CancelledError, KeyboardInterrupt):
            pass
        finally:
            await app.updater.stop()
            await app.stop()
            await app.shutdown()

    await runner.cleanup()


def main():
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start",     cmd_start))
    app.add_handler(CommandHandler("ayuda",     cmd_ayuda))
    app.add_handler(CommandHandler("reporte",   cmd_reporte))
    app.add_handler(CommandHandler("stock",     cmd_stock))
    app.add_handler(CommandHandler("productos", cmd_productos))
    app.add_handler(CommandHandler("venta",     cmd_venta_manual))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_texto))
    app.add_error_handler(error_handler)

    asyncio.run(_run(app))

if __name__ == "__main__":
    main()
