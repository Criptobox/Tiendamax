#!/usr/bin/env python3
"""
Actualiza config.json usando la tasa informal USD→CUP de elTOQUE.

Soporta dos modos:
  1) API oficial de elTOQUE si configuras ELTOQUE_API_KEY en GitHub Secrets.
     Opcional: ELTOQUE_API_URL si el endpoint que te enviaron es distinto.
  2) Fallback por scraping del sitio público si no hay API key o falla la API.

Regla del proyecto:
- config.json guarda la TASA BASE de elTOQUE.
- el frontend suma +10 MN al mostrarla al cliente.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config.json"
WEB_URL = "https://eltoque.com/tasas-de-cambio-cuba"

# Si elTOQUE te dio un endpoint distinto, ponlo en GitHub Secrets/Variables como ELTOQUE_API_URL.
# El script es flexible: prueba este valor y también varias formas de autenticación.
DEFAULT_API_URL = "https://tasas.eltoque.com/v1/trmi"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)

MIN_TASA = 100.0
MAX_TASA = 2000.0


class RateUpdateError(RuntimeError):
    pass


def _reasonable(rate: float) -> bool:
    return MIN_TASA < rate < MAX_TASA


def _as_float(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.search(r"\d+(?:[.,]\d+)?", v.replace(" ", ""))
        if m:
            try:
                return float(m.group(0).replace(",", "."))
            except ValueError:
                return None
    return None


def _normalize_date(value: Any) -> str:
    """Normaliza una fecha/timestamp variada a 'YYYY-MM-DD'.

    Acepta ISO 8601 ('2026-06-11T15:53:44Z'), epoch en segundos o ms,
    o ya 'YYYY-MM-DD'. Si no se puede interpretar, usa la fecha UTC de hoy.
    """
    if value is None or value == "":
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Epoch numérico (segundos o milisegundos)
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.strip().isdigit()):
        try:
            ts = float(value)
            if ts > 1e11:  # parece milisegundos
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        except (ValueError, OverflowError, OSError):
            pass
    s = str(value).strip()
    # ISO 8601: tomar solo la parte de la fecha
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except ValueError:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _extract_updated_at(data: Any) -> str:
    """Busca una fecha plausible en respuestas JSON con estructuras variadas."""
    keys = {"date", "updated_at", "updatedAt", "created_at", "createdAt", "time", "timestamp"}
    if isinstance(data, dict):
        for k, v in data.items():
            if k in keys and isinstance(v, (str, int, float)):
                return str(v)
        for v in data.values():
            found = _extract_updated_at(v)
            if found:
                return found
    elif isinstance(data, list):
        for v in data:
            found = _extract_updated_at(v)
            if found:
                return found
    return ""


def _extract_usd_rate(data: Any) -> float | None:
    """Extrae USD de respuestas posibles de la API oficial o proxies.

    Soporta estructuras como:
      {"tasas":{"USD":442}}
      {"rates":{"USD":442}}
      {"USD":{"median":442}}
      [{"currency":"USD","rate":442}]
      {"trmiExchange":{"data":{"api":{"statistics":{"USD":{"median":442}}}}}}
    """
    preferred = ("median", "rate", "value", "tasa", "sell", "sell_rate", "exchange", "ema_value", "price")

    if isinstance(data, dict):
        # Caso directo: USD: 442 o USD: {median: 442}
        for key in ("USD", "usd", "DOLLAR", "dollar"):
            if key in data:
                node = data[key]
                val = _as_float(node)
                if val and _reasonable(val):
                    return val
                if isinstance(node, dict):
                    for pk in preferred:
                        val = _as_float(node.get(pk))
                        if val and _reasonable(val):
                            return val

        # Caso: {tasas/rates/data: {USD: ...}}
        for container in ("tasas", "rates", "data", "statistics", "api", "trmiExchange", "result"):
            if container in data:
                val = _extract_usd_rate(data[container])
                if val and _reasonable(val):
                    return val

        # Caso fila: {currency: USD, rate: 442}
        currency = str(data.get("currency") or data.get("code") or data.get("moneda") or data.get("name") or "").upper()
        if currency in {"USD", "DOLAR", "DÓLAR"}:
            for pk in preferred:
                val = _as_float(data.get(pk))
                if val and _reasonable(val):
                    return val

        # Búsqueda recursiva final
        for v in data.values():
            val = _extract_usd_rate(v)
            if val and _reasonable(val):
                return val

    elif isinstance(data, list):
        for item in data:
            val = _extract_usd_rate(item)
            if val and _reasonable(val):
                return val
    return None


def _candidate_api_requests(api_url: str, api_key: str) -> list[tuple[str, dict[str, str], dict[str, str] | None]]:
    base_headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    return [
        (api_url, {**base_headers, "Authorization": f"Bearer {api_key}"}, None),
        (api_url, {**base_headers, "X-API-Key": api_key}, None),
        (api_url, {**base_headers, "x-api-key": api_key}, None),
        (api_url, {**base_headers, "apikey": api_key}, None),
        (api_url, base_headers, {"api_key": api_key}),
        (api_url, base_headers, {"token": api_key}),
        (api_url, base_headers, {"key": api_key}),
    ]


def fetch_eltoque_rate_api() -> tuple[float, str]:
    api_key = os.getenv("ELTOQUE_API_KEY", "").strip()
    if not api_key:
        raise RateUpdateError("ELTOQUE_API_KEY no configurada")

    api_url = os.getenv("ELTOQUE_API_URL", DEFAULT_API_URL).strip() or DEFAULT_API_URL
    errors: list[str] = []

    for url, headers, params in _candidate_api_requests(api_url, api_key):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            if response.status_code in (401, 403):
                errors.append(f"{response.status_code} con headers {list(headers.keys())} params {list((params or {}).keys())}")
                continue
            response.raise_for_status()
            data = response.json()
            rate = _extract_usd_rate(data)
            if rate and _reasonable(rate):
                updated_at = _extract_updated_at(data) or datetime.now(timezone.utc).isoformat()
                print(f"Fuente de tasa: API elTOQUE ({url}) = {rate}")
                return round(rate, 2), updated_at
            errors.append("JSON sin USD reconocible")
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))

    raise RateUpdateError("No se pudo leer USD desde API elTOQUE: " + " | ".join(errors[:4]))


def load_next_data(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    script = soup.find("script", id="__NEXT_DATA__")
    if not script or not script.string:
        raise RateUpdateError("No se encontró __NEXT_DATA__ en el HTML de elTOQUE")
    try:
        return json.loads(script.string)
    except json.JSONDecodeError as exc:
        raise RateUpdateError("No se pudo parsear __NEXT_DATA__") from exc


def fetch_eltoque_rate_web() -> tuple[float, str]:
    response = requests.get(WEB_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()

    data = load_next_data(response.text)
    trmi = data["props"]["pageProps"]["trmiExchange"]["data"]
    stats = trmi["api"]["statistics"]
    usd = stats.get("USD")
    if not usd:
        raise RateUpdateError("No se encontró la estadística USD en elTOQUE")

    raw_rate = usd.get("median")
    source = "median"
    if raw_rate is None:
        raw_rate = usd.get("ema_value")
        source = "ema_value"
    if raw_rate is None:
        raise RateUpdateError("USD no trae median ni ema_value")

    print(f"Fuente de tasa: scraping web {source} = {raw_rate}")

    rate = _as_float(raw_rate)
    if rate is None or not _reasonable(rate):
        raise RateUpdateError(f"Tasa fuera de rango razonable ({MIN_TASA}–{MAX_TASA}): {raw_rate}")

    updated_at = trmi.get("date") or datetime.now(timezone.utc).isoformat()
    return round(rate, 2), updated_at


def fetch_eltoque_rate() -> tuple[float, str, str]:
    try:
        rate, updated_at = fetch_eltoque_rate_api()
        return rate, updated_at, "elTOQUE API"
    except Exception as api_exc:  # noqa: BLE001
        print(f"⚠️ API elTOQUE no disponible o no reconocida: {api_exc}", file=sys.stderr)
        print("↪ Usando fallback web público de elTOQUE...", file=sys.stderr)
        rate, updated_at = fetch_eltoque_rate_web()
        return rate, updated_at, "elTOQUE Web"


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
        rate, updated_at, source_name = fetch_eltoque_rate()
        config = load_config()
        previous = config.get("tasaMN")

        nueva = round(rate, 2)
        anterior = float(previous) if previous is not None else None

        if anterior is not None and abs(anterior - nueva) < 0.01:
            print(f"Tasa sin cambios ({nueva}). No se modifica config.json.")
            return 0

        if anterior is not None:
            config["tasaMNAnterior"] = anterior
        config["tasaMN"] = nueva
        config["tasaFuente"] = source_name
        config["tasaActualizada"] = _normalize_date(updated_at)
        config["actualizado"] = datetime.now(timezone.utc).isoformat()
        save_config(config)

        print(f"Tasa base obtenida de {source_name}: {nueva}")
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
