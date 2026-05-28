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

sys.path.insert(0, str(Path(__file__).parent))
from send_notifications import (
    cargar_cola, guardar_cola, init_firebase, cargar_tokens,
    enviar_push_fcm, construir_aviso_nuevos, construir_aviso_rebajas,
    construir_aviso_tasa
)


def main() -> int:
    print(f"🧪 TEST PUSH MANUAL — {datetime.now().isoformat()}")
    print("=" * 60)

    try:
        config_actual = json.loads(Path("config.json").read_text(encoding="utf-8"))
    except Exception as e:
        print(f"❌ Error config.json: {e}")
        return 1

    messaging, db, cred = init_firebase(config_actual)
    if not messaging:
        print("❌ Firebase no inicializa. Revisa FIREBASE_SERVICE_ACCOUNT.")
        return 1

    tokens, keys, ref = cargar_tokens(db)
    print(f"📱 Suscriptores: {len(tokens)}")
    if not tokens:
        print("❌ Sin suscriptores. Activa notificaciones primero.")
        return 1

    cola = cargar_cola()
    enviados = []

    if cola.get("rebajas_pendientes"):
        print(f"\n🏷️  {len(cola['rebajas_pendientes'])} rebaja(s) en cola, enviando...")
        title, body, link, img = construir_aviso_rebajas(cola["rebajas_pendientes"])
        try:
            enviar_push_fcm(messaging, ref, tokens, keys,
                           title, body, link, img, "tm-test-ofertas")
            print(f"   ✅ {title}")
            cola["rebajas_pendientes"] = []
            enviados.append("rebajas")
        except Exception as e:
            print(f"   ❌ {e}")

    if cola.get("nuevos_pendientes"):
        print(f"\n🆕 {len(cola['nuevos_pendientes'])} nuevo(s) en cola, enviando...")
        title, body, link, img = construir_aviso_nuevos(cola["nuevos_pendientes"])
        try:
            enviar_push_fcm(messaging, ref, tokens, keys,
                           title, body, link, img, "tm-test-nuevos")
            print(f"   ✅ {title}")
            cola["nuevos_pendientes"] = []
            enviados.append("nuevos")
        except Exception as e:
            print(f"   ❌ {e}")

    if cola.get("tasa_pendiente"):
        ta, tp = cola["tasa_pendiente"]
        aviso = construir_aviso_tasa(ta, tp)
        if aviso:
            title, body, link, img = aviso
            try:
                enviar_push_fcm(messaging, ref, tokens, keys,
                               title, body, link, img, "tm-test-tasa")
                print(f"   ✅ {title}")
                cola["tasa_pendiente"] = None
                enviados.append("tasa")
            except Exception as e:
                print(f"   ❌ {e}")

    if not enviados:
        print("\n📭 Cola vacía. Enviando push de PRUEBA genérico...")
        try:
            enviar_push_fcm(
                messaging, ref, tokens, keys,
                "🧪 Prueba de notificaciones",
                f"Test ejecutado a las {datetime.now().strftime('%H:%M')} — Si ves esto, ¡todo funciona! 🎉",
                "/", None, "tm-test-prueba"
            )
            print("   ✅ Push de prueba enviado")
            enviados.append("prueba")
        except Exception as e:
            print(f"   ❌ {e}")
            return 1

    guardar_cola(cola)
    print(f"\n✅ Test completado. Enviados: {', '.join(enviados)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
