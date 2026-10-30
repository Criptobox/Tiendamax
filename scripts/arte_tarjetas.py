#!/usr/bin/env python3
"""Dibuja la foto de cada producto digital (categoría TARJETAS).

Una tarjeta regalo no tiene foto propia que se pueda usar: las de la marca
llevan su logotipo, y la tienda no publica logotipos ajenos. Así que cada
producto digital lleva una imagen dibujada aquí: el «plástico» de la tarjeta
con el nombre en texto, sobre el mismo fondo claro que las fotos de los
productos físicos, para que la rejilla se vea igual.

    python3 scripts/arte_tarjetas.py            # dibuja las que falten
    python3 scripts/arte_tarjetas.py --todas    # las vuelve a dibujar todas

Lee productos.json, dibuja solo los que tienen `digital: true` y un `arte`
({marca, tipo, colores, chip}), y guarda imagenes/img_<id>.webp y su
miniatura en imagenes/thumbs/, que es donde el resto del sitio las busca.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
IMAGENES = RAIZ / "imagenes"
LADO, MINI = 700, 420
FONDO = (245, 243, 239)
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FUENTE_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _degradado(w: int, h: int, colores: list[str]) -> Image.Image:
    """Degradado en diagonal por los colores dados (dos o tres)."""
    cs = [_hex(c) for c in colores] or [(40, 40, 40)]
    if len(cs) == 1:
        cs = cs * 2
    im = Image.new("RGB", (w, h))
    px = im.load()
    tramos = len(cs) - 1
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.75 + y / h * 0.25)
            k = min(int(t * tramos), tramos - 1)
            f = t * tramos - k
            a, b = cs[k], cs[k + 1]
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * f) for i in range(3))
    return im


def _ajustar(draw, texto, fuente_path, tam, ancho_max):
    """La letra más grande que deja el texto entero dentro de ancho_max."""
    while tam > 14:
        f = ImageFont.truetype(fuente_path, tam)
        if draw.textlength(texto, font=f) <= ancho_max:
            return f
        tam -= 2
    return ImageFont.truetype(fuente_path, tam)


def dibujar(p: dict) -> Image.Image:
    arte = p.get("arte") or {}
    marca = str(arte.get("marca") or p.get("nombre") or "").upper()
    tipo = str(arte.get("tipo") or "").upper()
    region = "GLOBAL" if str(p.get("region", "")).startswith("Cualquier") else str(p.get("region") or "").upper()
    cw, ch = 560, 353
    lienzo = Image.new("RGB", (LADO, LADO), FONDO)

    # Sombra suave debajo de la tarjeta.
    sombra = Image.new("L", (LADO, LADO), 0)
    sd = ImageDraw.Draw(sombra)
    x0, y0 = (LADO - cw) // 2, (LADO - ch) // 2
    sd.rounded_rectangle((x0 + 6, y0 + 22, x0 + cw + 6, y0 + ch + 22), 26, fill=120)
    sombra = sombra.filter(ImageFilter.GaussianBlur(22))
    lienzo.paste(Image.new("RGB", (LADO, LADO), (150, 140, 130)), (0, 0), sombra)

    tarjeta = _degradado(cw, ch, arte.get("colores") or ["#333333", "#666666"])
    d = ImageDraw.Draw(tarjeta)
    # Brillo en diagonal, como en la vista previa.
    brillo = Image.new("L", (cw, ch), 0)
    bd = ImageDraw.Draw(brillo)
    bd.polygon([(0, 0), (int(cw * 0.55), 0), (0, int(ch * 0.9))], fill=38)
    tarjeta.paste(Image.new("RGB", (cw, ch), (255, 255, 255)), (0, 0), brillo)

    pad = 34
    f_marca = _ajustar(d, marca, FUENTE, 54, cw - 2 * pad - (150 if tipo else 0))
    d.text((pad, pad), marca, font=f_marca, fill="white")
    if tipo:
        f_tipo = ImageFont.truetype(FUENTE, 18)
        d.text((cw - pad - d.textlength(tipo, font=f_tipo), pad + 10), tipo, font=f_tipo, fill=(255, 255, 255, 220))
    if arte.get("chip"):
        d.rounded_rectangle((pad, ch // 2 - 30, pad + 70, ch // 2 + 22), 8, fill=(226, 196, 120))
        d.line((pad, ch // 2 - 12, pad + 70, ch // 2 - 12), fill=(170, 140, 70), width=2)
        d.line((pad, ch // 2 + 6, pad + 70, ch // 2 + 6), fill=(170, 140, 70), width=2)
    f_pie = ImageFont.truetype(FUENTE_MONO, 26)
    etiqueta = "RECARGA" if p.get("unidad") else "GIFT CARD"
    d.text((pad, ch - pad - 30), etiqueta, font=f_pie, fill="white")
    f_reg = ImageFont.truetype(FUENTE, 18)
    d.text((cw - pad - d.textlength(region, font=f_reg), ch - pad - 24), region, font=f_reg, fill="white")

    mascara = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, cw, ch), 26, fill=255)
    lienzo.paste(tarjeta, (x0, y0), mascara)
    return lienzo


def main(argv: list[str]) -> int:
    todas = "--todas" in argv
    productos = json.loads((RAIZ / "productos.json").read_text(encoding="utf-8"))
    hechas = 0
    for p in productos:
        if not p.get("digital") or not p.get("arte"):
            continue
        destino = IMAGENES / f"img_{p['id']}.webp"
        if destino.exists() and not todas:
            continue
        im = dibujar(p)
        im.save(destino, "WEBP", quality=86)
        im.resize((MINI, MINI), Image.LANCZOS).save(IMAGENES / "thumbs" / destino.name, "WEBP", quality=82)
        hechas += 1
        print(f"🖼️  {destino.name} · {p.get('nombre')}")
    print(f"Listo: {hechas} imagen(es) dibujada(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
