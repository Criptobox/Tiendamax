#!/usr/bin/env python3
"""Iconos de la app de gestión (admin-manifest.json) y de sus accesos directos.

Por qué existe este script en vez de tres PNG sueltos en el repo: el icono de
`vale-manifest.json` se hizo copiando el de la tienda y quedó prácticamente
idéntico — en la pantalla de inicio no se distingue cuál es cuál. La app de
gestión tiene que verse distinta *de un vistazo*, a 48dp y sin gafas, o no
sirve de nada tenerla aparte.

La marca se conserva: se recorta la bolsa y la "M" del icono de la tienda y se
pega sobre fondo oscuro, con la bolsa en dorado (--gold del admin). Mismo
dibujo, otra piel — se reconoce que es TiendaMax pero no se confunde con la
tienda.

El recorte se hace por color, no a mano. El fondo del icono original es naranja
(G muy por encima de B: G-B ≈ 60-90) mientras que la bolsa crema (19) y la M
roja (-4) tienen G-B pequeño. Con ese único número se separa figura de fondo
sin tocar el antialiasing de los bordes.

    python3 scripts/build_admin_icons.py

Genera, en iconos/:
  admin-icon-192.png, admin-icon-512.png, admin-icon-maskable-512.png
  atajo-vale-96.png, atajo-publicar-96.png, atajo-agregar-96.png
"""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parents[1]
ICONOS = RAIZ / "iconos"
ORIGEN = ICONOS / "icon-512.png"

FONDO_A = (18, 18, 30)      # --bg del admin, un poco levantado
FONDO_B = (8, 8, 18)        # #0a0a12
ORO = (201, 169, 110)       # --gold
ORO_CLARO = (232, 205, 152)
ROJO = (218, 24, 28)

# Umbrales de G-B. Por debajo del bajo es figura segura, por encima del alto es
# fondo seguro; en medio se interpola para no dejar el borde dentado.
GB_FIGURA = 20
GB_FONDO = 70


def _mascara_figura(src):
    """Alfa de la bolsa + la M, separadas del fondo naranja por G-B."""
    ancho, alto = src.size
    mask = Image.new("L", src.size, 0)
    px_src = src.load()
    px_m = mask.load()
    for y in range(alto):
        for x in range(ancho):
            r, g, b = px_src[x, y][:3]
            d = g - b
            if d <= GB_FIGURA:
                px_m[x, y] = 255
            elif d >= GB_FONDO:
                px_m[x, y] = 0
            else:
                px_m[x, y] = int(255 * (GB_FONDO - d) / (GB_FONDO - GB_FIGURA))
    return mask


def _recolorear(src, mask):
    """La crema pasa a dorado; la M roja se queda roja (contrasta con el oro)."""
    ancho, alto = src.size
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    px_src, px_m, px_o = src.load(), mask.load(), out.load()
    for y in range(alto):
        for x in range(ancho):
            a = px_m[x, y]
            if not a:
                continue
            r, g, b = px_src[x, y][:3]
            if r > 150 and g < 90 and b < 90:          # la M
                px_o[x, y] = (*ROJO, a)
            else:                                       # la bolsa, era crema
                lum = (r + g + b) / 765.0               # 0..1, conserva el sombreado
                px_o[x, y] = (
                    int(ORO[0] * 0.75 + ORO_CLARO[0] * 0.25 * lum),
                    int(ORO[1] * 0.75 + ORO_CLARO[1] * 0.25 * lum),
                    int(ORO[2] * 0.75 + ORO_CLARO[2] * 0.25 * lum),
                    a,
                )
    return out


def _fondo(lado, radio_frac=0.22):
    """Cuadrado redondeado con degradado vertical oscuro."""
    base = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    grad = Image.new("RGBA", (lado, lado))
    d = ImageDraw.Draw(grad)
    for y in range(lado):
        t = y / max(1, lado - 1)
        d.line(
            [(0, y), (lado, y)],
            fill=(
                int(FONDO_A[0] + (FONDO_B[0] - FONDO_A[0]) * t),
                int(FONDO_A[1] + (FONDO_B[1] - FONDO_A[1]) * t),
                int(FONDO_A[2] + (FONDO_B[2] - FONDO_A[2]) * t),
                255,
            ),
        )
    if radio_frac <= 0:
        return grad
    mask = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, lado - 1, lado - 1], radius=int(lado * radio_frac), fill=255
    )
    base.paste(grad, (0, 0), mask)
    return base


def icono_app():
    src = Image.open(ORIGEN).convert("RGB")
    figura = _recolorear(src, _mascara_figura(src))

    # `any`: cuadrado redondeado, la figura al 78%.
    normal = _fondo(512)
    f = figura.resize((400, 400), Image.LANCZOS)
    normal.alpha_composite(f, (56, 56))

    # `maskable`: Android recorta hasta un 20% por lado, así que la figura va
    # más pequeña y centrada, y el fondo llena el cuadrado entero sin redondear.
    mask_icon = _fondo(512, radio_frac=0)
    f2 = figura.resize((280, 280), Image.LANCZOS)
    mask_icon.alpha_composite(f2, (116, 116))

    normal.save(ICONOS / "admin-icon-512.png")
    normal.resize((192, 192), Image.LANCZOS).save(ICONOS / "admin-icon-192.png")
    mask_icon.save(ICONOS / "admin-icon-maskable-512.png")
    print("✅ admin-icon-192/512 + maskable-512")


def _lienzo_atajo():
    img = _fondo(96, radio_frac=0.24)
    return img, ImageDraw.Draw(img)


def atajo_vale():
    """Un recibo con el borde de abajo en zigzag."""
    img, d = _lienzo_atajo()
    d.rounded_rectangle([26, 20, 70, 66], radius=4, fill=ORO)
    dientes = [(26, 66)]
    x = 26
    while x < 70:
        dientes.append((x + 5.5, 76))
        dientes.append((x + 11, 66))
        x += 11
    dientes.append((70, 66))
    d.polygon(dientes, fill=ORO)
    for y in (32, 41, 50):
        d.line([(35, y), (61, y)], fill=FONDO_B, width=4)
    img.save(ICONOS / "atajo-vale-96.png")


def atajo_publicar():
    """Flecha saliendo de una bandeja: "sacar esto ahí fuera".

    Se probó antes con un megáfono y a 24dp —que es el tamaño real en el menú
    del icono— el cono y el mango se empastan en una mancha. La flecha se lee
    entera aunque la encojas.
    """
    img, d = _lienzo_atajo()
    d.polygon([(48, 18), (66, 40), (56, 40), (56, 56), (40, 56), (40, 40), (30, 40)], fill=ORO)
    d.rounded_rectangle([24, 62, 72, 74], radius=4, fill=ORO)
    img.save(ICONOS / "atajo-publicar-96.png")


def atajo_agregar():
    """Un más, a secas."""
    img, d = _lienzo_atajo()
    d.rounded_rectangle([42, 22, 54, 74], radius=6, fill=ORO)
    d.rounded_rectangle([22, 42, 74, 54], radius=6, fill=ORO)
    img.save(ICONOS / "atajo-agregar-96.png")


if __name__ == "__main__":
    if not ORIGEN.exists():
        raise SystemExit(f"No encuentro {ORIGEN}")
    icono_app()
    atajo_vale()
    atajo_publicar()
    atajo_agregar()
    print("✅ atajo-vale/publicar/agregar-96")
