#!/usr/bin/env python3
"""
Actualiza config.json usando la tasa informal USD→CUP publicada por elTOQUE.

Regla importante del proyecto:
- config.json guarda la TASA BASE de elTOQUE.
- el frontend suma +10 MN al mostrarla al cliente.

Este script NO suma ese margen. Solo guarda la base.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config.json"
URL = "https://eltoque.com/tasas-de-cambio-cuba"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)


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

    # Preferimos la mediana porque coincide mejor con lo que el sitio presenta como referencia.
    raw_rate = usd.get("median")
    if raw_rate is None:
        raw_rate = usd.get("ema_value")
    if raw_rate is None:
        raise RateUpdateError("USD no trae median ni ema_value")

    try:
        rate = float(raw_rate)
    except (TypeError, ValueError) as exc:
        raise RateUpdateError(f"Valor USD inválido en elTOQUE: {raw_rate!r}") from exc

    updated_at = trmi.get("date") or datetime.now(timezone.utc).isoformat()
    return rate, updated_at


def load_config() -> dict[str, Any]:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {}


def save_config(config: dict[str, Any]) -> None:
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    try:
        rate, updated_at = fetch_eltoque_rate()
        config = load_config()

        previous = config.get("tasaMN")
        config["tasaMN"] = round(rate, 2)
        config["tasaFuente"] = "elTOQUE"
        config["tasaActualizada"] = updated_at
        config["actualizado"] = datetime.now(timezone.utc).isoformat()

        save_config(config)

        print(f"Tasa base obtenida de elTOQUE: {rate}")
        print(f"Frontend mostrará: {rate + 10} MN (margen +10)")
        if previous != config["tasaMN"]:
            print(f"Cambio detectado: {previous} -> {config['tasaMN']}")
        else:
            print("La tasa no cambió, pero se actualizó la metadata.")
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
