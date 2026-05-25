#!/usr/bin/env python3
"""
Compara config.json y productos.json del commit actual con el commit anterior (HEAD~1).
Envía notificaciones push (Firebase Cloud Messaging) a los suscriptores cuando hay:
  - Cambio de tasa USD→MN
  - Productos nuevos
  - Rebajas de precio

Mejoras v2:
- Si hay varios productos nuevos, los anuncia juntos en un solo mensaje.
- Si hay varias rebajas, también las agrupa.
- Puede enviar más de un push por ejecución (tasa + nuevos + rebajas).
- Tolerante a errores: continúa si una de las secciones falla.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any


def get_previous_json(filepath: str):
    try:
        res = subprocess.run(
            ["git", "show", f"HEAD~1:{filepath}"],
            capture_output=True, text=True, check=True
        )
        return json.loads(res.stdout)
    except Exception as e:
        print(f"⚠️ No se pudo obtener la versión anterior de {filepath}: {e}")
        return None


def cargar_tokens(db):
    ref = db.reference("tokens")
    tokens_data = ref.get()
    if not tokens_data:
        return [], [], ref
    tokens, keys = [], []
    for key, val in tokens_data.items():
        if isinstance(val, dict) and "token" in val:
            tokens.append(val["token"])
            keys.append(key)
    return tokens, keys, ref


def enviar_push(messaging, ref, tokens, keys, title, body, link):
    if not tokens:
        print("⚠️ No hay tokens registrados.")
        return
    for i in range(0, len(tokens), 500):
        batch_tokens = tokens[i:i + 500]
        batch_keys   = keys[i:i + 500]
        message = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=title,
                body=body,
                image="https://tiendamax.org/favicon.svg",
            ),
            data={"url": link},
            tokens=batch_tokens,
        )
        response = messaging.send_each_for_multicast(message)
        print(f"Lote enviado. Éxitos: {response.success_count}, Fallos: {response.failure_count}")

        for idx, resp in enumerate(response.responses):
            if not resp.success:
                exc = resp.exception
                if exc and hasattr(exc, "code") and exc.code in ("unregistered-token", "invalid-argument"):
                    invalid_key = batch_keys[idx]
                    print(f"🗑️  Eliminando token inválido: {invalid_key}")
                    try:
                        ref.child(invalid_key).delete()
                    except Exception:
                        pass


def main() -> int:
    # 1. Cargar config y productos actuales
    try:
        with open("config.json", "r", encoding="utf-8") as f:
            config_actual = json.load(f)
    except Exception as e:
        print(f"❌ Error al leer config.json actual: {e}")
        return 1
    try:
        with open("productos.json", "r", encoding="utf-8") as f:
            productos_actual = json.load(f)
    except Exception as e:
        print(f"❌ Error al leer productos.json actual: {e}")
        return 1

    config_anterior     = get_previous_json("config.json")
    productos_anterior  = get_previous_json("productos.json")

    # Detectar cambios
    avisos: list[tuple[str, str, str]] = []  # (title, body, link)

    # CASO A: tasa de cambio
    if isinstance(config_anterior, dict) and "tasaMN" in config_actual and "tasaMN" in config_anterior:
        try:
            ta = float(config_actual["tasaMN"])
            tp = float(config_anterior["tasaMN"])
            if abs(ta - tp) >= 0.01:
                avisos.append((
                    "💱 ¡Tasa de cambio actualizada!",
                    f"La tasa base hoy es 1 USD = {ta} MN (+10 MN de margen en la tienda)",
                    "/"
                ))
                print(f"Detectado cambio de tasa: {tp} -> {ta}")
        except Exception as e:
            print(f"⚠️ Error comparando tasas: {e}")

    # CASO B y C: productos nuevos / rebajas
    if isinstance(productos_anterior, list):
        prod_ant_map = {p["id"]: p for p in productos_anterior if isinstance(p, dict) and "id" in p}
        nuevos, rebajas = [], []

        for p in productos_actual:
            if not isinstance(p, dict) or "id" not in p:
                continue
            pid = p["id"]
            if pid not in prod_ant_map:
                nuevos.append(p)
            else:
                pant = prod_ant_map[pid]
                precio_act = float(p.get("precioActual", 0) or 0)
                precio_ant = float(pant.get("precioActual", 0) or 0)
                if precio_act < precio_ant and precio_act > 0:
                    rebajas.append((p, precio_ant, precio_act))
                elif float(p.get("descuento", 0) or 0) > 0 and float(pant.get("descuento", 0) or 0) == 0:
                    rebajas.append((p, precio_ant, precio_act))

        if nuevos:
            nuevos.sort(key=lambda x: x.get("id", 0), reverse=True)
            primero = nuevos[0]
            if len(nuevos) == 1:
                title = "🆕 Nuevo producto en TiendaMax"
                body  = f"¡Hemos agregado '{primero.get('nombre')}' por solo ${primero.get('precioActual')} USD!"
                link  = f"/p/producto-{primero.get('id')}.html"
            else:
                title = f"🆕 {len(nuevos)} productos nuevos en TiendaMax"
                nombres = ", ".join(p.get("nombre", "") for p in nuevos[:3])
                if len(nuevos) > 3:
                    nombres += f"… y {len(nuevos) - 3} más"
                body  = f"Acabamos de añadir: {nombres}"
                link  = "/"
            avisos.append((title, body, link))
            print(f"Detectados {len(nuevos)} producto(s) nuevo(s)")

        if rebajas:
            primera = rebajas[0]
            p, antes, ahora = primera
            if len(rebajas) == 1:
                title = "🏷️ ¡Rebaja de precio!"
                body  = f"'{p.get('nombre')}' bajó de ${antes} USD a ${ahora} USD."
                link  = f"/p/producto-{p.get('id')}.html"
            else:
                title = f"🏷️ {len(rebajas)} productos en oferta"
                nombres = ", ".join(r[0].get("nombre", "") for r in rebajas[:3])
                if len(rebajas) > 3:
                    nombres += f"… y {len(rebajas) - 3} más"
                body  = f"Bajaron de precio: {nombres}"
                link  = "/"
            avisos.append((title, body, link))
            print(f"Detectadas {len(rebajas)} rebaja(s)")

    if not avisos:
        print("ℹ️ No se detectaron cambios de tasa, productos nuevos o rebajas.")
        return 0

    # 3. Inicializar Firebase Admin y enviar
    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        print("⚠️ FIREBASE_SERVICE_ACCOUNT no configurada. No se enviará notificación.")
        return 0

    try:
        import firebase_admin
        from firebase_admin import credentials, db, messaging
    except ImportError:
        print("❌ firebase-admin no está instalado.")
        return 1

    try:
        cred_dict = json.loads(service_account_json)
        cred = credentials.Certificate(cred_dict)
        database_url = config_actual.get("firebaseConfig", {}).get("databaseURL")
        if not database_url and "project_id" in cred_dict:
            database_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"
        print(f"Conectando a Realtime Database: {database_url}")

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"databaseURL": database_url})

        tokens, keys, ref = cargar_tokens(db)
        print(f"Total de suscriptores: {len(tokens)}")

        for (title, body, link) in avisos:
            print(f"📤 Enviando: '{title}' → {body}")
            try:
                enviar_push(messaging, ref, tokens, keys, title, body, link)
            except Exception as e:
                print(f"❌ Error enviando aviso '{title}': {e}")
    except Exception as e:
        print(f"❌ Error inicializando Firebase / enviando push: {e}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
