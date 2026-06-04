#!/usr/bin/env python3
"""
TiendaMax — Notificaciones Push Premium v5 (Firebase Cloud Queue)
=============================================================
Esta versión elimina la dependencia de archivos locales para la cola,
usando Firebase Realtime Database para evitar conflictos de Git.
"""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

# ============================================================
# CONFIGURACIÓN
# ============================================================
ZONA_HORARIA_CUBA = ZoneInfo("America/Havana")
HORA_INICIO_DIURNO = 8
HORA_FIN_DIURNO = 22
HORA_LOTE_PRODUCTOS = 13
SITE_URL = "https://tiendamax.org"
ICONO_PUSH = f"{SITE_URL}/iconos/icon-192.png"
MIN_HORAS_ENTRE_PUSH = 4

# ============================================================
# UTILIDADES
# ============================================================
def hora_local_cuba() -> datetime:
    return datetime.now(ZONA_HORARIA_CUBA)

def es_hora_diurna() -> bool:
    h = hora_local_cuba().hour
    return HORA_INICIO_DIURNO <= h < HORA_FIN_DIURNO

def es_hora_de_lote_productos() -> bool:
    return hora_local_cuba().hour == HORA_LOTE_PRODUCTOS

ROOT = Path(__file__).resolve().parents[1]

def get_previous_json(filepath: str):
    try:
        res = subprocess.run(
            ["git", "show", f"HEAD~1:{filepath}"],
            capture_output=True, text=True, check=False
        )
        if res.returncode != 0:
            return None  # Primer commit o archivo nuevo — sin historial previo
        return json.loads(res.stdout)
    except json.JSONDecodeError as e:
        print(f"⚠️ JSON malformado en HEAD~1:{filepath}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"⚠️ Error leyendo historial git de {filepath}: {e}", file=sys.stderr)
        return None

# ============================================================
# FIREBASE & QUEUE LOGIC
# ============================================================
def init_firebase():
    import firebase_admin
    from firebase_admin import credentials, db, messaging
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_json:
        print("❌ Error: FIREBASE_SERVICE_ACCOUNT no configurada.")
        return None, None
    try:
        cred_dict = json.loads(sa_json)
        cred = credentials.Certificate(cred_dict)
        db_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})
        return messaging, db
    except Exception as e:
        print(f"❌ Error Firebase: {e}")
        return None, None

def cargar_cola(database) -> dict:
    ref = database.reference("notification_queue")
    data = ref.get()
    if not data:
        return {
            "nuevos_pendientes": [],
            "rebajas_pendientes": [],
            "tasa_pendiente": None,
            "ultimo_push": {},
            "ultimo_lote_fecha": ""
        }
    # Asegurar listas
    data.setdefault("nuevos_pendientes", [])
    data.setdefault("rebajas_pendientes", [])
    data.setdefault("tasa_pendiente", None)
    data.setdefault("ultimo_push", {})
    data.setdefault("ultimo_lote_fecha", "")
    return data

def guardar_cola(database, cola: dict):
    database.reference("notification_queue").set(cola)

# ============================================================
# DETECCIÓN DE CAMBIOS
# ============================================================
def detectar_cambios(config_actual, config_anterior, prod_actual, prod_anterior):
    res = {"tasa": None, "nuevos": [], "rebajas": [], "restock": []}
    
    # Tasa
    if isinstance(config_anterior, dict) and "tasaMN" in config_actual and "tasaMN" in config_anterior:
        try:
            ta, tp = float(config_actual["tasaMN"]), float(config_anterior["tasaMN"])
            if abs(ta - tp) >= 0.01: res["tasa"] = (ta, tp)
        except: pass

    # Productos
    if isinstance(prod_anterior, list):
        ant_map = {p["id"]: p for p in prod_anterior if isinstance(p, dict) and "id" in p}
        for p in prod_actual:
            if not isinstance(p, dict) or "id" not in p: continue
            pid = p["id"]
            if pid not in ant_map:
                res["nuevos"].append(p)
            else:
                pant = ant_map[pid]
                pa, pp = float(p.get("precioActual", 0) or 0), float(pant.get("precioActual", 0) or 0)
                if pp > 0 and pa < pp - 0.5:
                    res["rebajas"].append({"id": pid, "nombre": p.get("nombre"), "antes": pp, "ahora": pa, "imagen": p.get("imagen")})
                # Restock: el stock pasó de 0 (agotado) a positivo (disponible)
                try:
                    stock_ant = int(pant.get("stock", 0) or 0)
                    stock_act = int(p.get("stock", 0) or 0)
                    if stock_ant == 0 and stock_act > 0:
                        res["restock"].append({"id": pid, "nombre": p.get("nombre"), "imagen": p.get("imagen")})
                except (ValueError, TypeError):
                    pass
    return res

# ============================================================
# ENVÍO
# ============================================================
def enviar_push_fcm(messaging_api, database, tokens, keys, title, body, link, imagen=None, tag=None):
    if not tokens: return
    full_link = f"{SITE_URL}{link}" if not link.startswith("http") else link
    message = messaging_api.MulticastMessage(
        data={"url": full_link, "title": title, "body": body, "image": imagen or "", "icon": ICONO_PUSH, "tag": tag or "tiendamax"},
        tokens=tokens,
        webpush=messaging_api.WebpushConfig(headers={"Urgency": "high"}, fcm_options=messaging_api.WebpushFCMOptions(link=full_link))
    )
    response = messaging_api.send_each_for_multicast(message)
    print(f"✅ Enviado: {response.success_count} | ❌ Fallidos: {response.failure_count}")

    # Limpiar tokens inválidos de Firebase
    tokens_a_borrar = []
    for i, result in enumerate(response.responses):
        if not result.success:
            err = str(result.exception) if result.exception else ""
            if "NotRegistered" in err or "InvalidRegistration" in err:
                tokens_a_borrar.append(tokens[i])
    if tokens_a_borrar:
        tokens_ref = database.reference("tokens")
        all_tokens = tokens_ref.get() or {}
        for key, val in all_tokens.items():
            if isinstance(val, dict) and val.get("token") in tokens_a_borrar:
                tokens_ref.child(key).delete()
        print(f"🗑️ Tokens inválidos eliminados: {len(tokens_a_borrar)}")


def procesar_restock(messaging_api, database, restock_items):
    """
    Para cada producto que volvió al stock, notifica SOLO a los tokens que
    pidieron 'avísame cuando vuelva', leídos de avisos_stock/{productId}.
    Tras enviar, limpia la lista de ese producto.
    """
    for item in restock_items:
        pid = item["id"]
        ref = database.reference(f"avisos_stock/{pid}")
        interesados = ref.get()
        if not interesados:
            continue
        tokens = [v["token"] for v in interesados.values()
                  if isinstance(v, dict) and "token" in v]
        if not tokens:
            ref.delete()
            continue

        title = "🎉 ¡Volvió al stock!"
        body = f"{item.get('nombre', 'Un producto que te interesa')} ya está disponible. ¡Pídelo antes de que se agote!"
        link = f"/p/producto-{pid}.html"
        enviar_push_fcm(messaging_api, database, tokens, [], title, body, link,
                        item.get("imagen"), tag=f"restock-{pid}")
        # Limpiar: ya fueron notificados
        ref.delete()
        # Resetear el contador público de demanda
        try:
            database.reference(f"avisos_count/{pid}/count").set(0)
        except Exception:
            pass
        print(f"🔔 Restock notificado a {len(tokens)} interesados en {item.get('nombre')}")

# ============================================================
# MAIN
# ============================================================
def main():
    msg_api, db_api = init_firebase()
    if not msg_api or not db_api: return 1

    cola = cargar_cola(db_api)
    solo_flush = os.environ.get("SOLO_FLUSH") == "1"

    if not solo_flush:
        try:
            c_act = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
            p_act = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"❌ Error leyendo JSON de datos: {e}", file=sys.stderr)
            return 1
        cambios = detectar_cambios(c_act, get_previous_json("config.json"), p_act, get_previous_json("productos.json"))
        
        if cambios["tasa"]: cola["tasa_pendiente"] = cambios["tasa"]
        cola["nuevos_pendientes"].extend(cambios["nuevos"])
        cola["rebajas_pendientes"].extend(cambios["rebajas"])

        # Restock: notificación dirigida e inmediata a quienes la pidieron.
        # No pasa por la cola ni depende de la hora: el cliente lo solicitó.
        if cambios["restock"]:
            try:
                procesar_restock(msg_api, db_api, cambios["restock"])
            except Exception as e:
                print(f"⚠️ Error procesando restock: {e}")

    # Lógica de envío
    avisos = []
    diurno = es_hora_diurna()
    fecha_hoy = hora_local_cuba().strftime("%Y-%m-%d")

    # 1. Tasa (Inmediato si diurno)
    if cola["tasa_pendiente"] and diurno:
        ta, tp = cola["tasa_pendiente"]
        txt = f"¡Bajó el dólar! 1 USD = {ta} MN" if ta < tp else f"Nueva tasa: 1 USD = {ta} MN"
        avisos.append({"tipo": "tasa", "title": "💱 Cambio de Tasa", "body": txt, "link": "/", "imagen": None})

    # 2. Rebajas (Inmediato si diurno)
    if cola["rebajas_pendientes"] and diurno:
        n_reb = len(cola["rebajas_pendientes"])
        if n_reb == 1:
            r = cola["rebajas_pendientes"][0]
            avisos.append({"tipo": "rebajas", "title": "🏷️ ¡Rebaja!", "body": f"{r['nombre']} ahora a ${r['ahora']}", "link": f"/p/producto-{r['id']}.html", "imagen": r['imagen']})
        else:
            avisos.append({"tipo": "rebajas", "title": f"🏷️ {n_reb} productos rebajados", "body": "Revisa las nuevas ofertas en la tienda", "link": "/", "imagen": None})

    # 3. Nuevos productos (Inmediato si diurno, igual que rebajas)
    if cola["nuevos_pendientes"] and diurno and cola.get("ultimo_lote_fecha") != fecha_hoy:
        n = len(cola["nuevos_pendientes"])
        titulo = f"🆕 ¡Nuevo producto!" if n == 1 else f"🆕 {n} Productos Nuevos"
        cuerpo = f"{cola['nuevos_pendientes'][0]['nombre']}" if n == 1 else "Llegaron novedades, entra a verlas."
        avisos.append({"tipo": "nuevos", "title": titulo, "body": cuerpo, "link": "/", "imagen": cola["nuevos_pendientes"][0].get("imagen") if n == 1 else None})

    # Ejecutar envíos
    if avisos:
        ref_tokens = db_api.reference("tokens")
        tokens_data = ref_tokens.get()
        if tokens_data:
            tokens = [v["token"] for v in tokens_data.values() if "token" in v]
            for a in avisos:
                enviar_push_fcm(msg_api, db_api, tokens, [], a["title"], a["body"], a["link"], a["imagen"])
                if a["tipo"] == "tasa": cola["tasa_pendiente"] = None
                elif a["tipo"] == "rebajas": cola["rebajas_pendientes"] = []
                elif a["tipo"] == "nuevos": 
                    cola["nuevos_pendientes"] = []
                    cola["ultimo_lote_fecha"] = fecha_hoy

    guardar_cola(db_api, cola)
    return 0

if __name__ == "__main__":
    sys.exit(main())
