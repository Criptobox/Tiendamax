"""Cuándo se avisa de la tasa (push y canal de Telegram): scripts/tasa_aviso.py.

El dueño pidió avisar solo en múltiplos de 5, redondeando de 3 para arriba.
Antes salía un aviso por cada cambio de elTOQUE: 166 en 30 días, varios por
tarde. La serie de abajo es la tasa del cliente real de esos días.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))
sys.path.insert(0, str(RAIZ / "bot"))

import tasa_aviso as ta  # noqa: E402


def avisos(serie, ultima):
    out = []
    for v in serie:
        n = ta.toca_avisar(v, ultima)
        if n is not None:
            out.append(n)
            ultima = n
    return out


class RedondeoTest(unittest.TestCase):
    def test_de_tres_para_arriba_sube(self):
        casos = {720: 720, 721: 720, 722: 720, 723: 725, 724: 725, 725: 725,
                 726: 725, 727: 725, 728: 730, 729: 730}
        for v, esperado in casos.items():
            self.assertEqual(esperado, ta.redondear(v), v)

    def test_los_decimales_redondean_como_se_muestran(self):
        # 722.5 se muestra 723 (.5 sube, no al par como round()) → 725
        self.assertEqual(725, ta.redondear(722.5))
        self.assertEqual(720, ta.redondear(722.4))

    def test_tasa_del_cliente_lleva_el_margen(self):
        self.assertEqual(730.0, ta.tasa_cliente({"tasaMN": 720, "margenMN": 10}))
        self.assertEqual(720.0, ta.tasa_cliente({"tasaMN": 720, "margenMN": 0}))
        self.assertEqual(730.0, ta.tasa_cliente({"tasaMN": 720}))
        self.assertIsNone(ta.tasa_cliente({"tasaMN": 0}))


class CuandoAvisarTest(unittest.TestCase):
    def test_solo_multiplos_de_cinco(self):
        for n in avisos([721, 724, 726, 729, 733, 738], 720):
            self.assertEqual(0, n % 5)

    def test_la_tarde_del_24_de_agosto_no_rebota(self):
        """687 ↔ 688 toda la tarde, en la frontera: solo con redondear eran
        once avisos 685 → 690 → 685…"""
        serie = [688, 687, 687.5, 687, 688, 687, 688, 687, 688, 687, 688]
        self.assertEqual([], avisos(serie, 690))
        self.assertEqual([], avisos(serie, 685))

    def test_una_subida_de_verdad_se_avisa_paso_a_paso(self):
        self.assertEqual([695, 700, 705], avisos([691, 694, 696, 699, 701, 704], 690))

    def test_la_bajada_tambien(self):
        self.assertEqual([715], avisos([718, 716, 715], 720))

    def test_sin_ultimo_avisado_no_avisa(self):
        self.assertIsNone(ta.toca_avisar(733, None))

    def test_un_mes_real_de_tasas(self):
        """Del historial de config.json (tasa + margen), 25 ago – 22 sep."""
        serie = [688, 687, 688, 690, 693, 692.5, 693, 695, 697, 700, 703, 702.5,
                 703, 705, 708, 707, 707.5, 708, 710, 713, 712, 715, 712, 715,
                 708.7, 707.48, 707.53, 712, 713, 718, 717, 717.5, 720, 723, 728,
                 727, 730, 720, 723, 727.5, 728, 730]
        n = avisos(serie, 690)
        self.assertLessEqual(len(n), 16, n)
        self.assertEqual(730, n[-1])


class CanalTelegramTest(unittest.TestCase):
    def correr(self, cfg, envio_ok=True):
        import canal_tasa
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "config.json"
            ruta.write_text(json.dumps(cfg), encoding="utf-8")
            enviados = []
            with patch.object(canal_tasa, "CONFIG_PATH", ruta), \
                 patch.object(canal_tasa, "send", side_effect=lambda t: enviados.append(t) or envio_ok):
                rc = canal_tasa.main()
            return rc, enviados, json.loads(ruta.read_text(encoding="utf-8"))

    def test_publica_redondeado_y_lo_apunta(self):
        rc, env, cfg = self.correr({"tasaMN": 714, "margenMN": 10, "tasaAvisadaTelegram": 720})
        self.assertEqual(0, rc)
        self.assertEqual(1, len(env))
        self.assertIn("725 CUP", env[0])
        self.assertEqual(725, cfg["tasaAvisadaTelegram"])

    def test_no_publica_si_no_toca(self):
        rc, env, cfg = self.correr({"tasaMN": 712, "margenMN": 10, "tasaAvisadaTelegram": 720})
        self.assertEqual((0, []), (rc, env))
        self.assertEqual(720, cfg["tasaAvisadaTelegram"])

    def test_primera_vez_solo_apunta(self):
        rc, env, cfg = self.correr({"tasaMN": 712, "margenMN": 10})
        self.assertEqual((0, []), (rc, env))
        self.assertEqual(720, cfg["tasaAvisadaTelegram"])

    def test_si_telegram_falla_no_lo_da_por_publicado(self):
        rc, env, cfg = self.correr({"tasaMN": 714, "margenMN": 10, "tasaAvisadaTelegram": 720}, envio_ok=False)
        self.assertEqual(1, rc)
        self.assertEqual(720, cfg["tasaAvisadaTelegram"])


class WorkflowTest(unittest.TestCase):
    WF = (RAIZ / ".github" / "workflows" / "update-eltoque-rate.yml").read_text(encoding="utf-8")

    def test_telegram_va_antes_del_commit(self):
        """canal_tasa.py apunta lo publicado en config.json: si va después
        del commit, se pierde y el canal repite el mismo aviso."""
        self.assertLess(self.WF.index("python bot/canal_tasa.py"),
                        self.WF.index("git commit -m \"chore: actualizar tasa base"))

    def test_si_telegram_falla_la_tasa_se_commitea_igual(self):
        linea = next(l for l in self.WF.splitlines() if "python bot/canal_tasa.py" in l)
        self.assertIn("||", linea, "sin esto, un fallo de Telegram congela los precios en MN")


if __name__ == "__main__":
    unittest.main()
