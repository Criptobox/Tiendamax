#!/usr/bin/env python3
"""
TiendaMax — Notificaciones Push Premium v5 (Firebase Cloud Queue)
=============================================================
Esta versión elimina la dependencia de archivos locales para la cola,
usando Firebase Realtime Database para evitar conflictos de Git.
"""

import json
import os
import re
import subprocess
import sys
import time
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
        # Busca los 2 commits más recientes que tocaron este archivo específico.
        # Usar HEAD~1 es incorrecto si hubo commits intermedios que no tocaron el archivo.
        log_res = subprocess.run(
            ["git", "log", "--format=%H", "--", filepath],
            capture_output=True, text=True, check=False
        )
        if log_res.returncode != 0 or not log_res.stdout.strip():
            return None
        commits = [c.strip() for c in log_res.stdout.strip().split('\n') if c.strip()]
        if len(commits) < 2:
            return None  # Solo un commit ha tocado este archivo — sin histórico anterior
        prev_commit = commits[1]
        res = subprocess.run(
            ["git", "show", f"{prev_commit}:{filepath}"],
            capture_output=True, text=True, check=False
        )
        if res.returncode != 0:
            return None
        return json.loads(res.stdout)
    except json.JSONDecodeError as e:
        print(f"⚠️ JSON malformado en historial:{filepath}: {e}", file=sys.stderr)
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

def _fb_to_list(v) -> list:
    """Firebase convierte arrays a dicts {"0":..,"1":..} en algunos casos. Normaliza."""
    if v is None:
        return []
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        try:
            return [v[k] for k in sorted(v.keys(), key=lambda x: int(x))]
        except (ValueError, TypeError):
            return list(v.values())
    return []

def cargar_cola(database) -> dict:
    ref = database.reference("notification_queue")
    data = ref.get()
    if not data:
        return {
            "nuevos_pendientes": [],
            "rebajas_pendientes": [],
            "tasa_pendiente": None,
            "ultima_tasa_notificada": None,
            "ultimo_push": {},
            "ultimo_lote_fecha": ""
        }
    # Normalizar siempre — Firebase puede devolver arrays como dicts
    data["nuevos_pendientes"] = _fb_to_list(data.get("nuevos_pendientes"))
    data["rebajas_pendientes"] = _fb_to_list(data.get("rebajas_pendientes"))
    # tasa_pendiente puede ser None o [ta, tp]
    tp = data.get("tasa_pendiente")
    data["tasa_pendiente"] = _fb_to_list(tp) if isinstance(tp, dict) else tp
    data.setdefault("ultima_tasa_notificada", None)
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
    
    # Tasa — tasaMNAnterior (escrito por update_rate_from_eltoque.py) es la fuente
    # más confiable: no depende de cuántos commits intermedios haya en config.json.
    if "tasaMN" in config_actual:
        try:
            ta = float(config_actual["tasaMN"])
            if "tasaMNAnterior" in config_actual:
                tp = float(config_actual["tasaMNAnterior"])
                if abs(ta - tp) >= 0.01:
                    res["tasa"] = (ta, tp)
            elif isinstance(config_anterior, dict) and "tasaMN" in config_anterior:
                tp = float(config_anterior["tasaMN"])
                if abs(ta - tp) >= 0.01:
                    res["tasa"] = (ta, tp)
        except:
            pass

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
FCM_BATCH_SIZE = 500  # límite duro de send_each_for_multicast

# Códigos de error FCM que indican token muerto (no recuperable)
_FCM_DEAD_TOKEN_ERRORS = (
    "NotRegistered",
    "InvalidRegistration",
    "Requested entity was not found",
    "INVALID_ARGUMENT",
    "registration-token-not-registered",
)

def enviar_push_fcm(messaging_api, database, tokens, keys, title, body, link, imagen=None, tag=None):
    if not tokens: return
    full_link = f"{SITE_URL}{link}" if not link.startswith("http") else link

    # Deduplicar y sanear lista de tokens
    tokens_uniq = list(dict.fromkeys(t for t in tokens if isinstance(t, str) and t))
    total = len(tokens_uniq)
    if not total: return

    n_lotes = (total + FCM_BATCH_SIZE - 1) // FCM_BATCH_SIZE
    print(f"📨 Enviando '{title}' — {total} suscriptor(es), {n_lotes} lote(s)")

    total_ok = 0
    total_fail = 0
    tokens_a_borrar = []

    for lote_n, start in enumerate(range(0, total, FCM_BATCH_SIZE), 1):
        batch = tokens_uniq[start:start + FCM_BATCH_SIZE]
        message = messaging_api.MulticastMessage(
            data={
                "url": full_link, "title": title, "body": body,
                "image": imagen or "", "icon": ICONO_PUSH, "tag": tag or "tiendamax",
            },
            tokens=batch,
            webpush=messaging_api.WebpushConfig(
                headers={"Urgency": "high"},
                fcm_options=messaging_api.WebpushFCMOptions(link=full_link),
            ),
        )
        try:
            response = messaging_api.send_each_for_multicast(message)
            total_ok += response.success_count
            total_fail += response.failure_count
            for j, result in enumerate(response.responses):
                if not result.success and result.exception:
                    err = str(result.exception)
                    if any(pat in err for pat in _FCM_DEAD_TOKEN_ERRORS):
                        tokens_a_borrar.append(batch[j])
        except Exception as e:
            print(f"⚠️ Error en lote {lote_n}/{n_lotes}: {e}", file=sys.stderr)

    print(f"✅ Entregados: {total_ok} | ❌ Fallidos: {total_fail}")

    # Limpiar tokens muertos de Firebase
    if tokens_a_borrar:
        borrar_set = set(tokens_a_borrar)
        try:
            tokens_ref = database.reference("tokens")
            all_tokens = tokens_ref.get() or {}
            for key, val in all_tokens.items():
                if isinstance(val, dict) and val.get("token") in borrar_set:
                    tokens_ref.child(key).delete()
            print(f"🗑️ Tokens inválidos eliminados: {len(tokens_a_borrar)}")
        except Exception as e:
            print(f"⚠️ Error limpiando tokens: {e}", file=sys.stderr)


def _admin_tokens(database):
    """Tokens FCM de los teléfonos registrados como admin (/admin_tokens)."""
    data = database.reference("admin_tokens").get() or {}
    if not isinstance(data, dict):
        return []
    return [v["token"] for v in data.values() if isinstance(v, dict) and v.get("token")]

def enviar_push_admin(messaging_api, database, title, body, link="/admin.html", tag="admin-alert"):
    """Envía una notificación SOLO a los teléfonos del admin."""
    tokens = _admin_tokens(database)
    if not tokens:
        print("ℹ️ Sin teléfonos admin registrados; no se envía aviso admin.")
        return False
    enviar_push_fcm(messaging_api, database, tokens, [], title, body, link, None, tag=tag)
    print(f"📲 Aviso admin enviado a {len(tokens)} dispositivo(s): {title}")
    return True

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
        # Teléfonos de clientes que dejaron su WhatsApp (para que el admin les escriba)
        tels = [str(v.get("tel")).strip() for v in interesados.values()
                if isinstance(v, dict) and v.get("tel")]
        if not tokens and not tels:
            ref.delete()
            continue

        title = "🎉 ¡Volvió al stock!"
        body = f"{item.get('nombre', 'Un producto que te interesa')} ya está disponible. ¡Pídelo antes de que se agote!"
        link = f"/p/producto-{pid}.html"
        if tokens:
            enviar_push_fcm(messaging_api, database, tokens, [], title, body, link,
                            item.get("imagen"), tag=f"restock-{pid}")
        # Avisar al ADMIN qué clientes esperan este producto (con su WhatsApp)
        if tels:
            lista = ", ".join(dict.fromkeys(tels))
            enviar_push_admin(messaging_api, database,
                              f"📦 {item.get('nombre','Producto')} volvió — escríbeles",
                              f"{len(tels)} cliente(s) lo esperan: {lista}",
                              link=f"/p/producto-{pid}.html", tag=f"admin-restock-{pid}")
        # Limpiar: ya fueron notificados
        ref.delete()
        # Resetear el contador público de demanda
        try:
            database.reference(f"avisos_count/{pid}/count").set(0)
        except Exception:
            pass
        print(f"🔔 Restock notificado a {len(tokens)} interesados en {item.get('nombre')}")

# ============================================================
# SOLICITUDES MANUALES DEL ADMIN
# ============================================================
def procesar_admin_requests(messaging_api, database, cola):
    """Lee admin_push_requests de RTDB y envía cada solicitud pendiente.

    Deduplica del lado del servidor: una misma URL de destino no se notifica
    más de 1 vez cada ADMIN_PUSH_COOLDOWN_H horas, sin importar cuántas veces
    se encole (doble click, carrera entre workflows, etc.).
    """
    ref = database.reference("admin_push_requests")
    requests_data = ref.get()
    if not requests_data:
        return
    tokens_ref = database.reference("tokens")
    tokens_data = tokens_ref.get() or {}
    tokens = [v["token"] for v in tokens_data.values() if isinstance(v, dict) and v.get("token")]
    if not tokens:
        print("⚠️ No hay tokens para enviar solicitudes admin.")
        ref.delete()
        return

    ADMIN_PUSH_COOLDOWN_S = 8 * 3600  # mismo cooldown que el frontend (8 h)
    ahora = time.time()
    ultimo_push = cola.setdefault("ultimo_push", {})

    for req_id, req in requests_data.items():
        if not isinstance(req, dict):
            continue
        title = str(req.get("title", "")).strip()
        body  = str(req.get("body",  "")).strip()
        link  = str(req.get("url",   "/")).strip() or "/"
        imagen = req.get("imagen") or None
        if not title or not body:
            continue
        # Clave de dedup: id del producto extraído de la URL (única por producto).
        # No usamos la URL cruda porque '/' y '.' son ilegales como claves en RTDB.
        m = re.search(r"producto-([\w-]+)\.html", link)
        dedup_key = ("p_" + m.group(1)) if m else re.sub(r"[.#$\[\]/]+", "_", link).strip("_") or "_"
        ultimo = ultimo_push.get(dedup_key, 0)
        if isinstance(ultimo, (int, float)) and (ahora - ultimo) < ADMIN_PUSH_COOLDOWN_S:
            horas = int((ADMIN_PUSH_COOLDOWN_S - (ahora - ultimo)) / 3600) + 1
            print(f"⏭️ Saltando (dedup, faltan ~{horas} h): '{title}'")
            continue
        print(f"📨 Solicitud admin: '{title}'")
        enviar_push_fcm(messaging_api, database, tokens, [], title, body, link, imagen, tag="admin-push")
        ultimo_push[dedup_key] = ahora
    ref.delete()  # limpiar todas las solicitudes procesadas (firebase_admin: delete, no set(None))

# ============================================================
# MAIN
# ============================================================
def main():
    msg_api, db_api = init_firebase()
    if not msg_api or not db_api: return 1

    # ── Modo recordatorio admin: avisa SOLO al teléfono del admin y termina ──
    if os.environ.get("SOLO_ADMIN_RECORDATORIO") == "1":
        try:
            p_act = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
            agotados = sum(1 for p in p_act if int(p.get("stock") or 0) <= 0)
            bajos = sum(1 for p in p_act if 0 < int(p.get("stock") or 0) <= 3)
            pend = []
            if agotados: pend.append(f"{agotados} agotado(s)")
            if bajos: pend.append(f"{bajos} con stock bajo")
            cuerpo = "Comparte una categoría por WhatsApp/Facebook ahora que es horario pico."
            if pend: cuerpo += " Pendiente: " + ", ".join(pend) + "."
            enviar_push_admin(msg_api, db_api, "🕐 Hora de publicar — TiendaMax", cuerpo, link="/admin.html", tag="admin-recordatorio")
        except Exception as e:
            print(f"⚠️ Error en recordatorio admin: {e}", file=sys.stderr)
        return 0

    cola = cargar_cola(db_api)
    solo_flush = os.environ.get("SOLO_FLUSH") == "1"

    # Solicitudes manuales del admin — siempre procesadas primero, sin restricción horaria
    try:
        procesar_admin_requests(msg_api, db_api, cola)
    except Exception as e:
        print(f"⚠️ Error procesando solicitudes admin: {e}", file=sys.stderr)

    if not solo_flush:
        try:
            c_act = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
            p_act = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"❌ Error leyendo JSON de datos: {e}", file=sys.stderr)
            return 1
        cambios = detectar_cambios(c_act, get_previous_json("config.json"), p_act, get_previous_json("productos.json"))
        
        if cambios["tasa"]:
            ta_nueva = cambios["tasa"][0]
            # Solo encolar si esta tasa exacta no fue ya notificada antes
            if cola.get("ultima_tasa_notificada") != ta_nueva:
                cola["tasa_pendiente"] = cambios["tasa"]
            else:
                print(f"ℹ️ Tasa {ta_nueva} ya fue notificada anteriormente. Se omite.")
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
        title = "💱 ¡Bajó el Dólar!" if ta < tp else "💱 Cambio de Tasa"
        avisos.append({"tipo": "tasa", "title": title, "body": txt, "link": "/", "imagen": None})

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
            tokens = [
                v["token"] for v in tokens_data.values()
                if isinstance(v, dict) and v.get("token")
            ]
            print(f"🔑 Tokens en base: {len(tokens_data)} | Válidos: {len(tokens)}")
            for a in avisos:
                enviar_push_fcm(msg_api, db_api, tokens, [], a["title"], a["body"], a["link"], a["imagen"])
                if a["tipo"] == "tasa":
                    ta_enviada = cola["tasa_pendiente"][0] if cola["tasa_pendiente"] else None
                    cola["tasa_pendiente"] = None
                    if ta_enviada is not None:
                        cola["ultima_tasa_notificada"] = ta_enviada
                elif a["tipo"] == "rebajas": cola["rebajas_pendientes"] = []
                elif a["tipo"] == "nuevos": 
                    cola["nuevos_pendientes"] = []
                    cola["ultimo_lote_fecha"] = fecha_hoy

    guardar_cola(db_api, cola)
    return 0

if __name__ == "__main__":
    sys.exit(main())
