#!/usr/bin/env python3
"""
TiendaMax — Generador de tarjeta de producto para Telegram.
Produce una imagen 1080x1080 con foto del producto, nombre y branding.
"""
from __future__ import annotations
import io
import textwrap
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SIZE       = 1080
BRAND_BG   = (13, 8, 6)        # #0D0806
GOLD       = (201, 169, 110)    # #C9A96E
ORANGE     = (255, 107, 53)     # #FF6B35
WHITE      = (255, 255, 255)
OVERLAY    = (0, 0, 0, 180)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        f"/usr/share/fonts/truetype/liberation/LiberationSans-{'Bold' if bold else 'Regular'}.ttf",
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans-{'Bold' if bold else ''}.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _download_image(url: str) -> Image.Image | None:
    try:
        r = requests.get(url, timeout=10, stream=True)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception:
        return None


def _crop_center(img: Image.Image, size: int) -> Image.Image:
    w, h = img.size
    scale = size / min(w, h)
    new_w, new_h = int(w * scale), int(h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - size) // 2
    top  = (new_h - size) // 2
    return img.crop((left, top, left + size, top + size))


def generate_card(nombre: str, categoria: str, imagen_url: str, link: str) -> bytes | None:
    """
    Genera tarjeta 1080x1080. Devuelve bytes PNG o None si falla.
    """
    card = Image.new("RGB", (SIZE, SIZE), BRAND_BG)
    draw = ImageDraw.Draw(card)

    # ── Foto de producto ────────────────────────────────────────────────────
    if imagen_url and imagen_url.startswith("http"):
        foto = _download_image(imagen_url)
        if foto:
            foto = _crop_center(foto, SIZE)
            # Ligero blur en los bordes para suavizar
            card.paste(foto, (0, 0))

    # ── Gradiente oscuro abajo (para que el texto sea legible) ──────────────
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    grad_h = 420
    for i in range(grad_h):
        alpha = int(210 * (i / grad_h) ** 1.5)
        ov_draw.line([(0, SIZE - grad_h + i), (SIZE, SIZE - grad_h + i)],
                     fill=(0, 0, 0, alpha))
    card = Image.alpha_composite(card.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(card)

    # ── Barra superior con branding ─────────────────────────────────────────
    draw.rectangle([(0, 0), (SIZE, 72)], fill=(13, 8, 6, 220))
    logo_font = _font(32, bold=True)
    draw.text((30, 18), "TIENDA", font=logo_font, fill=GOLD)
    draw.text((30 + draw.textlength("TIENDA", font=logo_font), 18),
              "MAX", font=logo_font, fill=ORANGE)

    # Punto naranja decorativo
    draw.ellipse([(SIZE - 50, 20), (SIZE - 20, 50)], fill=ORANGE)

    # ── Categoría (pill) ────────────────────────────────────────────────────
    if categoria:
        cat_font = _font(26)
        cat_text = categoria.upper()
        tw = draw.textlength(cat_text, font=cat_font)
        px, py = 30, SIZE - 340
        draw.rounded_rectangle([px - 4, py - 4, px + tw + 20, py + 34],
                                radius=20, fill=ORANGE)
        draw.text((px + 8, py), cat_text, font=cat_font, fill=WHITE)

    # ── Nombre del producto ─────────────────────────────────────────────────
    name_font = _font(58, bold=True)
    lines     = textwrap.wrap(nombre, width=22)[:3]
    y         = SIZE - 280
    for line in lines:
        draw.text((30, y), line, font=name_font, fill=WHITE)
        y += 68

    # ── Link / CTA ──────────────────────────────────────────────────────────
    cta_font = _font(34)
    draw.text((30, SIZE - 110), "👉 Ver precio en tiendamax.org",
              font=cta_font, fill=GOLD)

    # ── Borde naranja inferior ──────────────────────────────────────────────
    draw.rectangle([(0, SIZE - 8), (SIZE, SIZE)], fill=ORANGE)

    buf = io.BytesIO()
    card.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
