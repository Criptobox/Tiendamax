#!/usr/bin/env python3
# =====================================================
#   TiendaMax Stock Bot — Telegram
#   Comandos:
#     -1 nombre     → descontar 1 unidad
#     -3 nombre     → descontar 3 unidades
#     +2 nombre     → añadir 2 unidades
#     stock         → ver todo el inventario
#     buscar nombre → buscar un producto
#     exportar      → recibir el productos.json actualizado
#     historial     → ver los últimos movimientos
# =====================================================

import json
import os
import re
import datetime
import urllib.request
import urllib.parse

# ── CONFIGURACIÓN ──────────────────────────────────
TOKEN    = "8666024938:AAEfCoPNka4Ctsl80srbf8lSheT40qIs9PM"
BASE_URL = f"https://api.telegram.org/bot{TOKEN}"

# Archivo donde se guardan los productos
PRODUCTOS_FILE = "productos.json"
HISTORIAL_FILE = "historial.json"

# ── UTILIDADES HTTP ────────────────────────────────
def api(method, params=None, files=None):
    url = f"{BASE_URL}/{method}"
    if params:
        data = json.dumps(params).encode()
        req  = urllib.request.Request(url, data=data,
               headers={"Content-Type": "application/json"})
    else:
        req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Error API: {e}")
        return {}

def enviar(chat_id, texto, parse_mode="HTML"):
    api("sendMessage", {"chat_id": chat_id, "text": texto, "parse_mode": parse_mode})

def enviar_archivo(chat_id, ruta, nombre):
    """Envía un archivo usando multipart/form-data"""
    import urllib.request
    import mimetypes
    boundary = "----TiendaMaxBoundary"
    with open(ruta, "rb") as f:
        file_data = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="chat_id"\r\n\r\n'
        f"{chat_id}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="document"; filename="{nombre}"\r\n'
        f"Content-Type: application/json\r\n\r\n"
    ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{BASE_URL}/sendDocument",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Error enviando archivo: {e}")
        return {}

# ── PRODUCTOS ──────────────────────────────────────
def cargar_productos():
    if not os.path.exists(PRODUCTOS_FILE):
        return []
    with open(PRODUCTOS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def guardar_productos(productos):
    with open(PRODUCTOS_FILE, "w", encoding="utf-8") as f:
        json.dump(productos, f, ensure_ascii=False, indent=2)

def buscar_producto(productos, nombre_buscado):
    """Busca producto por coincidencia parcial ignorando mayúsculas"""
    nombre_lower = nombre_buscado.lower().strip()
    # Primero buscar coincidencia exacta
    for p in productos:
        if p["nombre"].lower() == nombre_lower:
            return p
    # Luego coincidencia parcial
    coincidencias = [p for p in productos if nombre_lower in p["nombre"].lower()]
    if len(coincidencias) == 1:
        return coincidencias[0]
    if len(coincidencias) > 1:
        return coincidencias  # retorna lista si hay varias
    return None

# ── HISTORIAL ──────────────────────────────────────
def cargar_historial():
    if not os.path.exists(HISTORIAL_FILE):
        return []
    with open(HISTORIAL_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def guardar_historial(historial):
    with open(HISTORIAL_FILE, "w", encoding="utf-8") as f:
        json.dump(historial, f, ensure_ascii=False, indent=2)

def registrar_movimiento(producto_nombre, cantidad, stock_antes, stock_despues):
    historial = cargar_historial()
    historial.insert(0, {
        "fecha": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
        "producto": producto_nombre,
        "cambio": cantidad,
        "antes": stock_antes,
        "despues": stock_despues
    })
    guardar_historial(historial[:100])  # máximo 100 registros

# ── COMANDOS ───────────────────────────────────────
def cmd_ajustar_stock(chat_id, texto):
    """Maneja -3 nombre o +2 nombre"""
    match = re.match(r'^([+-]\d+)\s+(.+)$', texto.strip())
    if not match:
        enviar(chat_id, "⚠️ Formato incorrecto.\nUsa: <code>-1 nombre del producto</code> o <code>+3 nombre</code>")
        return

    cantidad   = int(match.group(1))
    nombre_bus = match.group(2).strip()
    productos  = cargar_productos()
    resultado  = buscar_producto(productos, nombre_bus)

    if resultado is None:
        enviar(chat_id, f"❌ No encontré ningún producto con <b>{nombre_bus}</b>\n\nUsa <code>buscar {nombre_bus}</code> para ver opciones similares.")
        return

    if isinstance(resultado, list):
        lista = "\n".join([f"• {p['nombre']}" for p in resultado])
        enviar(chat_id, f"⚠️ Encontré varios productos con ese nombre:\n\n{lista}\n\nEscribe el nombre más completo.")
        return

    stock_antes  = resultado["stock"]
    stock_nuevo  = max(0, stock_antes + cantidad)
    resultado["stock"] = stock_nuevo

    guardar_productos(productos)
    registrar_movimiento(resultado["nombre"], cantidad, stock_antes, stock_nuevo)

    signo = "➕" if cantidad > 0 else "➖"
    emoji_stock = "✅" if stock_nuevo > 3 else ("⚠️" if stock_nuevo > 0 else "❌")
    enviar(chat_id,
        f"{signo} <b>{resultado['nombre']}</b>\n"
        f"Stock: {stock_antes} → <b>{stock_nuevo}</b> {emoji_stock}\n"
        f"({'añadidas' if cantidad > 0 else 'descontadas'}: {abs(cantidad)} unidades)"
    )

    # Alerta si queda poco stock
    if stock_nuevo <= 2 and stock_nuevo > 0:
        enviar(chat_id, f"⚠️ <b>¡Atención!</b> {resultado['nombre']} tiene solo {stock_nuevo} unidad(es) restante(s).")
    elif stock_nuevo == 0:
        enviar(chat_id, f"🔴 <b>¡AGOTADO!</b> {resultado['nombre']} ya no tiene stock.")

def cmd_stock(chat_id):
    """Muestra todo el inventario"""
    productos = cargar_productos()
    if not productos:
        enviar(chat_id, "No hay productos cargados.")
        return

    # Agrupar por categoría
    categorias = {}
    for p in productos:
        cat = p.get("categoria", "General")
        if cat not in categorias:
            categorias[cat] = []
        categorias[cat].append(p)

    texto = "📦 <b>INVENTARIO COMPLETO</b>\n\n"
    for cat, prods in categorias.items():
        texto += f"<b>── {cat} ──</b>\n"
        for p in prods:
            s = p["stock"]
            if s == 0:
                emoji = "❌"
            elif s <= 2:
                emoji = "⚠️"
            elif s <= 5:
                emoji = "🟡"
            else:
                emoji = "✅"
            texto += f"{emoji} {p['nombre'][:35]}: <b>{s}</b>\n"
        texto += "\n"

    enviar(chat_id, texto)

def cmd_buscar(chat_id, nombre_bus):
    """Busca un producto y muestra su info"""
    productos = cargar_productos()
    nombre_lower = nombre_bus.lower()
    coincidencias = [p for p in productos if nombre_lower in p["nombre"].lower()]

    if not coincidencias:
        enviar(chat_id, f"❌ No encontré productos con <b>{nombre_bus}</b>")
        return

    texto = f"🔍 Resultados para <b>{nombre_bus}</b>:\n\n"
    for p in coincidencias[:10]:
        s = p["stock"]
        emoji = "❌" if s == 0 else ("⚠️" if s <= 2 else "✅")
        texto += f"{emoji} <b>{p['nombre']}</b>\n   Stock: {s} | ${p['precioActual']} USD\n\n"

    enviar(chat_id, texto)

def cmd_exportar(chat_id):
    """Envía el productos.json actualizado"""
    if not os.path.exists(PRODUCTOS_FILE):
        enviar(chat_id, "❌ No hay archivo de productos.")
        return
    fecha = datetime.datetime.now().strftime("%d-%m-%Y_%H-%M")
    nombre = f"productos_{fecha}.json"
    enviar(chat_id, f"📤 Aquí tienes el archivo actualizado. Súbelo a GitHub en la carpeta raíz como <code>productos.json</code>")
    enviar_archivo(chat_id, PRODUCTOS_FILE, nombre)

def cmd_historial(chat_id):
    """Muestra los últimos 20 movimientos"""
    historial = cargar_historial()
    if not historial:
        enviar(chat_id, "No hay movimientos registrados aún.")
        return
    texto = "📋 <b>ÚLTIMOS MOVIMIENTOS</b>\n\n"
    for h in historial[:20]:
        signo = "➕" if h["cambio"] > 0 else "➖"
        texto += f"{signo} <b>{h['producto'][:30]}</b>\n   {h['antes']} → {h['despues']} | {h['fecha']}\n\n"
    enviar(chat_id, texto)

def cmd_ayuda(chat_id):
    enviar(chat_id,
        "🤖 <b>TiendaMax Stock Bot</b>\n\n"
        "<b>Comandos disponibles:</b>\n\n"
        "➖ <code>-1 nombre producto</code>\nDescontar unidades\n\n"
        "➕ <code>+3 nombre producto</code>\nAñadir unidades\n\n"
        "📦 <code>stock</code>\nVer todo el inventario\n\n"
        "🔍 <code>buscar nombre</code>\nBuscar un producto\n\n"
        "📤 <code>exportar</code>\nRecibir el JSON para subir a GitHub\n\n"
        "📋 <code>historial</code>\nVer últimos movimientos\n\n"
        "<i>Ejemplo: -1 Cargador inteligente 20A</i>"
    )

# ── LOOP PRINCIPAL ─────────────────────────────────
def main():
    print("✅ TiendaMax Bot iniciado...")
    if not os.path.exists(PRODUCTOS_FILE):
        print(f"⚠️  Pon el archivo productos.json en la misma carpeta que bot.py")

    offset = 0
    while True:
        try:
            resp = api("getUpdates", {"offset": offset, "timeout": 30})
            updates = resp.get("result", [])

            for update in updates:
                offset = update["update_id"] + 1
                msg = update.get("message", {})
                if not msg:
                    continue

                chat_id = msg["chat"]["id"]
                texto   = msg.get("text", "").strip()

                if not texto:
                    continue

                texto_lower = texto.lower()

                if texto_lower in ["/start", "/ayuda", "ayuda"]:
                    cmd_ayuda(chat_id)
                elif texto_lower == "stock":
                    cmd_stock(chat_id)
                elif texto_lower == "exportar":
                    cmd_exportar(chat_id)
                elif texto_lower == "historial":
                    cmd_historial(chat_id)
                elif texto_lower.startswith("buscar "):
                    cmd_buscar(chat_id, texto[7:].strip())
                elif re.match(r'^[+-]\d+\s+.+', texto):
                    cmd_ajustar_stock(chat_id, texto)
                else:
                    enviar(chat_id, "No entendí ese comando. Escribe <code>ayuda</code> para ver los disponibles.")

        except KeyboardInterrupt:
            print("\nBot detenido.")
            break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
