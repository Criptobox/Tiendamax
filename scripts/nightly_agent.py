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
# Tiene que ser idéntica a IA_SIGLAS en js/admin-copilot.js; un test las cruza.
# Estaban descuadradas y por eso el reporte proponía una grafía ("CPE") y el
# botón del panel aplicaba otra ("Cpe").
SIGLAS = {"WIFI", "USB", "HDMI", "LED", "RGB", "TV", "PC", "TIG", "MPPT", "POE",
          "AC", "DC", "CCTV", "GPS", "LCD", "USD", "MN", "KIT", "PRO", "MAX",
          "MINI", "PLUS", "ULTRA", "LITE", "XL", "II", "III", "4K", "2K", "HD",
          "FHD", "UHD", "5G", "4G", "3G", "2T", "4T", "SHPD", "RX", "AX",
          "CPE", "SXT", "LTE", "PV", "UPS", "BMS", "IP", "SSD", "RAM", "OTG"}

# Marcas y términos cuya grafía la fija el fabricante, no el castellano. Sin
# esta tabla el agente proponía "UniFi"→"Unifi", "MikroTik"→"Mikrotik",
# "TP-Link"→"Tp-link" y "LiFePO4"→"LIFEPO4": la regla general escribe bien una
# palabra normal y destroza un nombre propio. Doce productos del catálogo
# llegaron a quedar así.
MARCAS = {
    "UNIFI": "UniFi", "MIKROTIK": "MikroTik", "NANOSTATION": "NanoStation",
    "TP-LINK": "TP-Link", "TPLINK": "TP-Link", "UBIQUITI": "Ubiquiti",
    "BLUETTI": "BLUETTI", "POWMR": "POWMR", "TOMZN": "TOMZN", "BIEN": "BIEN",
    "LIFEPO4": "LiFePO4", "LIITOKALA": "LiitoKala", "AIRFIBER": "AirFiber",
    "XIAOMI": "Xiaomi", "IPHONE": "iPhone", "IPAD": "iPad", "AIRPODS": "AirPods",
    "MANNOL": "Mannol", "TATALIKEN": "Tataliken", "MUST": "Must",
    "HAP": "hAP", "HEX": "hEX", "SXTSQ": "SXTsq",
}


def _sin_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _es_letra(ch):
    return ch.isalpha()


def normalizar_nombre(raw):
    """Propone una grafía para el nombre de un producto.

    La regla de oro es NO TOCAR lo que el dueño escribió a conciencia. La
    versión anterior arreglaba palabras normales y arrasaba con todo lo demás,
    y como sus sugerencias se aceptan a mano, el daño quedó en el catálogo:
    "UniFi"→"Unifi", "MikroTik"→"Mikrotik", "TP-Link"→"Tp-link",
    "BLUETTI"→"Bluetti", "⚡Inversor"→"⚡inversor". Doce productos.

    Tres cosas se dejan en paz ahora, y cada una tapaba un destrozo:

      · Lo que lleva dígitos. "500g" se convertía en "500G" —los gramos van en
        minúscula— y "100Ah" en "100AH". Un modelo o una unidad los copia el
        dueño de la caja; aquí no hay forma de saberlo mejor.
      · Lo que ya tiene mayúsculas por dentro o va entero en mayúsculas. Nadie
        escribe "hAP" o "BLUETTI" por descuido: si no está en minúscula ni en
        Capitalizado, es deliberado.
      · El emoji pegado a la palabra. "⚡Inversor" se leía como una sola pieza
        cuya "primera letra" era el emoji, así que la I caía a minúscula.
    """
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
        # Emoji o símbolo pegado delante: se aparta para que la palabra que
        # viene detrás se juzgue como palabra, no como continuación del emoji.
        i = 0
        while i < len(core) and not _es_letra(core[i]) and not core[i].isdigit():
            i += 1
        pre, core = pre + core[:i], core[i:]
        if not core:
            out.append(pre + post)
            continue

        key = _sin_acentos(core).upper()
        if key in TYPOS:
            nuevo = TYPOS[key]
        elif key in MARCAS:
            nuevo = MARCAS[key]
        elif key in SIGLAS:
            nuevo = "WiFi" if key == "WIFI" else key
        elif any(ch.isdigit() for ch in core):
            nuevo = core                       # modelos y unidades: como estén
        elif core != core.lower() and core != core.capitalize():
            nuevo = core                       # hAP, BLUETTI, UniFi: a propósito
        elif len(core) <= 2:
            nuevo = core.lower()
        else:
            nuevo = core[0].upper() + core[1:].lower()
        out.append(pre + nuevo + post)
    if out and out[0][:1].islower():
        out[0] = out[0][:1].upper() + out[0][1:]
    return " ".join(out)


def main():
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)
    ps = data if isinstance(data, list) else data.get("productos", [])

    urgentes, advertencias, info = [], [], []
    agotados = []
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
            # Los agotados se cuentan aparte y salen en UNA línea al final. Como
            # advertencia individual eran 48 de las 60 alertas del reporte, y de
            # algo que el dueño ya ve en el panel con solo abrirlo. Un informe
            # que avisa sesenta veces de lo que no hace falta enseña a no leerlo
            # — y el día que traiga algo de verdad, tampoco se lee.
            agotados.append(nombre)
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

    if agotados:
        muestra = ", ".join(agotados[:3])
        if len(agotados) > 3:
            muestra += f" y {len(agotados) - 3} más"
        info.append({"tipo": "agotados", "nombre": f"{len(agotados)} agotados",
                     "detalle": muestra})

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
