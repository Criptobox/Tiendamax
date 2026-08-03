#!/usr/bin/env python3
"""Genera una tarjeta Open Graph de 1200x630 por producto.

Por qué hace falta: las páginas de /p/ ya ponían la foto del producto como
og:image, pero declaraban `og:image:width 1200` / `og:image:height 630` cuando
las fotos reales son 480x480, 700x700, 360x480… Los 118 productos mentían. Y
WhatsApp, Telegram y Facebook maquetan la vista previa con las medidas
DECLARADAS: una foto cuadrada anunciada como apaisada sale recortada o con
franjas, según el cliente.

Además, una foto suelta no dice el precio. La tarjeta lleva foto + nombre +
precio + descuento, que es lo que hace que alguien abra el enlace cuando se lo
reenvían por WhatsApp.

    python3 scripts/build_og_images.py            # solo las que cambiaron
    python3 scripts/build_og_images.py --todo     # regenera todas
    python3 scripts/build_og_images.py --check    # ¿falta alguna? (no escribe)

Las tarjetas se guardan en og/producto-{id}.jpg y las referencia
scripts/regenerate_artifacts.py al escribir el <meta og:image>.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PRODUCTOS = ROOT / "productos.json"
IMG_DIR = ROOT / "imagenes"
OG_DIR = ROOT / "og"
MANIFIESTO = OG_DIR / "manifiesto.json"

W, H = 1200, 630

# Paleta del sitio (css/design-scales.css gana la cascada; theme-color en index)
FONDO = (13, 13, 13)
CORAL = (255, 106, 31)
CORAL_HONDO = (210, 78, 15)
ORO = (242, 182, 50)
TINTA = (255, 255, 255)
TINTA_TENUE = (154, 154, 154)
LINEA = (38, 38, 38)

# Mismo criterio que _rutaImagenDesdeUrl() en js/src/tm-data.src.js
RUTA_IMG = re.compile(r"(?:^|/)imagenes/([\w.\-]+\.(?:webp|jpg|jpeg|png))(?:[?#]|$)", re.I)
# Los emoji del nombre no los tiene ninguna fuente del runner: saldrían como
# cuadraditos. En una tarjeta diseñada tampoco aportan.
EMOJI = re.compile(
    r"[\U0001F000-\U0001FAFF☀-➿️‍⬀-⯿←-⇿⤀-⥿]"
)


def _fuente(negrita: bool, tam: int):
    """DejaVu primero: está en el runner de Actions y tiene los acentos del
    español. Si no hubiera ninguna, Pillow da su fuente por defecto — fea pero
    legible, mejor que reventar la build por una tipografía."""
    candidatas = (
        ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"]
        if negrita else
        ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSans.ttf"]
    )
    for c in candidatas:
        if Path(c).exists():
            try:
                return ImageFont.truetype(c, tam)
            except Exception:
                pass
    return ImageFont.load_default()


def limpiar_nombre(t: str) -> str:
    return re.sub(r"\s+", " ", EMOJI.sub("", t or "")).strip()


def _num(x) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def ruta_foto(producto: dict) -> Path | None:
    for u in (producto.get("imagen"), *(producto.get("imagenes") or [])):
        if not isinstance(u, str):
            continue
        m = RUTA_IMG.search(u)
        if m:
            p = IMG_DIR / m.group(1)
            if p.exists():
                return p
    return None


def huella(producto: dict, foto: Path | None) -> str:
    """Identifica de qué depende la tarjeta. Si no cambia, no se regenera: sin
    esto cada corrida reescribiría 118 JPEG y el repo se llenaría de ruido."""
    datos = {
        "nombre": limpiar_nombre(producto.get("nombre") or ""),
        "precio": _num(producto.get("precioActual")),
        "original": _num(producto.get("precioOriginal")),
        "categoria": (producto.get("categoria") or "").strip(),
        "stock": int(_num(producto.get("stock"))),
        # Súbelo al cambiar el diseño: si no, una tarjeta ya generada se queda
        # con el aspecto viejo para siempre porque sus datos no cambiaron.
        # v2: la foto va sola con las esquinas redondeadas, sin panel detrás.
        "version": 2,
    }
    h = hashlib.sha256(json.dumps(datos, sort_keys=True, ensure_ascii=False).encode())
    if foto and foto.exists():
        h.update(foto.read_bytes())
    return h.hexdigest()[:16]


def _cortar_lineas(draw, texto, fuente, ancho_max, max_lineas):
    palabras = texto.split()
    lineas, actual = [], ""
    for p in palabras:
        prueba = (actual + " " + p).strip()
        if draw.textlength(prueba, font=fuente) <= ancho_max or not actual:
            actual = prueba
        else:
            lineas.append(actual)
            actual = p
            if len(lineas) == max_lineas:
                break
    if actual and len(lineas) < max_lineas:
        lineas.append(actual)
    if len(lineas) == max_lineas and palabras:
        # ¿Quedó texto fuera? Entonces la última línea lleva puntos suspensivos.
        sobra = len(" ".join(lineas)) < len(texto)
        if sobra:
            ult = lineas[-1]
            while ult and draw.textlength(ult + "…", font=fuente) > ancho_max:
                ult = ult[:-1].rstrip()
            lineas[-1] = ult + "…"
    return lineas


def _redondear(im: Image.Image, radio: int) -> Image.Image:
    """Redondea las esquinas respetando la transparencia que ya trajera la
    imagen: si se pusiera la máscara encima sin más, una foto sin fondo
    recuperaría el rectángulo que precisamente no tiene."""
    mascara = Image.new("L", im.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, im.width - 1, im.height - 1],
                                              radius=radio, fill=255)
    salida = im.convert("RGBA")
    previa = salida.getchannel("A")
    salida.putalpha(ImageChops.darker(previa, mascara))
    return salida


def _foto_redondeada(foto: Path, lado: int) -> Image.Image | None:
    """La foto sola, escalada para caber en `lado` x `lado` y con las esquinas
    redondeadas. Nada de panel detrás: metida en un cajón, la foto se veía como
    un cuadrado de bordes vivos dentro de otro rectángulo redondeado — dos
    marcos para una sola imagen.

    No se recorta ni se deforma: el producto se ve entero, que es lo que
    importa en una vista previa."""
    try:
        im = Image.open(foto)
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    except Exception:
        return None

    copia = im.copy()
    copia.thumbnail((lado, lado), Image.LANCZOS)
    if not copia.width or not copia.height:
        return None
    # El radio se calcula sobre el lado corto: en una foto apaisada o muy alta,
    # un radio fijo se comería la esquina entera.
    radio = max(12, int(min(copia.width, copia.height) * 0.07))
    return _redondear(copia, radio)


def dibujar_tarjeta(producto: dict, foto: Path | None) -> Image.Image:
    lienzo = Image.new("RGB", (W, H), FONDO)

    # Resplandor cálido detrás de la foto: rompe el negro plano sin robar
    # protagonismo al producto.
    brillo = Image.new("RGB", (W, H), FONDO)
    ImageDraw.Draw(brillo).ellipse([-160, 40, 640, 760], fill=(46, 22, 8))
    lienzo = Image.blend(lienzo, brillo.filter(ImageFilter.GaussianBlur(90)), 0.9)

    d = ImageDraw.Draw(lienzo)

    # ── Foto ────────────────────────────────────────────────────────────
    lado = 462
    px, py = 54, (H - lado) // 2
    puesta = _foto_redondeada(foto, lado) if foto else None
    if puesta is not None:
        # Centrada dentro del hueco reservado: las fotos no son todas cuadradas
        # (hay 360x480, 270x480…) y anclarlas arriba a la izquierda dejaba unas
        # descolgadas respecto de otras.
        lienzo.paste(puesta,
                     (px + (lado - puesta.width) // 2, py + (lado - puesta.height) // 2),
                     puesta)
    else:
        d.rounded_rectangle([px, py, px + lado, py + lado], radius=26,
                            fill=(24, 24, 24), outline=LINEA, width=2)
        f = _fuente(True, 30)
        d.text((px + lado // 2, py + lado // 2), "TiendaMax", font=f,
               fill=TINTA_TENUE, anchor="mm")

    # ── Columna de texto ────────────────────────────────────────────────
    x = px + lado + 52
    ancho = W - x - 54
    y = 92

    categoria = limpiar_nombre(producto.get("categoria") or "").upper()
    if categoria:
        f = _fuente(True, 21)
        d.text((x, y), categoria[:28], font=f, fill=ORO)
        y += 42

    nombre = limpiar_nombre(producto.get("nombre") or "Producto")
    f_nom = _fuente(True, 44)
    lineas = _cortar_lineas(d, nombre, f_nom, ancho, 3)
    for ln in lineas:
        d.text((x, y), ln, font=f_nom, fill=TINTA)
        y += 56
    y += 18

    actual = _num(producto.get("precioActual"))
    original = _num(producto.get("precioOriginal"))
    hay_descuento = original > actual > 0

    # Toda la fila del precio se ancla a UNA línea base (anchor "ls"). Colocando
    # cada trozo por su coordenada superior, el "USD" y el precio tachado
    # acababan pisándose: tamaños distintos, alturas distintas.
    base = y + 62
    f_precio = _fuente(True, 78)
    txt_precio = f"${actual:,.0f}".replace(",", " ")
    d.text((x, base), txt_precio, font=f_precio, fill=CORAL, anchor="ls")
    cursor = x + d.textlength(txt_precio, font=f_precio) + 12

    f_usd = _fuente(True, 27)
    d.text((cursor, base), "USD", font=f_usd, fill=CORAL_HONDO, anchor="ls")
    cursor += d.textlength("USD", font=f_usd) + 26

    if hay_descuento:
        f_antes = _fuente(False, 27)
        txt_antes = f"${original:,.0f}".replace(",", " ")
        d.text((cursor, base), txt_antes, font=f_antes, fill=TINTA_TENUE, anchor="ls")
        an = d.textlength(txt_antes, font=f_antes)
        d.line([cursor, base - 9, cursor + an, base - 9], fill=TINTA_TENUE, width=2)
        cursor += an + 18

        pct = round((original - actual) / original * 100)
        f_pct = _fuente(True, 25)
        etiqueta = f"-{pct}%"
        ew = d.textlength(etiqueta, font=f_pct)
        if pct >= 1 and cursor + ew + 26 <= W - 54:
            d.rounded_rectangle([cursor, base - 30, cursor + ew + 26, base + 8],
                                radius=19, fill=CORAL)
            d.text((cursor + ew / 2 + 13, base - 11), etiqueta, font=f_pct,
                   fill=(255, 255, 255), anchor="mm")

    # ── Llamada a la acción ─────────────────────────────────────────────
    # Va aquí, no en el pie: en el pie no cabe junto a la marca y el dominio
    # (DejaVu es ancha), y además entre el precio y el pie quedaba un hueco
    # muerto de 200 px. Perfilada en vez de rellena para no competir con el
    # precio, que es lo que tiene que mirarse primero.
    agotado = int(_num(producto.get("stock"))) <= 0
    cta = "Te aviso cuando entre" if agotado else "Pídelo por WhatsApp"
    color_cta = TINTA_TENUE if agotado else CORAL
    f_cta = _fuente(True, 26)
    cw = d.textlength(cta, font=f_cta)
    cy = base + 46
    d.rounded_rectangle([x, cy, x + cw + 52, cy + 58], radius=29,
                        fill=(22, 18, 16), outline=color_cta, width=2)
    d.text((x + 26 + cw / 2, cy + 29), cta, font=f_cta, fill=color_cta, anchor="mm")

    # ── Pie ─────────────────────────────────────────────────────────────
    d.line([x, H - 104, W - 54, H - 104], fill=LINEA, width=2)
    pie = H - 62
    f_marca = _fuente(True, 30)
    d.text((x, pie), "TiendaMax", font=f_marca, fill=TINTA, anchor="ls")
    cursor = x + d.textlength("TiendaMax", font=f_marca) + 14
    f_dom = _fuente(False, 23)
    d.text((cursor, pie), "tiendamax.org", font=f_dom, fill=TINTA_TENUE, anchor="ls")
    cursor += d.textlength("tiendamax.org", font=f_dom)

    # A la derecha solo si de verdad cabe: forzarlo es como acabó la primera
    # versión — texto encima de texto.
    if agotado:
        f_est = _fuente(True, 22)
        ew = d.textlength("Agotado", font=f_est)
        if W - 54 - ew > cursor + 28:
            d.text((W - 54, pie), "Agotado", font=f_est, fill=TINTA_TENUE, anchor="rs")

    return lienzo


def cargar_productos() -> list[dict]:
    d = json.loads(PRODUCTOS.read_text(encoding="utf-8"))
    return d if isinstance(d, list) else (d.get("productos") or [])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--todo", action="store_true", help="regenerar todas, cambien o no")
    ap.add_argument("--check", action="store_true", help="solo comprobar; sale 1 si falta alguna")
    args = ap.parse_args()

    productos = cargar_productos()
    OG_DIR.mkdir(exist_ok=True)
    try:
        manifiesto = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
    except Exception:
        manifiesto = {}
    if not isinstance(manifiesto, dict):
        manifiesto = {}

    vigentes, pendientes, escritas = set(), [], 0

    for p in productos:
        pid = p.get("id")
        if not pid:
            continue
        pid = str(pid)
        vigentes.add(pid)
        destino = OG_DIR / f"producto-{pid}.jpg"
        h = huella(p, ruta_foto(p))
        if not args.todo and destino.exists() and manifiesto.get(pid) == h:
            continue
        pendientes.append((pid, p, destino, h))

    if args.check:
        sobrantes = [f.name for f in OG_DIR.glob("producto-*.jpg")
                     if f.stem.replace("producto-", "") not in vigentes]
        if pendientes or sobrantes:
            if pendientes:
                print(f"❌ {len(pendientes)} tarjeta(s) OG por generar:")
                for pid, p, _, _ in pendientes[:10]:
                    print(f"   · {pid} — {limpiar_nombre(p.get('nombre') or '')[:50]}")
            if sobrantes:
                print(f"❌ {len(sobrantes)} tarjeta(s) de productos que ya no existen: {sobrantes[:5]}")
            print("\nEjecuta: python3 scripts/build_og_images.py")
            return 1
        print(f"✅ {len(vigentes)} tarjeta(s) OG al día.")
        return 0

    for pid, p, destino, h in pendientes:
        try:
            # JPEG y no WebP a propósito: WhatsApp es el canal que más importa
            # aquí y su soporte de WebP en las vistas previas es irregular.
            # q=78 progresivo baja ~25 % el peso sin que se note en una tarjeta
            # que se mira en un chat, y son 118 ficheros dentro del repo.
            dibujar_tarjeta(p, ruta_foto(p)).save(
                destino, "JPEG", quality=78, optimize=True, progressive=True)
            manifiesto[pid] = h
            escritas += 1
        except Exception as e:
            print(f"⚠️ {pid}: {e}", file=sys.stderr)

    # Las de productos borrados no se quedan ocupando sitio para siempre.
    borradas = 0
    for f in OG_DIR.glob("producto-*.jpg"):
        pid = f.stem.replace("producto-", "")
        if pid not in vigentes:
            f.unlink()
            manifiesto.pop(pid, None)
            borradas += 1

    manifiesto = {k: v for k, v in manifiesto.items() if k in vigentes}
    MANIFIESTO.write_text(json.dumps(manifiesto, indent=1, sort_keys=True) + "\n",
                          encoding="utf-8")

    peso = sum(f.stat().st_size for f in OG_DIR.glob("producto-*.jpg"))
    print(f"🖼️  {escritas} tarjeta(s) generada(s), {borradas} borrada(s).")
    print(f"    {len(vigentes)} productos · {peso / 1048576:.1f} MB en og/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
