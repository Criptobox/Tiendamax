"""Carrera entre workflows sobre /notification_queue.

Tres workflows ejecutan send_notifications.py. Antes cada uno tenía su propio
concurrency.group, y GitHub Actions solo serializa DENTRO de un grupo: a las
16:00 UTC coincidían dos crons al minuto exacto. Ahora comparten grupo, pero
la fusión sigue siendo necesaria — workflow_dispatch, reintentos y el trigger
por push pueden solaparse igual.
"""
import json
import re
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

WORKFLOWS = RAIZ / ".github" / "workflows"


class GrupoDeConcurrenciaTest(unittest.TestCase):
    """Los workflows que corren send_notifications.py tienen que compartir
    concurrency.group o GitHub Actions los deja arrancar a la vez."""

    def test_comparten_grupo(self):
        grupos = {}
        for wf in WORKFLOWS.glob("*.yml"):
            texto = wf.read_text(encoding="utf-8")
            if "scripts/send_notifications.py" not in texto:
                continue
            m = re.search(r"^concurrency:\n(?:\s*#[^\n]*\n)*\s*group:\s*(\S+)",
                          texto, re.M)
            self.assertIsNotNone(m, f"{wf.name} no declara concurrency.group")
            grupos[wf.name] = m.group(1)

        self.assertGreaterEqual(len(grupos), 2, "esperaba varios workflows")
        self.assertEqual(
            1, len(set(grupos.values())),
            f"cada workflow en su grupo => pueden correr a la vez: {grupos}",
        )


class FusionDeColaTest(unittest.TestCase):
    """_fusionar_cola se pasa a transaction(): tiene que calcular el valor
    nuevo A PARTIR de `current`. El bug era `lambda current: cola`, que
    ignoraba `current` y era un set() disfrazado."""

    @classmethod
    def setUpClass(cls):
        from send_notifications import _fusionar_cola
        cls.fusionar = staticmethod(_fusionar_cola)

    def test_sin_valor_previo_guarda_lo_nuestro(self):
        cola = {"nuevos_pendientes": [], "ultimo_push": {"a": 10}}
        self.assertEqual(cola, self.fusionar(None, cola))

    def test_no_pierde_lo_que_encolo_la_otra_corrida(self):
        # La otra corrida metió un producto después de nuestra lectura.
        cola = {"nuevos_pendientes": []}
        current = {"nuevos_pendientes": [{"id": "p2", "nombre": "Router"}]}
        out = self.fusionar(current, cola)
        self.assertEqual([{"id": "p2", "nombre": "Router"}],
                         out["nuevos_pendientes"],
                         "el pendiente de la otra corrida se perdía")

    def test_no_duplica_lo_que_ya_teniamos(self):
        item = {"id": "p1"}
        out = self.fusionar({"nuevos_pendientes": [item]},
                            {"nuevos_pendientes": [item]})
        self.assertEqual([item], out["nuevos_pendientes"])

    def test_el_antispam_se_queda_con_la_marca_mas_alta(self):
        # Si la otra corrida ya envió, su timestamp manda: quedarnos con el
        # nuestro (más viejo) reabriría la ventana y mandaría el push otra vez.
        out = self.fusionar({"ultimo_push": {"admin": 5000}},
                            {"ultimo_push": {"admin": 1000}})
        self.assertEqual(5000, out["ultimo_push"]["admin"])

    def test_conserva_claves_de_ambos_lados(self):
        out = self.fusionar({"ultimo_push": {"b": 2}},
                            {"ultimo_push": {"a": 1}})
        self.assertEqual({"a": 1, "b": 2}, out["ultimo_push"])

    def test_respeta_el_lote_diario_ya_marcado(self):
        out = self.fusionar({"ultimo_lote_fecha": "2026-08-01"},
                            {"ultimo_lote_fecha": ""})
        self.assertEqual("2026-08-01", out["ultimo_lote_fecha"])

    def test_es_pura_y_repetible(self):
        # transaction() puede reintentar: llamarla dos veces con lo mismo
        # tiene que dar lo mismo, y no puede mutar los argumentos.
        cola = {"nuevos_pendientes": [{"id": "p1"}], "ultimo_push": {"a": 1}}
        current = {"nuevos_pendientes": [{"id": "p2"}], "ultimo_push": {"a": 9}}
        copia_cola = json.loads(json.dumps(cola))
        copia_cur = json.loads(json.dumps(current))
        a = self.fusionar(current, cola)
        b = self.fusionar(current, cola)
        self.assertEqual(a, b)
        self.assertEqual(copia_cola, cola, "mutó `cola`")
        self.assertEqual(copia_cur, current, "mutó `current`")


if __name__ == "__main__":
    unittest.main()
