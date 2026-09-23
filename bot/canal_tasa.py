#!/usr/bin/env python3
"""
TiendaMax — Publica la tasa en el canal de Telegram, solo cuando toca.

La tasa es la del cliente: tasaMN (base elTOQUE) + margenMN, igual que la
tienda y el vale; sin margenMN, 10.

Cuándo toca lo decide scripts/tasa_aviso.py, la misma regla que las
notificaciones push: múltiplos de 5, redondeando de 3 para arriba, y solo si
se aleja lo bastante del último valor publicado. Antes se publicaba en cada
cambio de elTOQUE — 166 mensajes en 30 días, varios por tarde.

El último valor publicado se guarda en config.json (`tasaAvisadaTelegram`),
que el workflow commitea junto con la tasa. La primera vez solo se apunta.
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
import tasa_aviso  # noqa: E402

CONFIG_PATH = RAIZ / "config.json"
CLAVE = "tasaAvisadaTelegram"
TZ = ZoneInfo("America/Havana")


def send(text: str) -> bool:
    r = requests.post(
        f"https://api.telegram.org/bot{os.environ['BOT_TOKEN']}/sendMessage",
        json={"chat_id": os.environ.get("TELEGRAM_CHANNEL", "@TiendaMaxWeb"),
              "text": text, "parse_mode": "Markdown"},
        timeout=10,
    )
    return r.status_code == 200


def guardar(cfg: dict) -> None:
    # Mismo formato que update_rate_from_eltoque.save_config.
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"❌ No se pudo leer config.json: {e}", file=sys.stderr)
        return 1

    cliente = tasa_aviso.tasa_cliente(cfg)
    if cliente is None:
        print("❌ tasaMN no disponible.", file=sys.stderr)
        return 1

    ultima = cfg.get(CLAVE)
    if ultima is None:
        cfg[CLAVE] = tasa_aviso.redondear(cliente)
        guardar(cfg)
        print(f"ℹ️ Primera pasada: se apunta {cfg[CLAVE]} CUP sin publicar.")
        return 0

    nueva = tasa_aviso.toca_avisar(cliente, ultima)
    if nueva is None:
        print(f"ℹ️ Tasa {cliente:.2f} → sigue en {ultima:.0f} CUP a efectos del canal. No se publica.")
        return 0

    hoy = datetime.now(TZ).strftime("%d/%m/%Y")
    mensaje = (
        f"📈 *Tasa del día — {hoy}*\n\n"
        f"💵 1 USD = *{nueva} CUP*\n\n"
        f"🛍️ Visita nuestra tienda: tiendamax.org"
    )
    if not send(mensaje):
        # No se apunta: la próxima pasada lo vuelve a intentar.
        print("❌ Error enviando la tasa al canal.", file=sys.stderr)
        return 1
    cfg[CLAVE] = nueva
    guardar(cfg)
    print(f"✅ Tasa publicada en canal: 1 USD = {nueva} CUP")
    return 0


if __name__ == "__main__":
    sys.exit(main())
