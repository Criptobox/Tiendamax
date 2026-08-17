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
import sys
import time
from datetime import datetime
from pathlib import Path
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

# Nodo donde queda apuntado cómo estaba el catálogo la última vez que este
# script lo miró. Es la referencia contra la que se detecta qué cambió —ver
# `detectar_cambios_catalogo`— y sustituye a la comparación contra git.
NODO_ESTADO = "notificaciones_estado"

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

def _clave_item(x) -> str:
    """Identidad de una entrada de la cola. Un producto es el mismo producto
    aunque venga con otro precio o con la foto cambiada."""
    if isinstance(x, dict) and x.get("id") is not None:
        return "id:" + str(x["id"])
    return "raw:" + json.dumps(x, sort_keys=True, default=str)


def _fusionar_cola(current, cola: dict, consumidos=None) -> dict:
    """Combina lo que ESTA corrida quiere guardar con lo que haya en el nodo
    ahora mismo (`current`), que puede ser obra de otra corrida simultánea.

    `consumidos` es {clave_de_cola: {id, id, …}} con lo que esta corrida YA
    ENVIÓ y por tanto vació. Sin ese dato la fusión no podía distinguir "esto
    lo encoló otra corrida después de que yo leyera" de "esto lo acabo de
    mandar", y como la única prueba era estar en `current` y no en lo nuestro,
    se quedaba con lo de `current`: reponía en la cola exactamente lo que
    acababa de salir. La cola no se vaciaba NUNCA. Cada corrida veía las
    mismas rebajas pendientes y volvía a mandar "🏷️ N productos rebajados", en
    cada push a productos.json y en cada una de las nueve pasadas diarias del
    cron.

    Se llama desde dentro de transaction(), así que puede ejecutarse varias
    veces: tiene que ser pura y no depender de nada de fuera.
    """
    if not isinstance(current, dict):
        return cola

    consumidos = consumidos or {}
    fusion = dict(cola)

    # Pendientes: lo que la otra corrida haya encolado DESPUÉS de nuestra
    # lectura no puede perderse, pero lo que nosotros ya enviamos tampoco puede
    # volver. Se conserva de `current` lo que no esté en nuestra versión y no
    # figure entre lo consumido.
    for clave in ("nuevos_pendientes", "rebajas_pendientes"):
        nuestros = _fb_to_list(cola.get(clave))
        suyos = _fb_to_list(current.get(clave))
        ya_enviados = set(consumidos.get(clave) or ())
        vistos = {_clave_item(x) for x in nuestros}
        extra = [x for x in suyos
                 if _clave_item(x) not in vistos and _clave_item(x) not in ya_enviados]
        fusion[clave] = nuestros + extra

    # Anti-spam: gana SIEMPRE el timestamp más alto. Si la otra corrida ya
    # envió algo, su marca es la que vale — quedarnos con la nuestra (más
    # vieja) reabriría la ventana y mandaría el push por segunda vez.
    mio = cola.get("ultimo_push") or {}
    suyo = current.get("ultimo_push") or {}
    if isinstance(suyo, dict):
        combinado = dict(mio)
        for k, v in suyo.items():
            try:
                if float(v) > float(combinado.get(k, 0)):
                    combinado[k] = v
            except (TypeError, ValueError):
                combinado.setdefault(k, v)
        fusion["ultimo_push"] = combinado

    # El lote diario sale una vez al día: si la otra corrida ya lo marcó,
    # esa fecha manda para que no se repita.
    if current.get("ultimo_lote_fecha") and not cola.get("ultimo_lote_fecha"):
        fusion["ultimo_lote_fecha"] = current["ultimo_lote_fecha"]

    return fusion


def guardar_cola(database, cola: dict, consumidos=None):
    # transaction() de verdad: el valor nuevo se calcula A PARTIR de `current`.
    # Antes era `lambda current: cola` — ignoraba `current` por completo, o sea
    # un set() con pasos de más, y no protegía de nada. Hace falta porque
    # admin-recordatorio.yml y flush-push-queue.yml disparan en el mismo minuto
    # ('0 16 * * *'), corren ESTE script y están en concurrency.group distintos,
    # así que GitHub Actions no los serializa entre sí.
    database.reference("notification_queue").transaction(
        lambda current: _fusionar_cola(current, cola, consumidos)
    )

# ============================================================
# DETECCIÓN DE CAMBIOS
# ============================================================
def _num(v, por_defecto=0.0):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return por_defecto


def resumen_catalogo(productos) -> dict:
    """Lo mínimo de cada producto que hace falta para saber qué cambió."""
    out = {}
    for p in productos or []:
        if not isinstance(p, dict) or p.get("id") is None:
            continue
        out[str(p["id"])] = {
            "p": round(_num(p.get("precioActual")), 2),
            "o": round(_num(p.get("precioOriginal")), 2),
            "s": int(_num(p.get("stock"))),
        }
    return out


def cargar_estado(database) -> dict:
    """Cómo estaba el catálogo (y la tasa) la última vez que este script miró.

    Antes esto se sacaba de git: `git log -- productos.json` y comparar HEAD con
    el commit anterior que tocó el archivo. No funcionaba. El workflow hace
    checkout con `fetch-depth: 20` y entre dos ediciones del catálogo pasan
    decenas de commits automáticos (`sync_resenas.py` solo ya mete varios por
    hora), así que dentro de los 20 commits descargados productos.json aparecía
    UNA sola vez — el script se quedaba sin término de comparación y devolvía
    None. Con None no se detecta nada: ni productos nuevos, ni rebajas, ni
    reposiciones de stock. Todo en silencio, sin un solo error en el log.

    El estado vive ahora en la propia base: no depende de la profundidad del
    checkout, ni de cuántos commits intermedios haya, ni de que el cambio haya
    llegado por un commit (el panel también edita el catálogo por la API).

    El catálogo se guarda como UNA cadena JSON en vez de como árbol: los ids de
    producto son claves libres y RTDB prohíbe '.', '#', '$', '[', ']' y '/' en
    las claves. Son ~130 productos con tres números cada uno; cabe de sobra.
    """
    try:
        raw = database.reference(NODO_ESTADO).get() or {}
    except Exception as e:
        print(f"⚠️ No se pudo leer {NODO_ESTADO}: {e}", file=sys.stderr)
        return {}
    if not isinstance(raw, dict):
        return {}
    estado = {}
    cat = raw.get("catalogo")
    if isinstance(cat, str):
        try:
            cat = json.loads(cat)
        except json.JSONDecodeError:
            cat = None
    if isinstance(cat, dict):
        estado["catalogo"] = cat
    if raw.get("tasa") is not None:
        estado["tasa"] = _num(raw.get("tasa"), None)
    return estado


def guardar_estado(database, productos, tasa=None):
    payload = {"catalogo": json.dumps(resumen_catalogo(productos), sort_keys=True),
               "actualizado": int(time.time() * 1000)}
    if tasa is not None:
        payload["tasa"] = tasa
    try:
        database.reference(NODO_ESTADO).update(payload)
    except Exception as e:
        print(f"⚠️ No se pudo guardar {NODO_ESTADO}: {e}", file=sys.stderr)


def detectar_cambios_catalogo(anterior, productos) -> dict:
    """Qué cambió entre el catálogo apuntado (`anterior`) y el de ahora.

    `anterior` vacío = primera vez que corre esto contra esta base. Se devuelve
    todo a cero a propósito: sin referencia, los 128 productos del catálogo
    serían "nuevos" y saldría un push anunciando la tienda entera.
    """
    res = {"nuevos": [], "rebajas": [], "restock": []}
    if not anterior:
        return res
    for p in productos or []:
        if not isinstance(p, dict) or p.get("id") is None:
            continue
        pid = p["id"]
        ant = anterior.get(str(pid))
        if not isinstance(ant, dict):
            res["nuevos"].append(p)
            continue
        pa, pp = _num(p.get("precioActual")), _num(ant.get("p"))
        if pp > 0 and pa < pp - 0.5:
            res["rebajas"].append({"id": pid, "nombre": p.get("nombre"),
                                   "antes": pp, "ahora": pa, "imagen": p.get("imagen")})
        # Reposición: estaba agotado y ahora hay unidades.
        if int(_num(ant.get("s"))) <= 0 < int(_num(p.get("stock"))):
            res["restock"].append({"id": pid, "nombre": p.get("nombre"),
                                   "imagen": p.get("imagen")})
    return res


def detectar_tasa(config_actual, tasa_anterior=None):
    """(nueva, anterior) si la tasa cambió, o None.

    `tasa_anterior` es la última que vio este script. Se prefiere a
    `tasaMNAnterior` del propio config.json porque ese campo solo lo escribe
    update_rate_from_eltoque.py: cuando el dueño cambia la tasa a mano desde el
    panel se queda con el valor viejo y el cambio pasaba desapercibido.
    """
    if not isinstance(config_actual, dict) or "tasaMN" not in config_actual:
        return None
    try:
        ta = float(config_actual["tasaMN"])
    except (TypeError, ValueError):
        return None
    tp = None
    if tasa_anterior is not None:
        tp = _num(tasa_anterior, None)
    elif "tasaMNAnterior" in config_actual:
        tp = _num(config_actual.get("tasaMNAnterior"), None)
    if tp is None or tp <= 0:
        return None
    return (ta, tp) if abs(ta - tp) >= 0.01 else None


def rebajas_vigentes(pendientes, productos):
    """Deja en la cola solo las rebajas que siguen siendo verdad AHORA.

    Tres cosas la ensucian entre que algo entra y sale:

      · El producto se agota. La cola guarda id, nombre y precio, no stock, así
        que sin volver a mirar el catálogo el aviso sigue contándolo.
      · La rebaja se revierte. `revertir_ofertas.py` devuelve el precio de las
        ofertas con fecha, y nadie avisaba a la cola.
      · El mismo producto baja de precio dos veces en el día. La cola hace
        `extend` en cada ejecución del cron, así que entraba dos veces y el
        contador decía 2 productos donde hay uno. Se deja una entrada por
        producto: el precio de partida más alto y el más bajo de ahora, que es
        la rebaja real vista de punta a punta.

    Importa porque el número va en el TÍTULO, y un aviso ya mostrado no se
    puede corregir: se queda en la pantalla del cliente hasta que lo aparte.
    """
    por_id = {p["id"]: p for p in productos if isinstance(p, dict) and "id" in p}
    vivas = {}
    for r in pendientes:
        if not isinstance(r, dict):
            continue
        p = por_id.get(r.get("id"))
        if p is None:
            continue                                  # ya no está en el catálogo
        if int(_num(p.get("stock"))) <= 0:
            continue                                  # se agotó esperando en la cola
        ahora = _num(p.get("precioActual"))
        antes = _num(r.get("antes"))
        if ahora <= 0 or ahora >= antes:
            continue                                  # la rebaja ya no existe
        previa = vivas.get(r["id"])
        vivas[r["id"]] = {
            "id": r["id"],
            "nombre": p.get("nombre") or r.get("nombre"),
            "antes": max(antes, _num(previa.get("antes"))) if previa else antes,
            "ahora": ahora,
            "imagen": p.get("imagen") or r.get("imagen"),
        }
    return list(vivas.values())


def ofertas_visibles(productos):
    """Lo que el cliente va a CONTAR si abre la tienda ahora mismo.

    Es la misma condición que pinta el descuento en la tarjeta
    (`precioOriginal > 0 && precioOriginal > precioActual`, tm-ui.src.js), más
    tener stock: un agotado no es una oferta a la que se pueda ir.

    La cola no sirve para esto. La cola son los productos que CAMBIARON de
    precio desde la última pasada del cron, y eso es otro número: uno rebajado
    ayer sigue rebajado en la tienda y no está en la cola de hoy. El título
    decía "🏷️ 2 productos rebajados" mientras en la tienda había 3, y las dos
    cifras eran correctas cada una en lo suyo — solo que el cliente cuenta lo
    que ve, no lo que cambió.
    """
    fuera = []
    for p in productos:
        if not isinstance(p, dict):
            continue
        if int(_num(p.get("stock"))) <= 0:
            continue
        original, actual = _num(p.get("precioOriginal")), _num(p.get("precioActual"))
        if original > 0 and original > actual:
            fuera.append(p)
    return fuera


def mas_rebajado(productos):
    """El de mayor descuento en porcentaje, para ponerle cara al aviso de
    'N productos rebajados'. Se usa el porcentaje y no los pesos ahorrados: un
    20% en un cargador se lee como ganga, 20 USD menos en un inversor de 900
    no."""
    mejor, mejor_pct = None, 0.0
    for p in productos or []:
        if not isinstance(p, dict):
            continue
        original, actual = _num(p.get("precioOriginal")), _num(p.get("precioActual"))
        if original <= 0 or actual <= 0 or actual >= original:
            continue
        pct = (original - actual) / original
        if pct > mejor_pct:
            mejor, mejor_pct = p, pct
    return mejor


def nuevos_vigentes(pendientes, productos):
    """Lo mismo para los productos nuevos: sin stock no se anuncian, y uno solo
    cuenta una vez aunque el cron lo haya encolado en varias pasadas."""
    por_id = {p["id"]: p for p in productos if isinstance(p, dict) and "id" in p}
    vivos = {}
    for n in pendientes:
        if not isinstance(n, dict):
            continue
        p = por_id.get(n.get("id"))
        if p is None or int(_num(p.get("stock"))) <= 0:
            continue
        vivos[n["id"]] = {**n, "nombre": p.get("nombre") or n.get("nombre"),
                          "imagen": p.get("imagen") or n.get("imagen")}
    return list(vivos.values())


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

def enviar_push_fcm(messaging_api, database, tokens, keys, title, body, link,
                    imagen=None, tag=None, icono=None):
    """`icono` es la miniatura cuadrada que sale AL LADO del texto; `imagen` es
    la foto grande de debajo. Los avisos generales llevan el logo de la tienda
    en el icono —son de la tienda, no de un producto—, pero los dirigidos (te
    volvió el equipo que pediste, bajó el que tienes en favoritos) pasan la foto
    del producto: se reconoce de un vistazo en la bandeja, como la tarjeta de la
    tienda, sin tener que desplegar el aviso para ver de qué va."""
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
                "image": imagen or "", "icon": icono or ICONO_PUSH,
                "tag": tag or "tiendamax",
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

def tokens_de_suscriptores(database):
    """Todos los tokens de la tienda (/tokens)."""
    data = database.reference("tokens").get() or {}
    if not isinstance(data, dict):
        return []
    return [v["token"] for v in data.values() if isinstance(v, dict) and v.get("token")]


def contar_dispositivos(tokens_data) -> int:
    """Aparatos distintos en /tokens.

    Mismo criterio que tmContarSuscriptoresUnicos (js/analytics.js): manda el
    carnet (deviceId), luego la huella, y solo si no hay ninguno de los dos se
    cuenta por token. Un mismo móvil puede tener varias filas —cambió el token,
    se registró con el código viejo— y contarlas todas infla el número.
    """
    if not isinstance(tokens_data, dict):
        return 0
    filas = [v for v in tokens_data.values() if isinstance(v, dict) and v.get("token")]
    uas_con_huella = {v.get("userAgent") for v in filas
                      if v.get("fingerprint") and v.get("userAgent")}
    claves = set()
    for v in filas:
        if v.get("deviceId"):
            claves.add("did:" + str(v["deviceId"]))
        elif v.get("fingerprint"):
            claves.add("fp:" + str(v["fingerprint"]))
        elif v.get("userAgent") in uas_con_huella:
            continue                      # el mismo aparato, ya contado arriba
        else:
            claves.add("tk:" + str(v["token"]))
    return len(claves)


def apuntar_suscriptores_del_dia(database, fecha):
    """Deja el número de suscriptores de hoy en /analytics/suscriptores/{día}.

    Sin esto el panel solo sabe cuántos hay AHORA, y un número suelto no dice
    nada: si pone 30 no hay forma de saber si ayer eran 40 y algo se rompió, o
    si nunca pasaron de 30. Con la serie, una caída se ve de un vistazo.

    Lo escribe el cron y no el panel: el cron corre nueve veces al día pase lo
    que pase, y el panel solo cuando al dueño le da por abrirlo — que es
    justamente cuando no hace falta, porque ya está mirando.
    """
    try:
        n = contar_dispositivos(database.reference("tokens").get())
        database.reference(f"analytics/suscriptores/{fecha}").set(n)
        return n
    except Exception as e:
        print(f"⚠️ No se pudo apuntar el conteo de suscriptores: {e}", file=sys.stderr)
        return None


# Un producto puede entrar y salir de stock varias veces en un día (una unidad
# que entra, se vende, entra otra). El aviso de reposición sale una vez cada
# tanto por producto: lo interesante es "volvió", no cada movimiento.
RESTOCK_COOLDOWN_S = 12 * 3600


def _avisar_restock_a_todos(messaging_api, database, item, excluidos, ultimo_push):
    """La reposición se anuncia a TODA la lista, no solo a quien pidió el aviso.

    Antes solo se avisaba a los tokens de avisos_stock/{id} —los que pulsaron
    'avísame cuando vuelva'—, y con la lista vacía no salía nada: reponer un
    equipo agotado no le llegaba a nadie. Los que sí lo pidieron siguen
    recibiendo el suyo aparte y quedan fuera de este (`excluidos`) para no
    recibir el mismo aviso dos veces.
    """
    pid = item["id"]
    clave = f"restock_{pid}"
    ahora = time.time()
    try:
        previo = float(ultimo_push.get(clave, 0) or 0)
    except (TypeError, ValueError):
        previo = 0.0
    if previo and (ahora - previo) < RESTOCK_COOLDOWN_S:
        print(f"⏭️ Reposición de {item.get('nombre')} ya avisada hace poco.")
        return
    tokens = [t for t in tokens_de_suscriptores(database) if t not in excluidos]
    if not tokens:
        return
    enviar_push_fcm(messaging_api, database, tokens, [],
                    "📦 De vuelta en stock",
                    f"{item.get('nombre', 'Un producto agotado')} volvió a estar disponible.",
                    f"/p/producto-{pid}.html", item.get("imagen"),
                    tag=f"restock-todos-{pid}")
    ultimo_push[clave] = ahora


def procesar_restock(messaging_api, database, restock_items, ultimo_push=None):
    """Un equipo que estaba agotado y vuelve a tener unidades.

    Va a toda la lista de suscriptores (`_avisar_restock_a_todos`) y, aparte,
    a quien dejó su 'avísame cuando vuelva' en avisos_stock/{productId}: a esos
    con su propio texto y borrando la petición, que ya está atendida.
    """
    ultimo_push = ultimo_push if isinstance(ultimo_push, dict) else {}
    for item in restock_items:
        pid = item["id"]
        ref = database.reference(f"avisos_stock/{pid}")
        interesados = ref.get()
        interesados = interesados if isinstance(interesados, dict) else {}
        tokens = [v["token"] for v in interesados.values()
                  if isinstance(v, dict) and "token" in v]
        # Teléfonos: viven en lista_espera, no aquí. avisos_stock es de lectura
        # pública (el panel lo consulta sin autenticación), así que guardar ahí
        # el WhatsApp del cliente era publicarlo. lista_espera tiene .read
        # false; este script usa cuenta de servicio y se salta las reglas.
        espera_ref = database.reference(f"lista_espera/{pid}")
        espera = espera_ref.get() or {}
        tels = [str(v.get("tel")).strip() for v in espera.values()
                if isinstance(v, dict) and v.get("tel")]

        # A quien lo pidió se le habla de lo suyo: su nombre en el título, la
        # foto del producto de miniatura y el texto al lado. El aviso general
        # (más abajo) es el genérico de la tienda.
        nombre = item.get("nombre", "El producto que esperabas")
        title = f"🎉 Llegó {nombre}"
        body = ("Pediste que te avisáramos y ya está aquí. "
                "Toca para verlo antes de que se agote otra vez.")
        link = f"/p/producto-{pid}.html"
        if tokens:
            enviar_push_fcm(messaging_api, database, tokens, [], title, body, link,
                            item.get("imagen"), tag=f"restock-{pid}",
                            icono=item.get("imagen"))
        # Avisar al ADMIN qué clientes esperan este producto (con su WhatsApp)
        if tels:
            lista = ", ".join(dict.fromkeys(tels))
            enviar_push_admin(messaging_api, database,
                              f"📦 {item.get('nombre','Producto')} volvió — escríbeles",
                              f"{len(tels)} cliente(s) lo esperan: {lista}",
                              link=f"/p/producto-{pid}.html", tag=f"admin-restock-{pid}")
        # Limpiar: ya fueron notificados
        if interesados:
            ref.delete()
        if espera:
            espera_ref.delete()
        # Resetear el contador público de demanda
        try:
            database.reference(f"avisos_count/{pid}/count").set(0)
        except Exception:
            pass
        _avisar_restock_a_todos(messaging_api, database, item, set(tokens), ultimo_push)
        print(f"🔔 Restock de {item.get('nombre')}: {len(tokens)} lo pidieron, "
              f"aviso general enviado al resto")

def procesar_avisos_precio(messaging_api, database, rebajas_items):
    """
    Para cada producto que bajó de precio, notifica SOLO a los tokens que lo
    tienen en ❤️ Me Gusta con push habilitado (wishlist_avisos/{productId}),
    además del aviso genérico de "rebajas" que ya reciben todos los
    suscriptores. A diferencia de procesar_restock, NO borra la suscripción:
    quien tiene el producto en favoritos puede seguir interesado en más
    bajadas de precio futuras del mismo producto.
    """
    for item in rebajas_items:
        pid = item["id"]
        ref = database.reference(f"wishlist_avisos/{pid}")
        interesados = ref.get()
        if not interesados:
            continue
        tokens = [v["token"] for v in interesados.values()
                  if isinstance(v, dict) and "token" in v]
        if not tokens:
            continue

        antes = int(_num(item.get("antes")))
        ahora = int(_num(item.get("ahora")))
        pct = int(round((antes - ahora) / antes * 100)) if antes > 0 else 0
        title = (f"🏷️ -{pct}% en {item.get('nombre', 'tu favorito')}"
                 if pct > 0 else f"🏷️ Bajó {item.get('nombre', 'tu favorito')}")
        body = f"De ${antes} a ${ahora}. Lo tienes en ❤️ Me Gusta — corre antes de que se agote."
        link = f"/p/producto-{pid}.html"
        enviar_push_fcm(messaging_api, database, tokens, [], title, body, link,
                        item.get("imagen"), tag=f"wishlist-rebaja-{pid}",
                        icono=item.get("imagen"))
        print(f"🏷️ Rebaja de {item.get('nombre')} notificada a {len(tokens)} que lo tienen en favoritos")

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
        # El panel manda el campo como "image" (así lo llama la API de push);
        # aquí se leía solo "imagen" y por eso la foto del producto nunca
        # llegaba a la notificación. Se aceptan los dos nombres.
        imagen = req.get("imagen") or req.get("image") or None
        if not title or not body:
            ref.child(req_id).delete()
            continue
        # Clave de dedup: id del producto extraído de la URL (única por producto).
        # No usamos la URL cruda porque '/' y '.' son ilegales como claves en RTDB.
        m = re.search(r"producto-([\w-]+)\.html", link)
        dedup_key = ("p_" + m.group(1)) if m else re.sub(r"[.#$\[\]/]+", "_", link).strip("_") or "_"
        ultimo = ultimo_push.get(dedup_key, 0)
        if isinstance(ultimo, (int, float)) and (ahora - ultimo) < ADMIN_PUSH_COOLDOWN_S:
            horas = int((ADMIN_PUSH_COOLDOWN_S - (ahora - ultimo)) / 3600) + 1
            print(f"⏭️ Saltando (dedup, faltan ~{horas} h): '{title}'")
            ref.child(req_id).delete()
            continue
        print(f"📨 Solicitud admin: '{title}'")
        enviar_push_fcm(messaging_api, database, tokens, [], title, body, link, imagen, tag="admin-push")
        ultimo_push[dedup_key] = ahora
        # Borrar solo esta solicitud ya procesada, no todo el nodo — si el admin
        # agregó una solicitud nueva mientras este loop corría (llamadas HTTP a
        # FCM tardan segundos), un ref.delete() global la borraba sin enviarla.
        ref.child(req_id).delete()

# ============================================================
# SEGUIMIENTO POST-VENTA
# ============================================================
# Los mismos tres hitos que js/src/tm-crm.src.js: (días, ventana en días).
# Pasada la ventana el hito se salta en vez de mandarse tarde — preguntar
# "¿te llegó bien?" ocho meses después no es un seguimiento, es una torpeza.
SEG_HITOS = [
    ("inicial", 3, 14),
    ("satisfaccion", 30, 45),
    ("recompra", 90, None),
]
SEG_COOLDOWN_S = 20 * 3600   # como mucho un aviso de seguimiento al día


def seguimientos_vencidos(registro, ahora_ms=None) -> list:
    """De /seguimientos, cuáles tocan hoy.

    Cada entrada es {ts: <momento de la venta>, hecho: <hito ya atendido>} y
    NADA MÁS. Ni nombre ni teléfono: /pedidos/$id es de lectura pública y este
    repo no tiene autenticación para el cliente, así que el dato personal se
    queda en el localStorage del panel (ver CLAUDE.md). Aquí solo hacen falta
    fechas para saber CUÁNTOS avisos tocan; a quién escribirle lo resuelve el
    panel, que sí tiene los datos.
    """
    ahora_ms = ahora_ms if ahora_ms is not None else time.time() * 1000
    if not isinstance(registro, dict):
        return []
    vencidos = []
    for venta_id, v in registro.items():
        if not isinstance(v, dict):
            continue
        ts = _num(v.get("ts"), None)
        if not ts or ts <= 0:
            continue
        dias = int((ahora_ms - ts) // 86400000)
        if dias < 0:
            continue
        hecho = str(v.get("hecho") or "")
        i_hecho = next((i for i, h in enumerate(SEG_HITOS) if h[0] == hecho), -1)
        elegido = None
        for i, (hito, cuando, ventana) in enumerate(SEG_HITOS):
            if dias < cuando:
                break
            if i <= i_hecho:
                continue                       # ese hito ya se atendió
            if ventana is not None and dias > cuando + ventana:
                continue                       # se pasó de tarde
            elegido = hito
        if elegido:
            vencidos.append({"venta": str(venta_id), "hito": elegido, "dias": dias})
    return vencidos


SEG_CADUCIDAD_DIAS = 400


def _podar_seguimientos(ref, registro, ahora_ms):
    """Borra lo que ya no puede generar ningún hito. El nodo es un apunte de
    trabajo, no un histórico: el histórico son las ventas."""
    if not isinstance(registro, dict):
        return
    for venta_id, v in list(registro.items()):
        if not isinstance(v, dict):
            continue
        ts = _num(v.get("ts"), None)
        caduco = not ts or (ahora_ms - ts) > SEG_CADUCIDAD_DIAS * 86400000
        if caduco or v.get("hecho") == SEG_HITOS[-1][0]:
            try:
                ref.child(str(venta_id)).delete()
                registro.pop(venta_id, None)
            except Exception:
                pass


def procesar_seguimientos(messaging_api, database, ultimo_push):
    """Avisa al teléfono del dueño de a cuántos clientes toca escribirles.

    El seguimiento post-venta existía —tm-crm.src.js calcula los hitos y el tab
    Clientes los pinta con el WhatsApp ya escrito— pero no avisaba de nada: solo
    aparecía si al dueño se le ocurría abrir el panel y entrar en esa pestaña,
    que es justo lo que no pasa. Sin recordatorio, el seguimiento no existe.
    """
    if not es_hora_diurna():
        return                                  # el móvil del dueño también duerme
    ahora = time.time()
    try:
        previo = float(ultimo_push.get("seguimientos", 0) or 0)
    except (TypeError, ValueError):
        previo = 0.0
    if previo and (ahora - previo) < SEG_COOLDOWN_S:
        return
    ref = database.reference("seguimientos")
    try:
        registro = ref.get()
    except Exception as e:
        print(f"⚠️ No se pudo leer /seguimientos: {e}", file=sys.stderr)
        return
    _podar_seguimientos(ref, registro, ahora * 1000)
    vencidos = seguimientos_vencidos(registro, ahora * 1000)
    if not vencidos:
        return
    n = len(vencidos)
    detalle = {}
    for v in vencidos:
        detalle[v["hito"]] = detalle.get(v["hito"], 0) + 1
    partes = []
    if detalle.get("inicial"):
        partes.append(f"{detalle['inicial']} recién comprado(s)")
    if detalle.get("satisfaccion"):
        partes.append(f"{detalle['satisfaccion']} al mes")
    if detalle.get("recompra"):
        partes.append(f"{detalle['recompra']} para recompra")
    cuerpo = ("Pregúntales cómo les ha ido con el equipo. "
              + (", ".join(partes) + ". " if partes else "")
              + "Abre Clientes → Seguimiento: el mensaje sale escrito.")
    titulo = ("📞 1 cliente por contactar" if n == 1
              else f"📞 {n} clientes por contactar")
    if enviar_push_admin(messaging_api, database, titulo, cuerpo,
                         link="/admin.html#clientes", tag="admin-seguimiento"):
        ultimo_push["seguimientos"] = ahora


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
    ultimo_push = cola.setdefault("ultimo_push", {})

    # Solicitudes manuales del admin — siempre procesadas primero, sin restricción horaria
    try:
        procesar_admin_requests(msg_api, db_api, cola)
    except Exception as e:
        print(f"⚠️ Error procesando solicitudes admin: {e}", file=sys.stderr)

    # La detección corre en TODAS las pasadas, también en las del cron con
    # SOLO_FLUSH. Antes solo miraba en la disparada por push a productos.json, y
    # si esa corrida se saltaba ([skip ci] en el commit) o fallaba, el cambio no
    # lo veía nadie nunca más. Comparando contra el estado guardado en la base
    # esto es idempotente: en cuanto se apunta lo que hay, la pasada siguiente
    # no encuentra diferencia.
    try:
        c_act = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
        p_act = json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"❌ Error leyendo JSON de datos: {e}", file=sys.stderr)
        return 1

    estado = cargar_estado(db_api)
    if not estado.get("catalogo"):
        print("ℹ️ Sin estado previo del catálogo: se apunta el actual y no se "
              "notifica nada en esta pasada.")
    cambios = detectar_cambios_catalogo(estado.get("catalogo"), p_act)
    tasa = detectar_tasa(c_act, estado.get("tasa"))
    if cambios["nuevos"] or cambios["rebajas"] or cambios["restock"]:
        print(f"🔎 Cambios: {len(cambios['nuevos'])} nuevo(s), "
              f"{len(cambios['rebajas'])} rebaja(s), {len(cambios['restock'])} reposición(es)")

    if tasa:
        ta_nueva = tasa[0]
        # Solo encolar si esta tasa exacta no fue ya notificada antes
        if cola.get("ultima_tasa_notificada") != ta_nueva:
            cola["tasa_pendiente"] = list(tasa)
        else:
            print(f"ℹ️ Tasa {ta_nueva} ya fue notificada anteriormente. Se omite.")
    cola["nuevos_pendientes"].extend(cambios["nuevos"])
    cola["rebajas_pendientes"].extend(cambios["rebajas"])

    # Restock: notificación inmediata, no pasa por la cola ni espera al lote.
    if cambios["restock"]:
        try:
            procesar_restock(msg_api, db_api, cambios["restock"], ultimo_push)
        except Exception as e:
            print(f"⚠️ Error procesando restock: {e}")

    # Rebajas: aviso dirigido e inmediato a quienes tienen el producto
    # en ❤️ Me Gusta, además del aviso genérico por cola (más abajo).
    if cambios["rebajas"]:
        try:
            procesar_avisos_precio(msg_api, db_api, cambios["rebajas"])
        except Exception as e:
            print(f"⚠️ Error procesando avisos de precio (wishlist): {e}")

    # Apuntar cómo queda el catálogo. Va aquí, ya encolado lo detectado: si el
    # envío de más abajo falla, lo pendiente sigue en la cola y sale en la
    # siguiente pasada — pero el cambio no se vuelve a detectar como nuevo.
    tasa_hoy = _num(c_act.get("tasaMN"))
    guardar_estado(db_api, p_act, tasa_hoy if tasa_hoy > 0 else None)

    # Seguimiento post-venta: recordarle al dueño a quién toca escribirle.
    try:
        procesar_seguimientos(msg_api, db_api, ultimo_push)
    except Exception as e:
        print(f"⚠️ Error procesando seguimientos: {e}", file=sys.stderr)

    # Serie diaria de suscriptores, para que el panel pueda enseñar si sube o
    # baja en vez de un número suelto sin contexto.
    n_subs = apuntar_suscriptores_del_dia(db_api, hora_local_cuba().strftime("%Y-%m-%d"))
    if n_subs is not None:
        print(f"👥 Suscriptores hoy: {n_subs}")

    # Antes de anunciar nada, volver a mirar el catálogo. La cola se llena en
    # cada ejecución del cron pero solo se vacía en horario diurno, así que
    # entre que algo entra y sale pueden pasar horas — y lo que se manda es un
    # texto congelado que el teléfono deja en pantalla hasta que alguien lo
    # aparta. Un aviso que dice "4 productos rebajados" cuando uno ya se agotó
    # no se corrige solo: se queda mintiendo todo el día.
    catalogo = p_act if isinstance(p_act, list) else []
    if catalogo:
        antes_reb, antes_nue = len(cola["rebajas_pendientes"]), len(cola["nuevos_pendientes"])
        cola["rebajas_pendientes"] = rebajas_vigentes(cola["rebajas_pendientes"], catalogo)
        cola["nuevos_pendientes"] = nuevos_vigentes(cola["nuevos_pendientes"], catalogo)
        if antes_reb != len(cola["rebajas_pendientes"]) or antes_nue != len(cola["nuevos_pendientes"]):
            print(f"🧹 Cola depurada: rebajas {antes_reb}→{len(cola['rebajas_pendientes'])}, "
                  f"nuevos {antes_nue}→{len(cola['nuevos_pendientes'])}")

    # Lógica de envío
    avisos = []
    diurno = es_hora_diurna()
    fecha_hoy = hora_local_cuba().strftime("%Y-%m-%d")
    ahora_s = time.time()
    # Qué se saca de la cola en esta pasada, para que el guardado no lo reponga
    # desde el nodo (ver _fusionar_cola).
    consumidos = {}

    def _vaciar(clave):
        consumidos[clave] = {_clave_item(x) for x in _fb_to_list(cola.get(clave))}
        cola[clave] = []

    def _en_descanso(tipo):
        """MIN_HORAS_ENTRE_PUSH desde el último aviso de ese tipo.

        Red de seguridad: aunque algo vuelva a encolar lo mismo, el cliente no
        recibe dos veces el mismo tipo de aviso en la misma tarde. La constante
        llevaba definida desde el principio sin que nadie la usara.
        """
        try:
            previo = float(ultimo_push.get("tipo_" + tipo, 0) or 0)
        except (TypeError, ValueError):
            return False
        if previo and (ahora_s - previo) < MIN_HORAS_ENTRE_PUSH * 3600:
            faltan = int((MIN_HORAS_ENTRE_PUSH * 3600 - (ahora_s - previo)) / 3600) + 1
            print(f"⏭️ '{tipo}' en descanso: se avisó hace poco (faltan ~{faltan} h).")
            return True
        return False

    # 1. Tasa (Inmediato si diurno)
    if cola["tasa_pendiente"] and diurno and not _en_descanso("tasa"):
        ta, tp = cola["tasa_pendiente"]
        txt = f"¡Bajó el dólar! 1 USD = {ta} MN" if ta < tp else f"Nueva tasa: 1 USD = {ta} MN"
        title = "💱 ¡Bajó el Dólar!" if ta < tp else "💱 Cambio de Tasa"
        avisos.append({"tipo": "tasa", "title": title, "body": txt, "link": "/", "imagen": None})

    # 2. Rebajas (Inmediato si diurno)
    #
    # La cola dice CUÁNDO avisar —algo bajó de precio desde la última pasada—,
    # pero el número que va en el título sale del catálogo: es lo que el cliente
    # va a contar al abrir la tienda. Contar la cola daba un número más bajo (un
    # producto rebajado ayer sigue rebajado y no está en la cola de hoy) y el
    # aviso parecía equivocado aunque la cola estuviera bien.
    if cola["rebajas_pendientes"] and diurno and not _en_descanso("rebajas"):
        visibles = ofertas_visibles(catalogo) if catalogo else cola["rebajas_pendientes"]
        if len(visibles) == 1:
            v = visibles[0]
            avisos.append({"tipo": "rebajas", "title": "🏷️ ¡Rebaja!",
                           "body": f"{v.get('nombre')} ahora a ${int(_num(v.get('precioActual')))}",
                           "link": f"/p/producto-{v.get('id')}.html", "imagen": v.get("imagen"),
                           "icono": v.get("imagen")})
        elif len(visibles) > 1:
            # El aviso también entra por los ojos: se enseña el que MÁS ha
            # bajado, que es el que da ganas de abrir la tienda. Sin foto, "3
            # productos rebajados" es una línea de texto entre otras veinte.
            gancho = mas_rebajado(visibles)
            avisos.append({"tipo": "rebajas", "title": f"🏷️ {len(visibles)} productos rebajados",
                           "body": (f"Empezando por {gancho.get('nombre')} a "
                                    f"${int(_num(gancho.get('precioActual')))}. Míralos en la tienda."
                                    if gancho else "Revisa las nuevas ofertas en la tienda"),
                           "link": "/", "imagen": gancho.get("imagen") if gancho else None,
                           "icono": gancho.get("imagen") if gancho else None})
        else:
            # Bajó de precio y se agotó antes de que abriera el horario de envío:
            # no hay nada que ir a ver.
            print("ℹ️ Rebajas en cola pero ninguna oferta disponible ahora; no se avisa.")
            _vaciar("rebajas_pendientes")

    # 3. Nuevos productos (Inmediato si diurno, igual que rebajas)
    if (cola["nuevos_pendientes"] and diurno
            and cola.get("ultimo_lote_fecha") != fecha_hoy
            and not _en_descanso("nuevos")):
        pendientes = cola["nuevos_pendientes"]
        n = len(pendientes)
        primero = pendientes[0]
        titulo = "🆕 ¡Nuevo producto!" if n == 1 else f"🆕 {n} Productos Nuevos"
        cuerpo = (primero.get("nombre") or "Entra a verlo") if n == 1 else \
                 f"Llegó {primero.get('nombre')} y {n - 1} más. Entra a verlos."
        # Con foto también cuando son varios: se enseña el primero.
        avisos.append({"tipo": "nuevos", "title": titulo, "body": cuerpo,
                       "link": f"/p/producto-{primero.get('id')}.html" if n == 1 else "/",
                       "imagen": primero.get("imagen"), "icono": primero.get("imagen")})

    # Ejecutar envíos. Cada lista que se vacía se anota en `consumidos`: sin eso
    # el guardado la encontraba en `current` y la devolvía a su sitio, que es lo
    # que dejaba las rebajas dando vueltas para siempre.
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
                enviar_push_fcm(msg_api, db_api, tokens, [], a["title"], a["body"],
                                a["link"], a["imagen"], icono=a.get("icono"))
                ultimo_push["tipo_" + a["tipo"]] = ahora_s
                if a["tipo"] == "tasa":
                    ta_enviada = cola["tasa_pendiente"][0] if cola["tasa_pendiente"] else None
                    cola["tasa_pendiente"] = None
                    if ta_enviada is not None:
                        cola["ultima_tasa_notificada"] = ta_enviada
                elif a["tipo"] == "rebajas":
                    _vaciar("rebajas_pendientes")
                elif a["tipo"] == "nuevos":
                    _vaciar("nuevos_pendientes")
                    cola["ultimo_lote_fecha"] = fecha_hoy
        else:
            print("⚠️ No hay ningún suscriptor en /tokens: no se envía nada. "
                  "Lo pendiente se queda en la cola.")

    guardar_cola(db_api, cola, consumidos)
    return 0

if __name__ == "__main__":
    sys.exit(main())
