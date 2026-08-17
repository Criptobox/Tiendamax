"""La cola de avisos se vuelve mentira sola, y el aviso ya enviado no se corrige.

Un push de la tienda no es un mensaje que se lee y se va: se queda en la
pantalla del teléfono hasta que el cliente lo aparta, y el texto que lleva es
el que se congeló al mandarlo. Por eso un título como "🏷️ 4 productos
rebajados" tiene que ser verdad en el momento del envío — después ya no hay
manera de arreglarlo.

Entre que algo entra en la cola y sale pasan horas: el cron encola en cada
pasada, pero solo se vacía en horario diurno. En ese rato pasan tres cosas, y
las tres se vieron en la tienda de verdad:

  · El producto se agota. La cola guarda id, nombre y precio, nunca stock.
  · La rebaja se revierte — `revertir_ofertas.py` devuelve el precio de las
    ofertas con fecha, y no toca la cola.
  · El mismo producto baja dos veces y entra dos veces, porque la cola hace
    `extend`. El contador decía 2 productos donde había uno.

De ahí que antes de armar el aviso se vuelva a mirar productos.json.
"""
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import send_notifications as sn  # noqa: E402


# Alta reciente: `nuevos_vigentes` descarta lo que se dio de alta hace mucho
# (el id ES la fecha de alta), y aquí lo que se prueba es otra cosa.
AHORA = time.time() * 1000


def prod(pid, nombre="Cosa", stock=5, precio=80.0):
    return {"id": pid, "nombre": nombre, "stock": stock, "precioActual": precio,
            "imagen": f"img{pid}.jpg"}


def enc(p):
    """El producto tal y como queda en la cola: con la marca de cuándo entró."""
    return {**p, "_ts": AHORA}


def encolada(pid, antes=100.0, ahora=80.0, nombre="Cosa"):
    """Una entrada de la cola tal y como la deja el script: con `_ts`, la marca
    de cuándo se detectó. Sin ella se descarta por caducidad — es lo que purga
    los atascos de versiones anteriores."""
    return {"id": pid, "nombre": nombre, "antes": antes, "ahora": ahora,
            "imagen": f"img{pid}.jpg", "_ts": AHORA}


class RebajasVigentesTest(unittest.TestCase):
    def test_lo_normal_pasa(self):
        r = sn.rebajas_vigentes([encolada(1)], [prod(1)])
        self.assertEqual(1, len(r))
        self.assertEqual(80.0, r[0]["ahora"])

    def test_un_producto_agotado_no_se_anuncia(self):
        """Es el caso que se vio: el aviso decía 4 y uno ya no se podía comprar."""
        r = sn.rebajas_vigentes([encolada(1), encolada(2)],
                                [prod(1), prod(2, stock=0)])
        self.assertEqual([1], [x["id"] for x in r])

    def test_si_la_rebaja_se_revirtio_no_se_anuncia(self):
        # revertir_ofertas.py devolvió el precio mientras esperaba en la cola.
        r = sn.rebajas_vigentes([encolada(1, antes=100, ahora=80)],
                                [prod(1, precio=100)])
        self.assertEqual([], r)

    def test_el_mismo_producto_dos_veces_cuenta_una(self):
        """Bajó de 100 a 90 y luego a 80: la cola trae dos entradas del mismo
        producto y el título decía "2 productos rebajados"."""
        r = sn.rebajas_vigentes(
            [encolada(1, antes=100, ahora=90), encolada(1, antes=90, ahora=80)],
            [prod(1, precio=80)])
        self.assertEqual(1, len(r))
        # La rebaja vista de punta a punta: del precio más alto al de ahora.
        self.assertEqual(100.0, r[0]["antes"])
        self.assertEqual(80.0, r[0]["ahora"])

    def test_un_producto_borrado_del_catalogo_no_se_anuncia(self):
        self.assertEqual([], sn.rebajas_vigentes([encolada(7)], [prod(1)]))

    def test_el_precio_y_el_nombre_salen_del_catalogo_no_de_la_cola(self):
        """Si el admin le cambió el nombre o lo rebajó más, manda lo de ahora."""
        r = sn.rebajas_vigentes([encolada(1, nombre="Nombre viejo", ahora=90)],
                                [prod(1, nombre="Nombre nuevo", precio=70)])
        self.assertEqual("Nombre nuevo", r[0]["nombre"])
        self.assertEqual(70.0, r[0]["ahora"])

    def test_no_revienta_con_basura(self):
        """La cola vive en Firebase y la escriben varios procesos."""
        sucia = [None, "texto", {}, {"id": 1}, encolada(1)]
        r = sn.rebajas_vigentes(sucia, [prod(1), {"sin_id": True}, None])
        self.assertEqual([1], [x["id"] for x in r])

    def test_stock_o_precio_ilegibles_no_cuelan(self):
        r = sn.rebajas_vigentes([encolada(1), encolada(2)],
                                [prod(1, stock="ninguno"), prod(2, precio="gratis")])
        self.assertEqual([], r)


class NuevosVigentesTest(unittest.TestCase):
    def test_un_nuevo_agotado_no_se_anuncia(self):
        r = sn.nuevos_vigentes([enc(prod(1)), enc(prod(2, stock=0))],
                               [prod(1), prod(2, stock=0)])
        self.assertEqual([1], [x["id"] for x in r])

    def test_el_mismo_nuevo_dos_veces_cuenta_una(self):
        r = sn.nuevos_vigentes([enc(prod(1)), enc(prod(1))], [prod(1)])
        self.assertEqual(1, len(r))


class OfertasVisiblesTest(unittest.TestCase):
    """El número del título tiene que ser el que el cliente cuenta al entrar.

    La cola y la tienda dicen cosas distintas y las dos son correctas: la cola
    son los que CAMBIARON de precio desde la última pasada del cron; la tienda
    enseña todos los que están rebajados, cambiaran hoy o hace tres días. El
    aviso decía 2 mientras en la tienda había 3, y el cliente cuenta lo que ve.
    """

    def con_oferta(self, pid, stock=5, original=100.0, actual=80.0):
        return {"id": pid, "nombre": f"P{pid}", "stock": stock,
                "precioOriginal": original, "precioActual": actual}

    def test_cuenta_los_que_se_ven_rebajados(self):
        cat = [self.con_oferta(1), self.con_oferta(2), prod(3)]
        self.assertEqual([1, 2], [p["id"] for p in sn.ofertas_visibles(cat)])

    def test_un_agotado_no_es_una_oferta(self):
        """No se puede mandar a nadie a ver algo que no puede comprar."""
        cat = [self.con_oferta(1), self.con_oferta(2, stock=0)]
        self.assertEqual([1], [p["id"] for p in sn.ofertas_visibles(cat)])

    def test_usa_la_misma_regla_que_la_tarjeta_de_la_tienda(self):
        """tm-ui.src.js: precioOriginal > 0 && precioOriginal > precioActual."""
        cat = [
            self.con_oferta(1, original=0, actual=80),      # sin precio anterior
            self.con_oferta(2, original=80, actual=80),     # mismo precio
            self.con_oferta(3, original=70, actual=80),     # subió
            self.con_oferta(4, original=100, actual=99),    # bajó un peso: cuenta
        ]
        self.assertEqual([4], [p["id"] for p in sn.ofertas_visibles(cat)])

    def test_no_revienta_con_basura(self):
        cat = [None, "x", {}, self.con_oferta(1)]
        self.assertEqual([1], [p["id"] for p in sn.ofertas_visibles(cat)])

    def test_el_titulo_cuenta_el_catalogo_y_no_la_cola(self):
        """La cola dispara el aviso; el catálogo pone el número."""
        src = (ROOT / "scripts" / "send_notifications.py").read_text(encoding="utf-8")
        i = src.index("# 2. Rebajas")
        bloque = src[i:i + 1400]
        self.assertIn("ofertas_visibles(catalogo)", bloque)
        self.assertNotIn('len(cola["rebajas_pendientes"])', bloque,
                         "contar la cola es justo lo que daba un número más bajo "
                         "que el que el cliente ve en la tienda")


class ElFiltroSeAplicaDeVerdadTest(unittest.TestCase):
    """Que las funciones existan no sirve de nada si el envío no las llama."""

    def test_el_envio_depura_la_cola_antes_de_contar(self):
        src = (ROOT / "scripts" / "send_notifications.py").read_text(encoding="utf-8")
        envio = src.index("# Lógica de envío")
        cuenta = src.index("# 2. Rebajas")
        for fn in ("rebajas_vigentes(", "nuevos_vigentes("):
            with self.subTest(funcion=fn):
                pos = src.rfind(fn, 0, cuenta)
                self.assertNotEqual(-1, pos, f"{fn} no se llama antes de contar")
                self.assertLess(
                    pos, envio,
                    f"{fn} tiene que correr ANTES de armar el aviso: después ya "
                    "se mandó el número",
                )


if __name__ == "__main__":
    unittest.main()
