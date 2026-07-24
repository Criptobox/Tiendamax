#!/usr/bin/env python3
"""
TiendaMax — herramienta de un solo uso: corrige analytics/vistas/<id>/count
en Firebase RTDB (para bajar un contador inflado por pruebas del propio
admin, hechas antes del fix en js/analytics.js que ya excluye su navegador).

Se borra después de usarse — no es parte del pipeline normal.
"""
import json
import os
import sys


def main() -> int:
    producto_id = os.environ.get("PRODUCTO_ID", "").strip()
    nuevo_str = os.environ.get("NUEVO_COUNT", "").strip()
    if not producto_id or not nuevo_str:
        print("❌ Faltan PRODUCTO_ID / NUEVO_COUNT.", file=sys.stderr)
        return 1
    nuevo = int(nuevo_str)

    import firebase_admin
    from firebase_admin import credentials, db

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa_json:
        print("❌ FIREBASE_SERVICE_ACCOUNT no configurada.", file=sys.stderr)
        return 1
    cred_dict = json.loads(sa_json)
    cred = credentials.Certificate(cred_dict)
    db_url = f"https://{cred_dict['project_id']}-default-rtdb.firebaseio.com"
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {"databaseURL": db_url})

    ref = db.reference(f"analytics/vistas/{producto_id}/count")
    antes = ref.get()
    ref.set(nuevo)
    print(f"✅ analytics/vistas/{producto_id}/count: {antes} -> {nuevo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
