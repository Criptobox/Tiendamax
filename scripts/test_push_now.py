#!/usr/bin/env python3
"""
TEST manual: envía push INMEDIATAMENTE sin importar horario.
Útil para probar notificaciones a cualquier hora.

Si la cola tiene rebajas/nuevos/tasa → los envía.
Si la cola está vacía → envía un push genérico de prueba.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from datetime import datetime

# Añadimos el directorio de scripts al path para importar send_notifications
sys.path.insert(0, str(Path(__file__).parent))
from send_notifications import (
    init_firebase,
    cargar_cola,
    guardar_cola,
    enviar_push_fcm,
    SITE_URL,
    ICONO_PUSH,
)


def cargar_tokens(database):
    """Lee los FCM tokens guardados en Firebase Realtime Database."""
    ref = database.reference("tokens")
    tokens_data = ref.get()
    if not tokens_data:
        return [], ref
    tokens = [v["token"] for v in tokens_data.values() if isinstance(v, dict) and v.get("token")]
    return tokens, ref


def construir_aviso_tasa(ta: float, tp: float):
    """Devuelve (title, body, link, imagen) para un cambio de tasa."""
    if ta < tp:
        body = f"¡Bajó el dólar! 1 USD = {ta} MN"
    else:
        body = f"Nueva tasa: 1 USD = {ta} MN"
    return "💱 Cambio de Tasa", body, "/", None


def construir_aviso_rebajas(rebajas: list):
    """Devuelve (title, body, link, imagen) para la primera rebaja pendiente."""
    r = rebajas[0]
    return (
        "🏷️ ¡Rebaja!",
        f"{r['nombre']} ahora a ${r['ahora']}",
        f"/p/producto-{r['id']}.html",
        r.get("imagen"),
    )


def construir_aviso_nuevos(nuevos: list):
    """Devuelve (title, body, link, imagen) para el lote de productos nuevos."""
    n = len(nuevos)
    return (
        f"🆕 {n} Producto{'s' if n != 1 else ''} Nuevo{'s' if n != 1 else ''}",
        "Llegaron novedades, entra a verlas.",
        "/",
        None,
    )


def main() -> int:
    print(f"🧪 TEST PUSH MANUAL — {datetime.now().isoformat()}")
    print("=" * 60)

    # Inicializar Firebase (lee FIREBASE_SERVICE_ACCOUNT del entorno)
    msg_api, db_api = init_firebase()
    if not msg_api or not db_api:
        print("❌ Firebase no inicializa. Revisa FIREBASE_SERVICE_ACCOUNT.")
        return 1

    # Cargar tokens de suscriptores
    tokens, ref_tokens = cargar_tokens(db_api)
    print(f"📱 Suscriptores: {len(tokens)}")
    if not tokens:
        print("❌ Sin suscriptores. Activa notificaciones en el sitio primero.")
        return 1

    # Cargar cola desde Firebase
    cola = cargar_cola(db_api)
    enviados = []

    # ── Rebajas ────────────────────────────────────────────────
    if cola.get("rebajas_pendientes"):
        print(f"\n🏷️  {len(cola['rebajas_pendientes'])} rebaja(s) en cola, enviando...")
        title, body, link, img = construir_aviso_rebajas(cola["rebajas_pendientes"])
        try:
            enviar_push_fcm(msg_api, db_api, tokens, [], title, body, link, img, "tm-test-ofertas")
            print(f"   ✅ {title}: {body}")
            cola["rebajas_pendientes"] = []
            enviados.append("rebajas")
        except Exception as e:
            print(f"   ❌ Error enviando rebajas: {e}")

    # ── Nuevos ─────────────────────────────────────────────────
    if cola.get("nuevos_pendientes"):
        print(f"\n🆕 {len(cola['nuevos_pendientes'])} nuevo(s) en cola, enviando...")
        title, body, link, img = construir_aviso_nuevos(cola["nuevos_pendientes"])
        try:
            enviar_push_fcm(msg_api, db_api, tokens, [], title, body, link, img, "tm-test-nuevos")
            print(f"   ✅ {title}: {body}")
            cola["nuevos_pendientes"] = []
            enviados.append("nuevos")
        except Exception as e:
            print(f"   ❌ Error enviando nuevos: {e}")

    # ── Tasa ───────────────────────────────────────────────────
    if cola.get("tasa_pendiente"):
        ta, tp = cola["tasa_pendiente"]
        title, body, link, img = construir_aviso_tasa(ta, tp)
        print(f"\n💱 Tasa pendiente en cola, enviando...")
        try:
            enviar_push_fcm(msg_api, db_api, tokens, [], title, body, link, img, "tm-test-tasa")
            print(f"   ✅ {title}: {body}")
            cola["tasa_pendiente"] = None
            enviados.append("tasa")
        except Exception as e:
            print(f"   ❌ Error enviando tasa: {e}")

    # ── Push de prueba genérico si la cola estaba vacía ────────
    if not enviados:
        print("\n📭 Cola vacía — enviando push de PRUEBA genérico...")
        try:
            enviar_push_fcm(
                msg_api, db_api, tokens, [],
                "🧪 Prueba de notificaciones",
                f"Test a las {datetime.now().strftime('%H:%M')} — ¡Si ves esto, todo funciona! 🎉",
                "/", None, "tm-test-prueba",
            )
            print("   ✅ Push de prueba enviado")
            enviados.append("prueba")
        except Exception as e:
            print(f"   ❌ Error enviando prueba: {e}")
            return 1

    # Guardar cola actualizada en Firebase
    guardar_cola(db_api, cola)
    print(f"\n✅ Test completado. Enviados: {', '.join(enviados)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
