"""El ciclo completo de send_notifications.py, con una base falsa.

Los tests de al lado prueban las piezas. Este prueba lo que el dueño describió:

  · "las notificaciones de productos rebajados salen cada vez que se toca
    productos" — se bajaba un precio una vez y el aviso salía en cada pasada.
  · "los productos nuevos no se notifican" — nunca llegaban a detectarse.
  · "si se repone un equipo que se había agotado debería notificar a todos".

Se corre main() varias veces seguidas contra la misma base falsa, que es
justamente lo que hace el cron nueve veces al día.
"""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

import send_notifications as sn  # noqa: E402


class _Ref:
    """Referencia a un nodo de un dict anidado, con la API que usa el script."""

    def __init__(self, raiz, camino):
        self._raiz = raiz
        self._camino = [t for t in str(camino).split("/") if t]

    def _padre(self, crear=False):
        nodo = self._raiz
        for tramo in self._camino[:-1]:
            if tramo not in nodo or not isinstance(nodo[tramo], dict):
                if not crear:
                    return None
                nodo[tramo] = {}
            nodo = nodo[tramo]
        return nodo

    def get(self):
        padre = self._padre()
        if padre is None:
            return None
        # Copia, como haría la red. Devolver el dict vivo escondía justo el bug
        # que este fichero vigila: `cola` y el `current` de la transacción
        # acababan siendo el MISMO objeto y la fusión no tenía nada que fusionar.
        return copy.deepcopy(padre.get(self._camino[-1]))

    def set(self, valor):
        self._padre(crear=True)[self._camino[-1]] = valor

    def update(self, valores):
        padre = self._padre(crear=True)
        actual = padre.get(self._camino[-1])
        if not isinstance(actual, dict):
            actual = {}
        actual.update(valores)
        padre[self._camino[-1]] = actual

    def delete(self):
        padre = self._padre()
        if padre is not None:
            padre.pop(self._camino[-1], None)

    def child(self, sub):
        return _Ref(self._raiz, "/".join(self._camino + [str(sub)]))

    def transaction(self, fn):
        self.set(fn(self.get()))


class _Db:
    def __init__(self, datos):
        self.datos = datos

    def reference(self, camino):
        return _Ref(self.datos, camino)


def _producto(pid, precio=100, stock=5, original=0):
    return {"id": pid, "nombre": f"Producto {pid}", "precioActual": precio,
            "precioOriginal": original, "stock": stock, "imagen": f"{pid}.jpg"}


class FlujoTest(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(__file__).resolve().parent / "_tmp_flujo"
        self.tmp.mkdir(exist_ok=True)
        self.catalogo = [_producto(1), _producto(2, stock=0)]
        self._escribir()
        (self.tmp / "config.json").write_text(json.dumps({"tasaMN": 400}), encoding="utf-8")
        self.datos = {"tokens": {"d1": {"token": "TOK1"}, "d2": {"token": "TOK2"}}}
        self.db = _Db(self.datos)

    def tearDown(self):
        for f in self.tmp.glob("*"):
            f.unlink()
        self.tmp.rmdir()

    def _escribir(self):
        (self.tmp / "productos.json").write_text(json.dumps(self.catalogo), encoding="utf-8")

    def _correr(self, diurno=True):
        """Una pasada del script. Devuelve los push enviados a los clientes."""
        enviados = []

        def _fake_envio(msg, db, tokens, keys, title, body, link, imagen=None, tag=None):
            enviados.append({"title": title, "body": body, "tokens": list(tokens), "tag": tag})

        with patch.object(sn, "init_firebase", return_value=(MagicMock(), self.db)), \
             patch.object(sn, "ROOT", self.tmp), \
             patch.object(sn, "es_hora_diurna", return_value=diurno), \
             patch.object(sn, "enviar_push_fcm", side_effect=_fake_envio):
            self.assertEqual(0, sn.main())
        return enviados

    def _sin_descanso(self):
        """Borra el anti-spam por tipo, para poder mirar el vaciado de la cola
        sin que el cooldown de 4 h tape lo que se está probando."""
        self.datos.get("notification_queue", {}).get("ultimo_push", {}).clear()

    # ── La primera pasada solo toma nota ────────────────────────────────
    def test_la_primera_pasada_no_anuncia_la_tienda_entera(self):
        self.assertEqual([], self._correr())
        self.assertIn("catalogo", self.datos["notificaciones_estado"])

    # ── Rebajas: una vez, no en cada pasada ─────────────────────────────
    #
    # El caso que fallaba es el de dos pasadas: el precio se toca de noche
    # —cuando no se envía nada— y la rebaja se queda EN EL NODO esperando. Al
    # día siguiente otra corrida la lee, la manda y vacía su copia... y al
    # guardar, la fusión la veía todavía en el nodo, no sabía que se acababa de
    # enviar, y la devolvía a su sitio. De ahí en adelante salía en cada pasada.
    def test_una_rebaja_encolada_de_noche_se_avisa_UNA_vez(self):
        self._correr()                                   # toma nota del estado
        self.catalogo[0].update(precioActual=70, precioOriginal=100)
        self._escribir()

        self.assertEqual([], self._correr(diurno=False), "de noche no se manda")
        self.assertEqual(1, len(self.datos["notification_queue"]["rebajas_pendientes"]),
                         "la rebaja tenía que quedarse esperando en el nodo")

        primera = self._correr()
        self.assertEqual(1, len(primera), "la rebaja tenía que avisarse")
        self.assertIn("Rebaja", primera[0]["title"])
        self.assertEqual([], self.datos["notification_queue"]["rebajas_pendientes"],
                         "la cola no se vació: el aviso volverá a salir")

        # Las pasadas del cron que repetían el aviso una y otra vez.
        for _ in range(3):
            self._sin_descanso()
            self.assertEqual([], self._correr(),
                             "el aviso de rebaja volvió a salir sin que nada cambiara")

    def test_un_producto_nuevo_encolado_de_noche_se_avisa_UNA_vez(self):
        self._correr()
        self.catalogo.append(_producto(3))
        self._escribir()
        self._correr(diurno=False)
        self.assertEqual(1, len(self.datos["notification_queue"]["nuevos_pendientes"]))

        self.assertEqual(1, len(self._correr()))
        self.assertEqual([], self.datos["notification_queue"]["nuevos_pendientes"])

    # ── Productos nuevos ────────────────────────────────────────────────
    def test_un_producto_nuevo_se_notifica(self):
        self._correr()
        self.catalogo.append(_producto(3))
        self._escribir()
        avisos = self._correr()
        self.assertEqual(1, len(avisos))
        self.assertIn("Nuevo", avisos[0]["title"])
        self.assertCountEqual(["TOK1", "TOK2"], avisos[0]["tokens"])

    def test_el_producto_nuevo_no_se_repite_al_dia_siguiente(self):
        self._correr()
        self.catalogo.append(_producto(3))
        self._escribir()
        self._correr()
        # Otro día: el lote diario vuelve a estar disponible, pero la cola ya
        # se vació de verdad, así que no hay nada que anunciar.
        self.datos["notification_queue"]["ultimo_lote_fecha"] = "2000-01-01"
        self.datos["notification_queue"]["ultimo_push"] = {}
        self.assertEqual([], self._correr())

    # ── Reposición de stock ─────────────────────────────────────────────
    def test_reponer_un_agotado_avisa_a_todos_los_suscriptores(self):
        self._correr()
        self.catalogo[1]["stock"] = 4          # el 2 estaba agotado
        self._escribir()
        avisos = self._correr()
        reposicion = [a for a in avisos if a["tag"] == "restock-todos-2"]
        self.assertEqual(1, len(reposicion), f"no salió el aviso general: {avisos}")
        self.assertCountEqual(["TOK1", "TOK2"], reposicion[0]["tokens"])

    def test_la_reposicion_no_se_repite_en_cada_pasada(self):
        self._correr()
        self.catalogo[1]["stock"] = 4
        self._escribir()
        self._correr()
        for _ in range(3):
            self.assertEqual([], [a for a in self._correr()
                                  if str(a["tag"]).startswith("restock")])

    # ── Un cambio que llega cuando el push falló ────────────────────────
    def test_el_cron_recoge_lo_que_la_corrida_por_push_no_vio(self):
        # No hay nada especial que hacer: la detección ya no depende de que la
        # corrida disparada por el commit se ejecutara.
        self._correr()
        self.catalogo.append(_producto(9))
        self._escribir()
        avisos = self._correr()
        self.assertTrue(any("Nuevo" in a["title"] for a in avisos))


if __name__ == "__main__":
    unittest.main()
