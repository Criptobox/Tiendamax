#!/usr/bin/env python3
"""
Actualiza config.json usando la tasa informal USD→CUP publicada por elTOQUE.

Regla importante del proyecto:
- config.json guarda la TASA BASE de elTOQUE.
- el frontend suma +10 MN al mostrarla al cliente.

Cambios v2:
- Validación de cordura: solo acepta tasas en un rango razonable.
- Si la tasa NO cambió, no se reescribe la metadata: así no se dispara
  el workflow de push notifications todos los días.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

ROOT        = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config.json"
URL         = "https://eltoque.com/tasas-de-cambio-cuba"
USER_AGENT  = (
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)

# Rango aceptable para la tasa USD→CUP (informal).
# Si elTOQUE devuelve algo fuera de aquí, se considera roto y abortamos.
MIN_TASA = 100.0
MAX_TASA = 2000.0


class RateUpdateError(RuntimeError):
    pass


def load_next_data(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    script = soup.find("script", id="__NEXT_DATA__")
    if not script or not script.string:
        raise RateUpdateError("No se encontró __NEXT_DATA__ en el HTML de elTOQUE")
    try:
        return json.loads(script.string)
    except json.JSONDecodeError as exc:
        raise RateUpdateError("No se pudo parsear __NEXT_DATA__") from exc


def fetch_eltoque_rate() -> tuple[float, str]:
    response = requests.get(URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()

    data = load_next_data(response.text)
    trmi = data["props"]["pageProps"]["trmiExchange"]["data"]
    stats = trmi["api"]["statistics"]
    usd = stats.get("USD")
    if not usd:
        raise RateUpdateError("No se encontró la estadística USD en elTOQUE")

    # Preferimos la mediana porque coincide mejor con la referencia mostrada en el sitio.
    raw_rate = usd.get("median")
    source = "median"
    if raw_rate is None:
        raw_rate = usd.get("ema_value")
        source = "ema_value"
    if raw_rate is None:
        raise RateUpdateError("USD no trae median ni ema_value")

    print(f"Fuente de tasa: {source} = {raw_rate}")

    try:
        rate = float(raw_rate)
    except (TypeError, ValueError) as exc:
        raise RateUpdateError(f"Valor USD inválido en elTOQUE: {raw_rate!r}") from exc

    if not (MIN_TASA < rate < MAX_TASA):
        raise RateUpdateError(
            f"Tasa fuera de rango razonable ({MIN_TASA}–{MAX_TASA}): {rate}. "
            "Abortando para no publicar un valor erróneo."
        )

    updated_at = trmi.get("date") or datetime.now(timezone.utc).isoformat()
    return rate, updated_at


def load_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {}


def save_config(config: dict[str, Any]) -> None:
    content = json.dumps(config, ensure_ascii=False, indent=2) + "\n"
    tmp = CONFIG_PATH.parent / f".{CONFIG_PATH.name}.tmp"
    try:
        tmp.write_text(content, encoding="utf-8")
        tmp.replace(CONFIG_PATH)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def main() -> int:
    try:
        rate, updated_at = fetch_eltoque_rate()
        config   = load_config()
        previous = config.get("tasaMN")

        nueva = round(rate, 2)
        anterior = float(previous) if previous is not None else None

        # Si la tasa es exactamente la misma, NO reescribimos el archivo.
        # Así no se dispara el workflow de notificaciones por nada.
        if anterior is not None and abs(anterior - nueva) < 0.01:
            print(f"Tasa sin cambios ({nueva}). No se modifica config.json.")
            return 0

        config["tasaMN"]           = nueva
        config["tasaFuente"]       = "elTOQUE"
        config["tasaActualizada"]  = updated_at
        config["actualizado"]      = datetime.now(timezone.utc).isoformat()
        save_config(config)

        print(f"Tasa base obtenida de elTOQUE: {nueva}")
        print(f"Frontend mostrará: {nueva + 10} MN (margen +10)")
        if anterior is None:
            print(f"Primera escritura de tasaMN: {nueva}")
        else:
            print(f"Cambio de tasa: {anterior} -> {nueva}")
        return 0
    except requests.HTTPError as exc:
        print(f"HTTP error consultando elTOQUE: {exc}", file=sys.stderr)
        return 1
    except RateUpdateError as exc:
        print(f"Error parseando tasa de elTOQUE: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"Error inesperado: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
