#!/usr/bin/env python3
"""
TiendaMax — Notificaciones Push v4 (estrategia personalizada)
=============================================================

Tu flujo:
  • PRODUCTOS NUEVOS  → se acumulan en cola y se anuncian JUNTOS
                        en un solo push a las 13:00 Cuba (almuerzo).
  • OFERTAS/REBAJAS   → push INMEDIATO si es 8h-22h Cuba, sino encola.
  • TASA DE CAMBIO    → push inmediato si es 8h-22h, sino encola.

Reglas:
  • Horario silencio: 22h-8h Cuba (UTC-4). Todo encolado va al día siguiente.
  • Anti-spam: máximo 1 push de cada tipo por 4 horas.
  • Agrupación inteligente:
      1 producto    → push detallado con imagen
      2-3 productos → "🆕 3 productos nuevos: A · B · C"
      4+ productos  → "🆕 ¡5 productos nuevos en TiendaMax!"
  • Click → producto exacto (no al home).

Workflows que disparan este script:
  • send-push-notifications.yml → en cada push a productos.json/config.json
                                  (envía OFERTAS al momento, encola NUEVOS)
  • flush-push-queue.yml        → varias veces al día, envía lo encolado
  • A las 13:00 Cuba envía el lote de "productos nuevos" del día.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

# ============================================================
# CONFIGURACIÓN
# ============================================================
ZONA_HORARIA_CUBA      = timezone(timedelta(hours=-4))
HORA_INICIO_DIURNO     = 8
HORA_FIN_DIURNO        = 22
HORA_LOTE_PRODUCTOS    = 13   # Hora exacta a la que se envía el lote diario de "productos nuevos"
COLA_FILE              = Path(".push_queue.json")
SITE_URL               = "https://tiendamax.org"
ICONO_PUSH             = f"{SITE_URL}/icons/icon-192.png"
MIN_HORAS_ENTRE_PUSH   = 4   # Mínimo entre pushes del mismo tipo

# ============================================================
# UTILIDADES
# ============================================================
def hora_local_cuba() -> datetime:
    return datetime.now(ZONA_HORARIA_CUBA)


def es_hora_diurna() -> bool:
    h = hora_local_cuba().hour
    return HORA_INICIO_DIURNO <= h < HORA_FIN_DIURNO


def es_hora_de_lote_productos() -> bool:
    """Es la ventana horaria para enviar el lote diario de productos nuevos."""
    h = hora_local_cuba().hour
    return h == HORA_LOTE_PRODUCTOS


def get_previous_json(filepath: str):
    """Obtener el archivo en HEAD~1 (commit anterior)."""
    try:
        res = subprocess.run(
            ["git", "show", f"HEAD~1:{filepath}"],
            capture_output=True, text=True, check=True
        )
        return json.loads(res.stdout)
    except Exception as e:
        print(f"⚠️ No se pudo obtener la versión anterior de {filepath}: {e}")
        return None


def cargar_cola() -> dict:
    if COLA_FILE.exists():
        try:
            data = json.loads(COLA_FILE.read_text(encoding="utf-8"))
            # Asegurar estructura
            data.setdefault("nuevos_pendientes", [])
            data.setdefault("rebajas_pendientes", [])
            data.setdefault("tasa_pendiente", None)
            data.setdefault("ultimo_push", {})
            data.setdefault("ultimo_lote_productos_fecha", "")
            return data
        except Exception:
            pass
    return {
        "nuevos_pendientes": [],
        "rebajas_pendientes": [],
        "tasa_pendiente": None,
        "ultimo_push": {},
        "ultimo_lote_productos_fecha": "",
    }


def guardar_cola(cola: dict) -> None:
    COLA_FILE.write_text(
        json.dumps(cola, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def puede_enviar_tipo(cola: dict, tipo: str) -> bool:
    """No spamear: respetar mínimo X horas entre pushes del mismo tipo."""
    ultimo = cola.get("ultimo_push", {}).get(tipo)
    if not ultimo:
        return True
    try:
        ultimo_dt = datetime.fromisoformat(ultimo)
    except Exception:
        return True
    delta = datetime.now(timezone.utc) - ultimo_dt
    return delta > timedelta(hours=MIN_HORAS_ENTRE_PUSH)


def marcar_enviado(cola: dict, tipo: str) -> None:
    cola.setdefault("ultimo_push", {})[tipo] = datetime.now(timezone.utc).isoformat()


def dedupe_por_id(items: list[dict]) -> list[dict]:
    visto = set()
    out = []
    for x in items:
        if x.get("id") not in visto:
            visto.add(x.get("id"))
            out.append(x)
    return out


# ============================================================
# CONSTRUCCIÓN DE AVISOS (agrupación inteligente)
# ============================================================
def construir_aviso_nuevos(nuevos: list[dict]) -> tuple[str, str, str, str | None]:
    """Devuelve (title, body, link, imagen_opt)."""
    n = len(nuevos)
    nuevos.sort(key=lambda x: x.get("id", 0), reverse=True)

    if n == 1:
        p = nuevos[0]
        precio = p.get("precioActual", 0)
        return (
            "🆕 Nuevo en TiendaMax",
            f"¡{p.get('nombre', 'Producto nuevo')} desde ${precio} USD!",
            f"/p/producto-{p.get('id')}.html",
            p.get("imagen"),
        )
    if n <= 3:
        nombres = " · ".join(p.get("nombre", "Producto") for p in nuevos)
        return (
            f"🆕 {n} productos nuevos hoy",
            nombres,
            "/",
            None,
        )
    # 4+
    return (
        f"🆕 ¡{n} productos nuevos!",
        "Hoy llegaron muchas novedades. Ven a verlas 🛍️",
        "/",
        None,
    )


def construir_aviso_rebajas(rebajas: list[dict]) -> tuple[str, str, str, str | None]:
    """rebajas: lista de dicts con {id, nombre, antes, ahora, imagen}."""
    n = len(rebajas)

    if n == 1:
        r = rebajas[0]
        antes = r["antes"]
        ahora = r["ahora"]
        descuento = int(round((antes - ahora) / antes * 100)) if antes > 0 else 0
        title = f"🏷️ ¡Rebaja -{descuento}%!" if descuento > 0 else "🏷️ Bajada de precio"
        body = f"{r['nombre']} ahora a ${ahora} USD (antes ${antes})"
        return title, body, f"/p/producto-{r['id']}.html", r.get("imagen")

    if n <= 3:
        nombres = " · ".join(r["nombre"] for r in rebajas)
        return (
            f"🏷️ {n} productos en oferta",
            nombres,
            "/",
            None,
        )
    return (
        f"🔥 ¡{n} ofertas relámpago!",
        "Varios productos con precio rebajado. Aprovecha antes de que se acaben.",
        "/",
        None,
    )


def construir_aviso_tasa(ta: float, tp: float) -> tuple[str, str, str, str | None]:
    diff = ta - tp
    if diff < 0:
        title = "💱 ¡Bajó el dólar!"
        body = f"Hoy 1 USD = {ta} MN (ayer {tp}). Buen momento para comprar 🎉"
    elif diff > 0:
        title = "💱 Subió la tasa"
        body = f"Hoy 1 USD = {ta} MN (antes {tp})."
    else:
        return None  # No notificar si igual
    return title, body, "/", None


# ============================================================
# DETECCIÓN DE CAMBIOS
# ============================================================
def detectar_cambios(config_actual, config_anterior, prod_actual, prod_anterior):
    res = {"tasa": None, "nuevos": [], "rebajas": []}

    if (isinstance(config_anterior, dict)
            and "tasaMN" in config_actual
            and "tasaMN" in config_anterior):
        try:
            ta = float(config_actual["tasaMN"])
            tp = float(config_anterior["tasaMN"])
            if abs(ta - tp) >= 0.01:
                res["tasa"] = (ta, tp)
        except Exception as e:
            print(f"⚠️ Error comparando tasas: {e}")

    if isinstance(prod_anterior, list):
        prod_ant_map = {
            p["id"]: p for p in prod_anterior
            if isinstance(p, dict) and "id" in p
        }
        for p in prod_actual:
            if not isinstance(p, dict) or "id" not in p:
                continue
            pid = p["id"]
            if pid not in prod_ant_map:
                res["nuevos"].append(p)
            else:
                pant = prod_ant_map[pid]
                pa = float(p.get("precioActual", 0) or 0)
                pp = float(pant.get("precioActual", 0) or 0)
                desc_now = float(p.get("descuento", 0) or 0)
                desc_prev = float(pant.get("descuento", 0) or 0)
                # Rebaja real: precio bajó al menos $0.5
                if pp > 0 and pa < pp - 0.5:
                    res["rebajas"].append({
                        "id": p["id"], "nombre": p.get("nombre"),
                        "antes": pp, "ahora": pa, "imagen": p.get("imagen"),
                    })
                elif desc_now > 0 and desc_prev == 0:
                    res["rebajas"].append({
                        "id": p["id"], "nombre": p.get("nombre"),
                        "antes": pp or pa, "ahora": pa, "imagen": p.get("imagen"),
                    })

    return res


# ============================================================
# FIREBASE PUSH
# ============================================================
def enviar_push_fcm(messaging, ref, tokens, keys, title, body, link, imagen=None, tag=None):
    if not tokens:
        print("  ⚠️ No hay tokens registrados.")
        return

    full_link = link if link.startswith("http") else f"{SITE_URL}{link}"

    for i in range(0, len(tokens), 500):
        batch_tokens = tokens[i:i + 500]
        batch_keys   = keys[i:i + 500]

        # FIX: enviar como data-only message (sin "notification") para que
        # SIEMPRE pase por nuestro firebase-messaging-sw.js, que renderiza
        # la imagen del producto correctamente. Si usamos "notification",
        # Chrome a veces usa la plantilla por defecto de FCM (sin imagen).
        message = messaging.MulticastMessage(
            data={
                "url": full_link,
                "title": title,
                "body": body,
                "image": imagen or "",
                "icon": ICONO_PUSH,
                "tag": tag or "tiendamax",
            },
            tokens=batch_tokens,
            webpush=messaging.WebpushConfig(
                # Headers obligan a entrega inmediata
                headers={"Urgency": "high", "TTL": "86400"},
                fcm_options=messaging.WebpushFCMOptions(link=full_link),
            ),
        )

        try:
            response = messaging.send_each_for_multicast(message)
            print(f"  Lote {i//500+1}: ✅ {response.success_count} · ❌ {response.failure_count}")

            for idx, resp in enumerate(response.responses):
                if not resp.success and resp.exception:
                    exc = resp.exception
                    code = getattr(exc, "code", None)
                    if code in ("unregistered-token", "invalid-argument",
                                "messaging/registration-token-not-registered"):
                        invalid_key = batch_keys[idx]
                        print(f"    🗑️  Token inválido eliminado: {invalid_key[:20]}…")
                        try:
                            ref.child(invalid_key).delete()
                        except Exception:
                            pass
        except Exception as e:
            print(f"  ❌ Error enviando lote: {e}")


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


def init_firebase(config_actual):
    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        print("⚠️ FIREBASE_SERVICE_ACCOUNT no configurada en secrets.")
        return None, None, None

    try:
        import firebase_admin
        from firebase_admin import credentials, db, messaging
    except ImportError:
        print("❌ firebase-admin no instalado (pip install firebase-admin)")
        return None, None, None

    try:
        cred_dict = json.loads(service_account_json)
        cred = credentials.Certificate(cred_dict)
        database_url = config_actual.get("firebaseConfig", {}).get("databaseURL")
        if not database_url and "project_id" in cred_dict:
            database_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"
        print(f"📡 Realtime Database: {database_url}")

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"databaseURL": database_url})
        return messaging, db, cred_dict
    except Exception as e:
        print(f"❌ Error inicializando Firebase: {e}")
        return None, None, None


# ============================================================
# MAIN
# ============================================================
def main() -> int:
    hora_actual = hora_local_cuba()
    print(f"🕐 Hora local Cuba: {hora_actual.strftime('%H:%M %d/%m/%Y')}")

    # Cargar archivos actuales
    try:
        config_actual = json.loads(Path("config.json").read_text(encoding="utf-8"))
    except Exception as e:
        print(f"❌ Error leyendo config.json: {e}")
        return 1
    try:
        prod_actual = json.loads(Path("productos.json").read_text(encoding="utf-8"))
    except Exception as e:
        print(f"❌ Error leyendo productos.json: {e}")
        return 1

    config_anterior = get_previous_json("config.json")
    prod_anterior   = get_previous_json("productos.json")

    cambios = detectar_cambios(config_actual, config_anterior, prod_actual, prod_anterior)
    cola = cargar_cola()

    # ============================================================
    # 1. ACUMULAR cambios en la cola
    # ============================================================
    if cambios["nuevos"]:
        cola["nuevos_pendientes"].extend([
            {"id": p["id"], "nombre": p.get("nombre"),
             "precioActual": p.get("precioActual"), "imagen": p.get("imagen")}
            for p in cambios["nuevos"]
        ])
        cola["nuevos_pendientes"] = dedupe_por_id(cola["nuevos_pendientes"])
        print(f"📥 Productos nuevos en cola: {len(cola['nuevos_pendientes'])} (+{len(cambios['nuevos'])} ahora)")

    if cambios["rebajas"]:
        cola["rebajas_pendientes"].extend(cambios["rebajas"])
        cola["rebajas_pendientes"] = dedupe_por_id(cola["rebajas_pendientes"])
        print(f"📥 Rebajas en cola: {len(cola['rebajas_pendientes'])} (+{len(cambios['rebajas'])} ahora)")

    if cambios["tasa"]:
        cola["tasa_pendiente"] = list(cambios["tasa"])  # [ta, tp]
        print(f"📥 Cambio de tasa en cola: {cambios['tasa'][1]} → {cambios['tasa'][0]}")

    # ============================================================
    # 2. DECIDIR qué enviar AHORA según el horario y la estrategia
    # ============================================================
    a_enviar: list[dict] = []

    # ─── A) OFERTAS / REBAJAS: inmediato si es diurno ───
    if cola["rebajas_pendientes"] and es_hora_diurna() and puede_enviar_tipo(cola, "rebajas"):
        title, body, link, img = construir_aviso_rebajas(cola["rebajas_pendientes"])
        a_enviar.append({
            "tipo": "rebajas",
            "title": title, "body": body, "link": link, "imagen": img,
            "tag": "tm-ofertas",
        })
        print(f"🏷️  Enviando ofertas AHORA ({len(cola['rebajas_pendientes'])} en lote)")

    # ─── B) TASA: inmediato si es diurno y cambió ───
    if cola["tasa_pendiente"] and es_hora_diurna() and puede_enviar_tipo(cola, "tasa"):
        ta, tp = cola["tasa_pendiente"]
        aviso = construir_aviso_tasa(ta, tp)
        if aviso:
            title, body, link, img = aviso
            a_enviar.append({
                "tipo": "tasa",
                "title": title, "body": body, "link": link, "imagen": img,
                "tag": "tm-tasa",
            })
            print(f"💱 Enviando cambio de tasa AHORA")

    # ─── C) PRODUCTOS NUEVOS: solo a la hora del lote (13:00 Cuba) ───
    fecha_hoy = hora_actual.strftime("%Y-%m-%d")
    ya_envie_lote_hoy = cola.get("ultimo_lote_productos_fecha") == fecha_hoy

    if (cola["nuevos_pendientes"]
            and es_hora_de_lote_productos()
            and not ya_envie_lote_hoy
            and puede_enviar_tipo(cola, "nuevos")):
        title, body, link, img = construir_aviso_nuevos(cola["nuevos_pendientes"])
        a_enviar.append({
            "tipo": "nuevos",
            "title": title, "body": body, "link": link, "imagen": img,
            "tag": "tm-nuevos",
        })
        print(f"🆕 Enviando lote diario de productos nuevos ({len(cola['nuevos_pendientes'])} productos)")

    if not a_enviar:
        razon = []
        if cola["nuevos_pendientes"]:
            if not es_hora_de_lote_productos():
                razon.append(f"productos nuevos esperan hasta las {HORA_LOTE_PRODUCTOS}:00")
            elif ya_envie_lote_hoy:
                razon.append("ya envié el lote diario de productos hoy")
        if cola["rebajas_pendientes"] and not es_hora_diurna():
            razon.append("ofertas esperan al horario diurno (8h-22h)")
        if cola["tasa_pendiente"] and not es_hora_diurna():
            razon.append("tasa espera al horario diurno")
        if razon:
            print(f"⏸️  En espera: {' · '.join(razon)}")
        else:
            print("ℹ️ Nada nuevo que enviar.")
        guardar_cola(cola)
        return 0

    # ============================================================
    # 3. ENVIAR vía Firebase
    # ============================================================
    messaging, db, cred = init_firebase(config_actual)
    if not messaging:
        print("⚠️ Firebase no disponible. La cola se guarda para próxima ejecución.")
        guardar_cola(cola)
        return 0

    tokens, keys, ref = cargar_tokens(db)
    print(f"📱 Total suscriptores: {len(tokens)}")

    if not tokens:
        print("⚠️ Sin suscriptores. La cola se vacía para no enviar viejo en el futuro.")
        cola["nuevos_pendientes"] = []
        cola["rebajas_pendientes"] = []
        cola["tasa_pendiente"] = None
        guardar_cola(cola)
        return 0

    for aviso in a_enviar:
        print(f"\n📤 [{aviso['tipo'].upper()}] {aviso['title']}")
        print(f"   {aviso['body']}")
        try:
            enviar_push_fcm(
                messaging, ref, tokens, keys,
                aviso["title"], aviso["body"], aviso["link"],
                aviso["imagen"], aviso.get("tag"),
            )
            marcar_enviado(cola, aviso["tipo"])
            # Vaciar la cola correspondiente
            if aviso["tipo"] == "nuevos":
                cola["nuevos_pendientes"] = []
                cola["ultimo_lote_productos_fecha"] = fecha_hoy
            elif aviso["tipo"] == "rebajas":
                cola["rebajas_pendientes"] = []
            elif aviso["tipo"] == "tasa":
                cola["tasa_pendiente"] = None
        except Exception as e:
            print(f"   ❌ Error: {e}")

    guardar_cola(cola)
    return 0


if __name__ == "__main__":
    sys.exit(main())
