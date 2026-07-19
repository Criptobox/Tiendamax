"""
Tests para scripts/send_notifications.py::procesar_avisos_precio — el aviso
dirigido de bajada de precio a quienes tienen el producto en ❤️ Me Gusta
con push habilitado (wishlist_avisos/{productId}).

Corre sin red real ni Firebase: fake_database duck-typed + enviar_push_fcm
mockeado. No importa firebase_admin (send_notifications lo importa recién
dentro de init_firebase(), no a nivel de módulo).
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

    def delete(self):
        self._store.pop(self._path, None)


class _FakeDatabase:
    def __init__(self, data):
        self._data = data

    def reference(self, path):
        return _FakeRef(self._data, path)


class ProcesarAvisosPrecioTest(unittest.TestCase):
    def test_notifica_solo_a_los_que_tienen_el_producto_en_wishlist(self):
        db = _FakeDatabase({
            "wishlist_avisos/100": {
                "tok1": {"token": "TOKEN_A", "ts": 1},
                "tok2": {"token": "TOKEN_B", "ts": 2},
            }
        })
        rebajas = [{"id": 100, "nombre": "Router X", "antes": 50, "ahora": 35, "imagen": "img.jpg"}]
        with patch.object(sn, "enviar_push_fcm") as mock_send:
            sn.procesar_avisos_precio(MagicMock(), db, rebajas)
        mock_send.assert_called_once()
        args = mock_send.call_args
        tokens_enviados = args[0][2]
        self.assertCountEqual(tokens_enviados, ["TOKEN_A", "TOKEN_B"])
        self.assertIn("Router X", args[0][5])  # body menciona el producto
        self.assertIn("35", args[0][5])

    def test_sin_suscriptores_no_envia_nada(self):
        db = _FakeDatabase({})
        rebajas = [{"id": 999, "nombre": "Nadie lo tiene en favoritos", "antes": 10, "ahora": 8}]
        with patch.object(sn, "enviar_push_fcm") as mock_send:
            sn.procesar_avisos_precio(MagicMock(), db, rebajas)
        mock_send.assert_not_called()

    def test_no_borra_la_suscripcion_tras_notificar(self):
        # A diferencia de restock (evento consumido una vez), el interés en el
        # precio de un producto en favoritos debe seguir vivo para la próxima
        # rebaja del mismo producto.
        db = _FakeDatabase({"wishlist_avisos/5": {"t": {"token": "TOK", "ts": 1}}})
        with patch.object(sn, "enviar_push_fcm"):
            sn.procesar_avisos_precio(MagicMock(), db, [{"id": 5, "nombre": "X", "antes": 9, "ahora": 7}])
        self.assertIn("wishlist_avisos/5", db._data)

    def test_multiples_productos_rebajados_notifica_cada_uno(self):
        db = _FakeDatabase({
            "wishlist_avisos/1": {"a": {"token": "T1", "ts": 1}},
            "wishlist_avisos/2": {"b": {"token": "T2", "ts": 1}},
        })
        rebajas = [
            {"id": 1, "nombre": "Prod 1", "antes": 20, "ahora": 15},
            {"id": 2, "nombre": "Prod 2", "antes": 30, "ahora": 25},
        ]
        with patch.object(sn, "enviar_push_fcm") as mock_send:
            sn.procesar_avisos_precio(MagicMock(), db, rebajas)
        self.assertEqual(mock_send.call_count, 2)


if __name__ == "__main__":
    unittest.main()
