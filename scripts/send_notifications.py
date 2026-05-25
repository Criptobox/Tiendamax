#!/usr/bin/env python3
"""
Compara config.json y productos.json del commit actual con el commit anterior (HEAD~1).
Si detecta cambios en la tasa de cambio, un nuevo producto o una rebaja,
envía una notificación push a todos los suscriptores registrados en Firebase Realtime Database.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys


def get_previous_json(filepath: str) -> dict | list | None:
    try:
        # Ejecutar git show para obtener el archivo de la revisión anterior HEAD~1
        res = subprocess.run(
            ["git", "show", f"HEAD~1:{filepath}"],
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(res.stdout)
    except Exception as e:
        print(f"⚠️ No se pudo obtener la versión anterior de {filepath}: {e}")
        return None


def enviar_push_firebase(title: str, body: str, link: str, config: dict) -> None:
    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        print("⚠️ No se configuró la variable de entorno FIREBASE_SERVICE_ACCOUNT. No se enviará notificación.")
        return

    try:
        # Importar dependencias del SDK de Firebase
        import firebase_admin
        from firebase_admin import credentials, db, messaging
    except ImportError:
        print("❌ Error: El SDK de firebase-admin no está instalado.")
        return

    try:
        # Cargar credenciales desde el JSON de la cuenta de servicio
        cred_dict = json.loads(service_account_json)
        cred = credentials.Certificate(cred_dict)

        # Configurar URL de Realtime Database
        database_url = config.get("firebaseConfig", {}).get("databaseURL")
        if not database_url and "project_id" in cred_dict:
            database_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"

        print(f"Conectando a Realtime Database: {database_url}")

        # Inicializar Firebase Admin si no está ya inicializado
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"databaseURL": database_url})

        # Leer tokens de la base de datos
        ref = db.reference("tokens")
        tokens_data = ref.get()

        if not tokens_data:
            print("⚠️ No hay suscriptores registrados en la base de datos.")
            return

        tokens = []
        token_keys = []
        for key, val in tokens_data.items():
            if isinstance(val, dict) and "token" in val:
                tokens.append(val["token"])
                token_keys.append(key)

        print(f"Total de suscriptores encontrados: {len(tokens)}")
        if not tokens:
            return

        # Enviar en lotes de 500 tokens
        for i in range(0, len(tokens), 500):
            batch_tokens = tokens[i : i + 500]
            batch_keys = token_keys[i : i + 500]

            message = messaging.MulticastMessage(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                    image="https://tiendamax.org/favicon.ico",
                ),
                data={"url": link},
                tokens=batch_tokens,
            )

            response = messaging.send_each_for_multicast(message)
            print(
                f"Lote enviado. Éxitos: {response.success_count}, Fallos: {response.failure_count}"
            )

            # Limpiar tokens inactivos/inválidos
            for idx, resp in enumerate(response.responses):
                if not resp.success:
                    exc = resp.exception
                    # Si el token no está registrado o es inválido, remover de la DB
                    if exc and hasattr(exc, "code") and exc.code in ["unregistered-token", "invalid-argument"]:
                        invalid_key = batch_keys[idx]
                        print(f"Eliminando token inválido/expirado de la DB: {invalid_key}")
                        ref.child(invalid_key).delete()

    except Exception as e:
        print(f"❌ Error al enviar notificaciones FCM: {e}")


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

    # 2. Obtener config y productos del commit anterior (HEAD~1)
    config_anterior = get_previous_json("config.json")
    productos_anterior = get_previous_json("productos.json")

    title = None
    body = None
    url = "/"

    # --- CASO A: Actualización de Tasa de Cambio ---
    if (
        isinstance(config_anterior, dict)
        and "tasaMN" in config_actual
        and "tasaMN" in config_anterior
    ):
        tasa_act = float(config_actual["tasaMN"])
        tasa_ant = float(config_anterior["tasaMN"])
        if tasa_act != tasa_ant:
            title = "💱 ¡Tasa de cambio actualizada!"
            body = f"La tasa base de cambio hoy es 1 USD = {tasa_act} MN (+10 MN de margen en la tienda)"
            url = "/"
            print(f"Detectado cambio de tasa base: {tasa_ant} -> {tasa_act}")

    # --- CASO B: Productos Nuevos o Rebajas ---
    # Solo comprobamos si no se detectó cambio de tasa ya (para no spamear múltiples notificaciones en el mismo push)
    if not title and isinstance(productos_anterior, list):
        prod_ant_map = {p["id"]: p for p in productos_anterior if isinstance(p, dict) and "id" in p}

        nuevos_productos = []
        rebajas = []

        for p in productos_actual:
            if not isinstance(p, dict) or "id" not in p:
                continue
            p_id = p["id"]

            if p_id not in prod_ant_map:
                # Es un producto nuevo
                nuevos_productos.append(p)
            else:
                p_ant = prod_ant_map[p_id]
                precio_ant = float(p_ant.get("precioActual", 0))
                precio_act = float(p.get("precioActual", 0))

                # Rebaja de precio base
                if precio_act < precio_ant and precio_act > 0:
                    rebajas.append((p, precio_ant, precio_act))
                # O si se le activó un descuento
                elif float(p.get("descuento", 0)) > 0 and float(p_ant.get("descuento", 0)) == 0:
                    rebajas.append((p, precio_ant, precio_act))

        # Procesar primero productos nuevos
        if nuevos_productos:
            # Ordenar por id descendente (el más reciente creado tiene id más alto)
            nuevos_productos.sort(key=lambda x: x.get("id", 0), reverse=True)
            p = nuevos_productos[0]
            title = "🆕 Nuevo producto en TiendaMax"
            body = f"¡Hemos agregado '{p.get('nombre')}' por solo ${p.get('precioActual')} USD!"
            url = f"/p/producto-{p.get('id')}.html"
            print(f"Detectado nuevo producto: {p.get('nombre')}")

        # Si no hay nuevos, notificar rebajas
        elif rebajas:
            p, anterior, actual = rebajas[0]
            title = "🏷️ ¡Rebaja de precio!"
            body = f"'{p.get('nombre')}' bajó de precio de ${anterior} USD a solo ${actual} USD."
            url = f"/p/producto-{p.get('id')}.html"
            print(f"Detectada rebaja de precio en: {p.get('nombre')}")

    # 3. Enviar si hay contenido
    if title and body:
        print(f"Enviando notificación: Title='{title}' | Body='{body}' | Link='{url}'")
        enviar_push_firebase(title, body, url, config_actual)
    else:
        print("ℹ️ No se detectaron cambios de tasa, productos nuevos o rebajas.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
