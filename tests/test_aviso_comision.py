"""
Recordatorio mensual de la comisión por cobrar (scripts/aviso_comision.py).

Lo que importa y no se ve: solo cuentan los meses CERRADOS (el actual aún se
acumula), USD y MN nunca se suman, sin nada pendiente no se manda nada, y el
resumen viejo avisa de serlo. Y que el panel deje el resumen donde el script lo lee.
"""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

import aviso_comision as ac  # noqa: E402

HOY = datetime(2026, 11, 1, 14, 0, tzinfo=timezone.utc)
ADMIN = (RAIZ / "admin.html").read_text(encoding="utf-8")
FLUJO = (RAIZ / ".github" / "workflows" / "aviso-comision.yml").read_text(encoding="utf-8")


class AvisoComisionTest(unittest.TestCase):
    def test_solo_meses_cerrados(self):
        r = {"meses": {"2026-10": {"usd": 38, "mn": 0, "n": 2}, "2026-11": {"usd": 99, "mn": 0, "n": 5}}}
        t = ac.armar_aviso(r, HOY)
        self.assertIn("Octubre de 2026", t)
        self.assertIn("$38", t)
        self.assertNotIn("99", t)          # noviembre aún se acumula

    def test_usd_y_mn_nunca_se_suman(self):
        r = {"meses": {"2026-09": {"usd": 22, "mn": 0, "n": 1}, "2026-10": {"usd": 38, "mn": 1800, "n": 3}}}
        t = ac.armar_aviso(r, HOY)
        self.assertIn("$60 + 1,800 MN", t)  # total por moneda
        self.assertNotIn("1,860", t)
        self.assertIn("4 ventas", t)

    def test_sin_nada_no_se_manda_nada(self):
        self.assertIsNone(ac.armar_aviso({"meses": {}}, HOY))
        self.assertIsNone(ac.armar_aviso({"meses": {"2026-11": {"usd": 5, "mn": 0, "n": 1}}}, HOY))
        self.assertIsNone(ac.armar_aviso({"meses": {"2026-10": {"usd": 0, "mn": 0, "n": 0}}}, HOY))
        self.assertIsNone(ac.armar_aviso(None, HOY))

    def test_entrada_rota_no_tumba_el_aviso(self):
        for basura in ({"meses": []}, {"meses": {"x": 1}}, {"meses": {"2026-10": "a"}}, {}, {"meses": {"2026-1": {"usd": 3}}}):
            self.assertIsNone(ac.armar_aviso(basura, HOY))

    def test_resumen_viejo_lo_dice(self):
        viejo = int(datetime(2026, 9, 1, tzinfo=timezone.utc).timestamp() * 1000)
        r = {"ts": viejo, "meses": {"2026-10": {"usd": 38, "mn": 0, "n": 2}}}
        self.assertIn("hace", ac.armar_aviso(r, HOY))
        reciente = int(datetime(2026, 10, 30, tzinfo=timezone.utc).timestamp() * 1000)
        r["ts"] = reciente
        self.assertNotIn("puede que ya hayas cobrado", ac.armar_aviso(r, HOY))

    def test_el_panel_deja_el_resumen_donde_el_script_lo_lee(self):
        self.assertIn("/privado/comision_pendiente.json", ADMIN)
        self.assertIn('db.reference("/privado/comision_pendiente")', (RAIZ / "scripts" / "aviso_comision.py").read_text(encoding="utf-8"))

    def test_el_flujo_corre_el_dia_1_y_tiene_sus_secretos(self):
        self.assertIn("'0 14 1 * *'", FLUJO)
        for s in ("BOT_TOKEN", "ADMIN_CHAT_ID", "FIREBASE_SERVICE_ACCOUNT"):
            self.assertIn("secrets." + s, FLUJO)


if __name__ == "__main__":
    unittest.main()
