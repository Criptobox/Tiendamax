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
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import send_notifications as sn  # noqa: E402


def prod(pid, nombre="Cosa", stock=5, precio=80.0):
    return {"id": pid, "nombre": nombre, "stock": stock, "precioActual": precio,
            "imagen": f"img{pid}.jpg"}


def encolada(pid, antes=100.0, ahora=80.0, nombre="Cosa"):
    return {"id": pid, "nombre": nombre, "antes": antes, "ahora": ahora,
            "imagen": f"img{pid}.jpg"}


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
        r = sn.nuevos_vigentes([prod(1), prod(2, stock=0)], [prod(1), prod(2, stock=0)])
        self.assertEqual([1], [x["id"] for x in r])

    def test_el_mismo_nuevo_dos_veces_cuenta_una(self):
        r = sn.nuevos_vigentes([prod(1), prod(1)], [prod(1)])
        self.assertEqual(1, len(r))


class ElFiltroSeAplicaDeVerdadTest(unittest.TestCase):
    """Que las funciones existan no sirve de nada si el envío no las llama."""

    def test_el_envio_depura_la_cola_antes_de_contar(self):
        src = (ROOT / "scripts" / "send_notifications.py").read_text(encoding="utf-8")
        envio = src.index("# Lógica de envío")
        cuenta = src.index("n_reb = len(cola[\"rebajas_pendientes\"])")
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
