#!/usr/bin/env python3
"""
TiendaMax — recordatorio mensual de la comisión por cobrar.

El dueño paga la comisión del gestor una vez al mes, y el gestor solo lo ve si
abre el panel. El día 1 (comisión_pendiente.yml) llega un aviso a Telegram con
lo que ya está en meses CERRADOS y aún sin cobrar.

Los números NO se calculan aquí: los calcula el panel (comisResumen en
admin.html) y los deja en /privado/comision_pendiente como
    {"ts": <ms>, "meses": {"2026-10": {"usd": 38.0, "mn": 1800.0, "n": 3}, ...}}
Recalcularlos en el servidor daría una cifra distinta a la de la pantalla (las
ventas anuladas viven solo en el teléfono) y esas son las que nadie re-cuenta.
Aquí solo se decide qué meses están cerrados, se suman POR MONEDA —USD y MN no
se suman nunca— y se escribe el mensaje.

Si no hay nada pendiente en meses cerrados, no se manda nada: un aviso vacío
enseña a ignorar los que importan.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
# Si el panel lleva más de esto sin abrirse, el resumen puede estar viejo: se avisa de ello.
DIAS_RESUMEN_VIEJO = 20


def _num(v) -> float:
    try:
        x = float(v)
        return x if x == x else 0.0
    except (TypeError, ValueError):
        return 0.0


def _nombre_mes(clave: str) -> str:
    try:
        y, m = clave.split("-")
        return f"{MESES[int(m) - 1]} de {int(y)}"
    except Exception:
        return clave


def _usd(x: float) -> str:
    return f"${x:,.2f}".rstrip("0").rstrip(".") if abs(x - round(x)) > 1e-9 else f"${int(round(x)):,}"


def _mn(x: float) -> str:
    return f"{int(round(x)):,} MN" if abs(x - round(x)) < 1e-9 else f"{x:,.2f} MN"


def _dos_monedas(usd: float, mn: float) -> str:
    partes = []
    if usd > 0:
        partes.append(_usd(usd))
    if mn > 0:
        partes.append(_mn(mn))
    return " + ".join(partes) or "$0"


def meses_cerrados(resumen: dict, hoy: datetime) -> list[tuple[str, float, float, int]]:
    """[(mes, usd, mn, ventas)] de los meses ya terminados, del más viejo al más nuevo."""
    clave_hoy = f"{hoy.year:04d}-{hoy.month:02d}"
    out = []
    meses = (resumen or {}).get("meses")
    if not isinstance(meses, dict):
        return out
    for k, v in meses.items():
        if not isinstance(v, dict) or not isinstance(k, str) or len(k) != 7 or k >= clave_hoy:
            continue
        usd, mn, n = _num(v.get("usd")), _num(v.get("mn")), int(_num(v.get("n")))
        if usd > 0 or mn > 0:
            out.append((k, usd, mn, n))
    return sorted(out)


def armar_aviso(resumen: dict | None, hoy: datetime) -> str | None:
    """El texto, o None si no hay nada pendiente en meses cerrados."""
    cerrados = meses_cerrados(resumen or {}, hoy)
    if not cerrados:
        return None
    tot_usd = sum(c[1] for c in cerrados)
    tot_mn = sum(c[2] for c in cerrados)
    n_ventas = sum(c[3] for c in cerrados)
    lineas = ["💵 Comisión por cobrar", ""]
    for k, usd, mn, n in cerrados:
        lineas.append(f"• {_nombre_mes(k).capitalize()}: {_dos_monedas(usd, mn)} ({n} venta{'s' if n != 1 else ''})")
    if len(cerrados) > 1:
        lineas += ["", f"Total de meses cerrados: {_dos_monedas(tot_usd, tot_mn)} en {n_ventas} ventas."]
    lineas += ["", "Eso ya te lo debe el dueño: los meses están cerrados."]
    ts = _num((resumen or {}).get("ts"))
    if ts:
        dias = (hoy - datetime.fromtimestamp(ts / 1000, tz=timezone.utc)).days
        if dias >= DIAS_RESUMEN_VIEJO:
            lineas.append(f"⚠️ Este resumen es de hace {dias} días (la última vez que abriste el panel): "
                          "puede que ya hayas cobrado algo. Ábrelo y revisa Ventas → Comisión por cobrar.")
    lineas.append("Cuando te paguen, márcalo en el panel: Ventas → Comisión por cobrar → «Me pagaron».")
    return "\n".join(lineas)


def _leer_resumen():
    import firebase_admin
    from firebase_admin import credentials, db

    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa:
        print("❌ FIREBASE_SERVICE_ACCOUNT no configurada.", file=sys.stderr)
        return None
    cred_dict = json.loads(sa)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(cred_dict), {
            "databaseURL": f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"})
    return db.reference("/privado/comision_pendiente").get()


def main() -> int:
    import requests

    resumen = _leer_resumen()
    if resumen is None:
        print("Sin resumen en /privado/comision_pendiente (¿no se ha abierto el panel desde que existe?). No se manda nada.")
        return 0
    texto = armar_aviso(resumen, datetime.now(timezone.utc))
    if not texto:
        print("Nada pendiente en meses cerrados: no se manda nada.")
        return 0
    token, chat = os.environ["BOT_TOKEN"], os.environ["ADMIN_CHAT_ID"]
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      json={"chat_id": chat, "text": texto[:3900]}, timeout=12)
    r.raise_for_status()
    print("✅ Aviso enviado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
