#!/usr/bin/env python3
"""
TiendaMax — Alertas Admin Telegram + Copiloto
Corre cada 30 min via GitHub Actions (admin-alerts.yml).
Envía alertas útiles sin spamear:
- nuevos suscriptores push
- nuevos interesados / pedidos por WhatsApp
- nuevas entradas de lista de espera
- resumen Copiloto cada ~6 horas si hay acciones importantes
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

BOT_TOKEN = os.environ["BOT_TOKEN"]
ADMIN_CHAT_ID = os.environ["ADMIN_CHAT_ID"]
ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("America/Havana")


def send_telegram(text: str) -> None:
    # Sin parse_mode para evitar que nombres con _, *, ®, etc. rompan el mensaje.
    r = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": ADMIN_CHAT_ID, "text": text[:3900]},
        timeout=12,
    )
    r.raise_for_status()


def init_firebase():
    import firebase_admin
    from firebase_admin import credentials, db

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_json:
        print("❌ FIREBASE_SERVICE_ACCOUNT no configurada.", file=sys.stderr)
        return None
    try:
        cred_dict = json.loads(sa_json)
        cred = credentials.Certificate(cred_dict)
        db_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {"databaseURL": db_url})
        return db
    except Exception as e:
        print(f"❌ Error Firebase: {e}", file=sys.stderr)
        return None


def load_products() -> list[dict]:
    try:
        return json.loads((ROOT / "productos.json").read_text(encoding="utf-8"))
    except Exception as e:
        print(f"⚠️ No pude leer productos.json: {e}", file=sys.stderr)
        return []


def n(v, default=0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def short(s: str, max_len: int = 54) -> str:
    s = str(s or "").replace("\n", " ").strip()
    return s if len(s) <= max_len else s[: max_len - 1] + "…"


def flatten_interesados(tree) -> list[dict]:
    out: list[dict] = []
    if not isinstance(tree, dict):
        return out
    for pid, entries in tree.items():
        if not isinstance(entries, dict):
            continue
        for key, e in entries.items():
            if isinstance(e, dict):
                ts = int(n(e.get("ts") or key))
                out.append({**e, "pid": pid, "ts": ts})
    return sorted(out, key=lambda x: x.get("ts", 0), reverse=True)


def flatten_lista_espera(tree) -> list[dict]:
    out: list[dict] = []
    if not isinstance(tree, dict):
        return out
    for pid, entries in tree.items():
        if not isinstance(entries, dict):
            continue
        for key, e in entries.items():
            if isinstance(e, dict):
                ts = int(n(e.get("ts") or key))
                out.append({**e, "pid": pid, "ts": ts})
    return sorted(out, key=lambda x: x.get("ts", 0), reverse=True)


def count_map(node) -> dict[str, int]:
    out: dict[str, int] = {}
    if not isinstance(node, dict):
        return out
    for pid, v in node.items():
        if isinstance(v, dict):
            out[str(pid)] = int(n(v.get("count")))
        else:
            out[str(pid)] = int(n(v))
    return out


def _subscriber_identity(t: dict) -> str | None:
    """Identidad estable de un suscriptor push, para no confundir "el mismo
    dispositivo con carnet nuevo" con un alta/baja real.

    js/push-fix.js guarda cada token bajo la clave 'deviceId' (localStorage +
    IndexedDB + cookie de 1 año) — pero si las 3 capas de almacenamiento del
    navegador del suscriptor no persisten (modo privado, extensiones que
    limpian el sitio, iOS con storage muy agresivo), esa clave cambia en
    cada visita. El dedup de escribirTokenRTDB() entonces borra la entrada
    vieja (mismo 'token' FCM) y crea una con la clave nueva — que hace ver
    como "1 nuevo + 1 cancelado, mismo total" en cada corrida, aunque sea el
    mismo suscriptor de siempre.

    'fingerprint' (huella de user-agent + pantalla + idioma + huso horario)
    sí sobrevive ese borrado porque se recalcula del hardware/navegador, no
    se guarda — por eso se prioriza acá para decidir altas/bajas reales.
    deviceId/token quedan de respaldo cuando no hay fingerprint (tokens
    viejos, de antes de que existiera ese campo).
    """
    if not isinstance(t, dict) or not t.get("token"):
        return None
    if t.get("fingerprint"):
        return "fp:" + str(t["fingerprint"])
    if t.get("deviceId"):
        return "did:" + str(t["deviceId"])
    return "tk:" + str(t["token"])


def _diff_suscriptores(known_ids: set[str], current_ids: set[str],
                       first_run: bool) -> list[str]:
    """Decide qué alertar comparando el set conocido con el actual. Reglas,
    pensadas para NO spamear con altas/bajas falsas (el bug reportado):

    - Primera corrida: no se avisa nada, solo se aprende el estado actual.
    - Conjuntos disjuntos (nada en común) con ambos no vacíos: NO es churn
      real, es que cambió CÓMO se calcula la identidad (una migración de
      formato como la que introdujo el fix anterior) o un reseteo masivo.
      Se re-sincroniza en silencio en vez de gritar "N entraron + N salieron".
    - Si solo hubo altas → una alerta de altas. Solo bajas → una de bajas.
    - Si hubo altas Y bajas a la vez (raro con identidad estable): se reporta
      SOLO el neto, nunca "N nuevos + N cancelaron" con el mismo número —
      eso es justo la contradicción sin sentido que veía el admin. Si el
      neto es 0 (entró y salió la misma cantidad), no se avisa nada.
    """
    if first_run:
        return []
    nuevos = current_ids - known_ids
    perdidos = known_ids - current_ids
    overlap = current_ids & known_ids
    total = len(current_ids)

    # Migración de formato de identidad / reseteo masivo → resync silencioso.
    if known_ids and current_ids and not overlap:
        return []

    if nuevos and not perdidos:
        return [f"🔔 {len(nuevos)} nuevo(s) suscriptor(es) push. Total: {total}"]
    if perdidos and not nuevos:
        return [f"📉 {len(perdidos)} suscriptor(es) cancelaron push. Total: {total}"]
    if nuevos and perdidos:
        net = len(current_ids) - len(known_ids)
        if net > 0:
            return [f"🔔 {net} nuevo(s) suscriptor(es) push. Total: {total}"]
        if net < 0:
            return [f"📉 {-net} suscriptor(es) cancelaron push. Total: {total}"]
        # Neto 0: entró y salió la misma cantidad → no avisar (no es spam útil).
    return []


def _alertas_suscriptores(db, meta: dict) -> list[str]:
    """Lee /tokens, calcula identidades estables y devuelve las alertas.
    Actualiza meta['known_token_ids'] con el estado actual para la próxima
    corrida. Aislado de main() para poder testear _diff_suscriptores() puro."""
    try:
        tokens = db.reference("tokens").get() or {}
    except Exception as e:
        print(f"⚠️ Error leyendo tokens: {e}", file=sys.stderr)
        return []
    current_ids: set[str] = (
        {_subscriber_identity(t) for t in tokens.values() if _subscriber_identity(t)}
        if isinstance(tokens, dict) else set()
    )
    known_ids: set[str] = set(meta.get("known_token_ids") or [])
    first_run = not known_ids and "known_token_ids" not in meta
    if first_run:
        print(f"Primera ejecución tokens: {len(current_ids)} registrados como conocidos.")
    msgs = _diff_suscriptores(known_ids, current_ids, first_run)
    meta["known_token_ids"] = list(current_ids)
    return msgs


def build_copilot_digest(db, meta: dict, products: list[dict]) -> str | None:
    now_dt = datetime.now(TZ)
    last_iso = meta.get("copilot_last_digest")
    if last_iso:
        try:
            last = datetime.fromisoformat(last_iso)
            if last.tzinfo is None:
                last = last.replace(tzinfo=TZ)
            if now_dt - last < timedelta(hours=6):
                return None
        except Exception:
            pass

    by_id = {str(p.get("id")): p for p in products}
    low = [p for p in products if p.get("activo") is not False and 0 < n(p.get("stock")) <= 2]
    empty = [p for p in products if p.get("activo") is not False and n(p.get("stock")) == 0]

    analytics = db.reference("analytics").get() or {}
    vistas = count_map(((analytics or {}).get("vistas") or {}))
    whats = count_map(((analytics or {}).get("whatsapp") or {}))
    interesados = flatten_interesados(db.reference("interesados").get() or {})
    lista = flatten_lista_espera(db.reference("lista_espera").get() or {})
    avisos = db.reference("avisos_stock").get() or {}
    avisos_total = sum(len(v) for v in avisos.values() if isinstance(v, dict)) if isinstance(avisos, dict) else 0

    hot = []
    for p in products:
        pid = str(p.get("id"))
        score = vistas.get(pid, 0) + whats.get(pid, 0) * 7 + max(0, 4 - int(n(p.get("stock")))) * 3
        if score > 0:
            hot.append((score, p, vistas.get(pid, 0), whats.get(pid, 0)))
    hot.sort(key=lambda x: x[0], reverse=True)

    has_action = bool(low or empty or interesados[:1] or lista[:1] or avisos_total or hot[:1])
    if not has_action:
        return None

    lines = [
        "🤖 TiendaMax Copiloto",
        now_dt.strftime("%d/%m/%Y %I:%M %p"),
        "",
    ]
    if hot[:3]:
        lines.append("🔥 Productos calientes:")
        for score, p, v, w in hot[:3]:
            lines.append(f"• {short(p.get('nombre'))} — {v} vistas / {w} WhatsApp / stock {int(n(p.get('stock')))}")
        lines.append("")
    if interesados:
        lines.append(f"💬 Interesados recientes: {len(interesados)}")
        for it in interesados[:3]:
            name = it.get("producto") or by_id.get(str(it.get("pid")), {}).get("nombre") or it.get("pid")
            lines.append(f"• {short(name)} — {datetime.fromtimestamp(it.get('ts',0)/1000, TZ).strftime('%H:%M') if it.get('ts') else 's/hora'}")
        lines.append("")
    if lista:
        lines.append(f"⏳ Lista de espera: {len(lista)} entrada(s)")
    if avisos_total:
        lines.append(f"🔔 Avisos de stock pendientes: {avisos_total}")
    if low:
        lines.append(f"⚠️ Stock bajo: {len(low)} producto(s) — " + ", ".join(short(p.get("nombre"), 24) for p in low[:3]))
    if empty:
        lines.append(f"🔴 Agotados: {len(empty)} producto(s)")

    lines += [
        "",
        "Acción sugerida:",
        "1) Publica el producto caliente de arriba.",
        "2) Contacta interesados sin atender.",
        "3) Repón o marca como prioridad los agotados con espera.",
    ]
    meta["copilot_last_digest"] = now_dt.isoformat()
    return "\n".join(lines)


def main() -> int:
    db = init_firebase()
    if not db:
        return 1

    meta_ref = db.reference("admin_meta")
    meta = meta_ref.get() or {}
    products = load_products()

    alertas: list[str] = []

    # 1) Suscriptores push nuevos / perdidos
    for msg in _alertas_suscriptores(db, meta):
        alertas.append(msg)

    # 2) Interesados nuevos
    try:
        interesados = flatten_interesados(db.reference("interesados").get() or {})
        last_ts = int(n(meta.get("known_interesados_ts")))
        nuevos = [x for x in interesados if int(n(x.get("ts"))) > last_ts]
        if last_ts and nuevos:
            lines = [f"💬 {len(nuevos)} nuevo(s) interesado(s) en TiendaMax"]
            for it in nuevos[:5]:
                lines.append("• " + short(it.get("producto") or it.get("pid")))
            alertas.append("\n".join(lines))
        if interesados:
            meta["known_interesados_ts"] = max(int(n(x.get("ts"))) for x in interesados)
    except Exception as e:
        print(f"⚠️ Error leyendo interesados: {e}", file=sys.stderr)

    # 3) Lista de espera nueva
    try:
        lista = flatten_lista_espera(db.reference("lista_espera").get() or {})
        last_ts = int(n(meta.get("known_lista_espera_ts")))
        nuevos = [x for x in lista if int(n(x.get("ts"))) > last_ts]
        if last_ts and nuevos:
            alertas.append(f"⏳ {len(nuevos)} nueva(s) entrada(s) en lista de espera.")
        if lista:
            meta["known_lista_espera_ts"] = max(int(n(x.get("ts"))) for x in lista)
    except Exception as e:
        print(f"⚠️ Error leyendo lista_espera: {e}", file=sys.stderr)

    # 4) Digest Copiloto cada 6h si hay acciones
    try:
        digest = build_copilot_digest(db, meta, products)
        if digest:
            alertas.append(digest)
    except Exception as e:
        print(f"⚠️ Error generando digest copiloto: {e}", file=sys.stderr)

    if alertas:
        try:
            send_telegram("\n\n────────────\n\n".join(alertas))
            print(f"✅ {len(alertas)} alerta(s) enviada(s).")
        except Exception as e:
            print(f"❌ Error Telegram: {e}", file=sys.stderr)
            return 1
    else:
        print("Sin alertas nuevas.")

    # update() con solo las claves que este script es dueño, no set() del nodo
    # completo: web_health_agent.py corre con el mismo cron (*/30 * * * *) en un
    # workflow separado y escribe admin_meta/web_health — un set() global podía
    # pisar silenciosamente ese hijo si las dos corridas se solapaban.
    own_keys = {"known_token_ids", "known_interesados_ts",
                "known_lista_espera_ts", "copilot_last_digest"}
    meta_ref.update({k: v for k, v in meta.items() if k in own_keys})
    return 0


if __name__ == "__main__":
    sys.exit(main())
