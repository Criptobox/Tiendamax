"""Reponer un equipo agotado tiene que avisar a TODA la lista.

Antes el aviso salía solo hacia avisos_stock/{id}, o sea hacia quien hubiera
pulsado "avísame cuando vuelva". Como esa lista está casi siempre vacía,
reponer un equipo no le llegaba a nadie: la mejor noticia que puede dar la
tienda se quedaba dentro.

Los que sí lo pidieron siguen recibiendo su aviso propio —con su texto— y
quedan fuera del general para no recibirlo dos veces.

Sin red ni Firebase: base falsa duck-typed y enviar_push_fcm mockeado.
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import send_notifications as sn  # noqa: E402


class _FakeRef:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def get(self):
        return self._store.get(self._path)

    def set(self, valor):
        self._store[self._path] = valor

    def delete(self):
        self._store.pop(self._path, None)

    def child(self, sub):
        return _FakeRef(self._store, self._path + "/" + str(sub))


class _FakeDatabase:
    def __init__(self, data):
        self._data = data

    def reference(self, path):
        return _FakeRef(self._data, path)


ITEM = {"id": 7, "nombre": "Inversor 3kW", "imagen": "inv.jpg"}


def _tokens_de(llamada):
    """La lista de tokens con la que se llamó a enviar_push_fcm."""
    return llamada[0][2]


class RestockAvisaATodosTest(unittest.TestCase):

    def test_sin_nadie_esperando_igual_se_avisa_a_los_suscriptores(self):
        # Este es el caso que no funcionaba.
        db = _FakeDatabase({"tokens": {"d1": {"token": "T1"}, "d2": {"token": "T2"}}})
        with patch.object(sn, "enviar_push_fcm") as envio:
            sn.procesar_restock(MagicMock(), db, [ITEM], {})
        envio.assert_called_once()
        self.assertCountEqual(["T1", "T2"], _tokens_de(envio.call_args))

    def test_quien_pidio_el_aviso_recibe_el_suyo_y_no_el_general(self):
        db = _FakeDatabase({
            "tokens": {"d1": {"token": "PIDIO"}, "d2": {"token": "OTRO"}},
            "avisos_stock/7": {"k": {"token": "PIDIO", "ts": 1}},
        })
        with patch.object(sn, "enviar_push_fcm") as envio:
            sn.procesar_restock(MagicMock(), db, [ITEM], {})
        self.assertEqual(2, envio.call_count)
        dirigido, general = envio.call_args_list
        self.assertEqual(["PIDIO"], _tokens_de(dirigido))
        self.assertEqual(["OTRO"], _tokens_de(general),
                         "el que lo pidió recibiría el mismo aviso dos veces")

    def test_la_peticion_atendida_se_borra(self):
        db = _FakeDatabase({
            "tokens": {"d": {"token": "T"}},
            "avisos_stock/7": {"k": {"token": "T", "ts": 1}},
        })
        with patch.object(sn, "enviar_push_fcm"):
            sn.procesar_restock(MagicMock(), db, [ITEM], {})
        self.assertNotIn("avisos_stock/7", db._data)
        self.assertEqual(0, db._data.get("avisos_count/7/count"))

    def test_los_telefonos_de_la_lista_de_espera_van_al_admin(self):
        db = _FakeDatabase({
            "tokens": {"d": {"token": "T"}},
            "lista_espera/7": {"e": {"tel": "5355551234", "productoId": 7, "ts": 1}},
        })
        with patch.object(sn, "enviar_push_fcm"), \
             patch.object(sn, "enviar_push_admin") as admin:
            sn.procesar_restock(MagicMock(), db, [ITEM], {})
        admin.assert_called_once()
        self.assertIn("5355551234", admin.call_args[0][3])
        self.assertNotIn("lista_espera/7", db._data)

    def test_no_repite_el_aviso_si_el_stock_baila(self):
        # Una unidad que entra, se vende y vuelve a entrar el mismo día no son
        # tres noticias.
        db = _FakeDatabase({"tokens": {"d": {"token": "T"}}})
        memoria = {}
        with patch.object(sn, "enviar_push_fcm") as envio:
            sn.procesar_restock(MagicMock(), db, [ITEM], memoria)
            sn.procesar_restock(MagicMock(), db, [ITEM], memoria)
        self.assertEqual(1, envio.call_count)
        self.assertIn("restock_7", memoria)

    def test_el_aviso_de_quien_lo_pidio_lleva_la_foto_de_miniatura(self):
        # `icon` es la imagen pequeña que sale al lado del texto. Al que pidió
        # el aviso se le enseña el producto, no el logo de la tienda.
        db = _FakeDatabase({
            "tokens": {"d": {"token": "PIDIO"}},
            "avisos_stock/7": {"k": {"token": "PIDIO", "ts": 1}},
        })
        with patch.object(sn, "enviar_push_fcm") as envio:
            sn.procesar_restock(MagicMock(), db, [ITEM], {})
        dirigido = envio.call_args_list[0]
        self.assertEqual("inv.jpg", dirigido.kwargs.get("icono"))
        self.assertIn("Inversor 3kW", dirigido[0][4], "el título nombra el producto")

    def test_sin_suscriptores_no_revienta(self):
        db = _FakeDatabase({})
        with patch.object(sn, "enviar_push_fcm") as envio:
            sn.procesar_restock(MagicMock(), db, [ITEM], {})
        envio.assert_not_called()


if __name__ == "__main__":
    unittest.main()
