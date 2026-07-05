#!/usr/bin/env python3
"""
TiendaMax — Agente nocturno.

Corre 1×/día (GitHub Action). Revisa productos.json y deja un reporte de salud
del catálogo en agente-reporte.json. El Copiloto del admin lo lee al abrir por
la mañana y muestra "anoche revisé tu catálogo: …".

No usa Firebase ni secretos: todo sale de productos.json (que está en el repo).
Espeja la misma detección que hace el agente en el navegador (iaScan), para que
los números coincidan.
"""
import json
import os
import re
import unicodedata
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "productos.json")
OUT = os.path.join(BASE, "agente-reporte.json")

# Typos frecuentes (clave sin acentos, en MAYÚSCULA) → forma correcta
TYPOS = {
    "BLUTOOTH": "Bluetooth", "BLUETOTH": "Bluetooth", "BLUETOOH": "Bluetooth",
    "INVETOR": "Inversor", "SEQURIDAD": "Seguridad", "CAMARA": "Cámara",
    "CAMARAS": "Cámaras", "BATERIA": "Batería", "BATERIAS": "Baterías",
    "HIBRIDO": "Híbrido", "HIBRIDA": "Híbrida", "ESTACION": "Estación",
    "PORTATIL": "Portátil", "ELECTRICO": "Eléctrico", "ELECTRICA": "Eléctrica",
    "AUDIFONOS": "Audífonos", "INALAMBRICO": "Inalámbrico", "ALERON": "Alerón",
}
SIGLAS = {"WIFI", "USB", "HDMI", "LED", "RGB", "TV", "PC", "TIG", "MPPT", "POE",
          "AC", "DC", "CCTV", "GPS", "USD", "MN", "KIT", "PRO", "MAX", "MINI",
          "PLUS", "ULTRA", "LITE", "4K", "2K", "HD", "5G", "4G", "3G", "SHPD"}


def _sin_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def normalizar_nombre(raw):
    nombre = " ".join(str(raw or "").split())
    if not nombre:
        return nombre
    out = []
    for tok in nombre.split(" "):
        m = re.match(r'^([("¡¿]*)(.*?)([)".,:;!?]*)$', tok)
        pre, core, post = (m.group(1), m.group(2), m.group(3)) if m else ("", tok, "")
        if not core:
            out.append(tok)
            continue
        key = _sin_acentos(core).upper()
        if key in TYPOS:
            out.append(pre + TYPOS[key] + post)
        elif key in SIGLAS:
            out.append(pre + ("WiFi" if key == "WIFI" else key) + post)
        elif any(ch.isdigit() for ch in core):
            out.append(pre + core.upper() + post)     # modelos: M100, R14, 5W30
        elif len(core) <= 2:
            out.append(pre + core.lower() + post)
        else:
            out.append(pre + core[0].upper() + core[1:].lower() + post)
    if out and out[0][:1].islower():
        out[0] = out[0][:1].upper() + out[0][1:]
    return " ".join(out)


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)
    ps = data if isinstance(data, list) else data.get("productos", [])

    urgentes, advertencias, info = [], [], []
    for p in ps:
        nombre = p.get("nombre") or "(sin nombre)"
        desc = str(p.get("descripcion") or "").strip()
        if len(desc) < 40:
            urgentes.append({"tipo": "desc", "nombre": nombre,
                             "detalle": "sin descripción" if not desc else f"solo {len(desc)} caracteres"})
        nnorm = normalizar_nombre(nombre)
        if nnorm and nnorm != nombre:
            urgentes.append({"tipo": "nombre", "nombre": nombre, "detalle": f"→ {nnorm}"})
        stock = p.get("stock")
        try:
            st = float(stock)
        except (TypeError, ValueError):
            st = None
        if st is None or st < 0:
            advertencias.append({"tipo": "stock", "nombre": nombre, "detalle": f"stock inválido: {stock}"})
        elif st == 0:
            advertencias.append({"tipo": "agotado", "nombre": nombre, "detalle": "agotado (stock 0)"})
        elif st <= 3:
            info.append({"tipo": "stock_bajo", "nombre": nombre, "detalle": f"quedan {int(st)}"})
        try:
            precio = float(p.get("precioActual") or 0)
        except (TypeError, ValueError):
            precio = 0
        if not (precio > 0) or precio > 10000:
            info.append({"tipo": "precio", "nombre": nombre, "detalle": f"precio: {p.get('precioActual')}"})
        if not p.get("imagen"):
            info.append({"tipo": "img", "nombre": nombre, "detalle": "sin foto"})

    total = len(urgentes) + len(advertencias) + len(info)
    if total == 0:
        resumen = f"Revisé tus {len(ps)} productos: todo en orden. 👌"
    else:
        partes = []
        if urgentes:
            partes.append(f"{len(urgentes)} urgente(s)")
        if advertencias:
            partes.append(f"{len(advertencias)} advertencia(s)")
        if info:
            partes.append(f"{len(info)} de info")
        resumen = f"Anoche revisé tus {len(ps)} productos y encontré " + ", ".join(partes) + "."

    reporte = {
        "generado": datetime.now(timezone.utc).isoformat(),
        "productos": len(ps),
        "urgentes": len(urgentes),
        "advertencias": len(advertencias),
        "info": len(info),
        "resumen": resumen,
        # muestra acotada para no engordar el archivo
        "detalle": (urgentes + advertencias + info)[:60],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(reporte, f, ensure_ascii=False, indent=2)
    print(f"agente-reporte.json: {resumen}")


if __name__ == "__main__":
    main()
