#!/usr/bin/env python3
"""Iconos de la app de gestión y del vale, y de los accesos directos.

Por qué existe este script en vez de unos PNG sueltos en el repo: el icono de
`vale-manifest.json` se hizo copiando el de la tienda y quedó prácticamente
idéntico — en la pantalla de inicio no se distingue cuál es cuál. La app de
gestión tiene que verse distinta *de un vistazo*, a 48dp y sin gafas, o no
sirve de nada tenerla aparte.

El vale arrastró esa misma copia hasta que se generó aquí: `vale-icon-192.png`
y `vale-icon-512.png` eran el favicon de la tienda byte a byte. Lo que separa
un icono de otro a 48dp es la SILUETA, no el color —de ahí que el vale lleve el
recibo con el pie dentado en vez de la bolsa: se distingue de la tienda y del
panel aunque el móvil lo pinte del tamaño de una uña.

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
  vale-icon-192.png, vale-icon-512.png, vale-icon-maskable-512.png
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

# El vale usa su propia paleta (la de vale.html): negro cálido en vez del
# negro azulado del panel. Aun así el que separa los dos iconos es el dibujo,
# no estos grados de diferencia — el tono solo ayuda cuando ya los tienes uno
# al lado del otro en la pantalla de inicio.
VALE_FONDO_A = (28, 23, 18)
VALE_FONDO_B = (13, 13, 13)   # --bg de vale.html
NARANJA = (255, 107, 53)      # #FF6B35, el mismo de los botones del vale

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


def _fondo(lado, radio_frac=0.22, desde=FONDO_A, hasta=FONDO_B):
    """Cuadrado redondeado con degradado vertical oscuro."""
    base = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    grad = Image.new("RGBA", (lado, lado))
    d = ImageDraw.Draw(grad)
    for y in range(lado):
        t = y / max(1, lado - 1)
        d.line(
            [(0, y), (lado, y)],
            fill=(
                int(desde[0] + (hasta[0] - desde[0]) * t),
                int(desde[1] + (hasta[1] - desde[1]) * t),
                int(desde[2] + (hasta[2] - desde[2]) * t),
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


def _recibo(d, x0, y0, x1, y1, hueco=FONDO_B, ultima=None):
    """Un recibo con el borde de abajo en zigzag, dentro de la caja dada.

    Toda la geometría son fracciones de la caja para que el acceso directo de
    96px y el icono de app de 512 dibujen exactamente la misma figura. Si se
    tocan a ojo por separado dejan de parecer la misma cosa, que es justo lo
    que tienen que parecer: abren la misma herramienta.

    `ultima` pinta la tercera raya de otro color (el naranja del vale) — a
    tamaño de app se lee como la línea del total y mete un segundo color que
    ayuda a separarlo del icono del panel.
    """
    w, h = x1 - x0, y1 - y0
    radio = max(2, round(w * 4 / 44))
    d.rounded_rectangle([x0, y0, x1, y1], radius=radio, fill=ORO)

    # 4 dientes exactos a lo ancho, cada uno bajando un 22% del ancho. El
    # polígono empieza un radio MÁS ARRIBA del borde: si arranca justo en y1
    # las dos esquinas de abajo ya vienen redondeadas del rectángulo y quedan
    # dos muescas cuadradas a los lados del zigzag.
    paso, hondo, techo = w / 4, w * 10 / 44, y1 - radio
    dientes = [(x0, techo), (x0, y1)]
    for i in range(4):
        dientes.append((x0 + paso * i + paso / 2, y1 + hondo))
        dientes.append((x0 + paso * (i + 1), y1))
    dientes.append((x1, techo))
    d.polygon(dientes, fill=ORO)

    grosor = max(1, round(w * 4 / 44))
    for i, fy in enumerate((12 / 46, 21 / 46, 30 / 46)):
        color = ultima if (ultima and i == 2) else hueco
        d.line([(x0 + w * 9 / 44, y0 + h * fy), (x0 + w * 35 / 44, y0 + h * fy)],
               fill=color, width=grosor)


def atajo_vale():
    """El recibo, al tamaño del menú de accesos directos."""
    img, d = _lienzo_atajo()
    _recibo(d, 26, 20, 70, 66)
    img.save(ICONOS / "atajo-vale-96.png")


def icono_vale():
    """Icono de la app del vale (vale-manifest.json).

    Antes era una copia literal del favicon de la tienda: mismo md5. En la
    pantalla de inicio salían dos bolas naranjas idénticas y no había forma de
    saber cuál abría el vale.
    """
    # El zigzag son diagonales: dibujado directo a 512 sale dentado. Se dibuja
    # a 4x sobre transparencia y se baja con LANCZOS, que es lo que le da el
    # borde limpio.
    ss, caja = 4, (118, 96, 394, 384)   # ~54% de ancho; el pie dentado llega a y=447
    figura = Image.new("RGBA", (512 * ss, 512 * ss), (0, 0, 0, 0))
    _recibo(ImageDraw.Draw(figura), *[v * ss for v in caja],
            hueco=(0, 0, 0, 0), ultima=NARANJA)
    figura = figura.resize((512, 512), Image.LANCZOS)

    normal = _fondo(512, desde=VALE_FONDO_A, hasta=VALE_FONDO_B)
    normal.alpha_composite(figura)

    # `maskable`: Android recorta hasta un 20% por lado, así que la figura va
    # más pequeña y centrada y el fondo llena el cuadrado sin redondear.
    mask_icon = _fondo(512, radio_frac=0, desde=VALE_FONDO_A, hasta=VALE_FONDO_B)
    mask_icon.alpha_composite(figura.resize((330, 330), Image.LANCZOS), (91, 91))

    normal.save(ICONOS / "vale-icon-512.png")
    normal.resize((192, 192), Image.LANCZOS).save(ICONOS / "vale-icon-192.png")
    mask_icon.save(ICONOS / "vale-icon-maskable-512.png")
    print("✅ vale-icon-192/512 + maskable-512")


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
    icono_vale()
    atajo_vale()
    atajo_publicar()
    atajo_agregar()
    print("✅ atajo-vale/publicar/agregar-96")
