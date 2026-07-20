"""
Tests para scripts/admin_alerts.py — enfocado en _subscriber_identity(), la
función que evita que el bot avise "1 nuevo + 1 cancelado" cada 30 min por un
suscriptor cuyo deviceId cambia entre visitas (localStorage/IndexedDB que no
persiste), aunque sea el mismo dispositivo de siempre.

Corre sin red y sin Firebase: solo la función pura de identidad + el diff de
sets que arma main() en memoria.
"""
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

# admin_alerts.py lee BOT_TOKEN/ADMIN_CHAT_ID a nivel de módulo (no dentro de
# una función) — hay que setearlas ANTES de importar o el import explota.
os.environ.setdefault("BOT_TOKEN", "test-token")
os.environ.setdefault("ADMIN_CHAT_ID", "test-chat-id")

import admin_alerts as aa  # noqa: E402


def _tok(token="t" * 60, **kw):
    d = {"token": token}
    d.update(kw)
    return d


class SubscriberIdentityTest(unittest.TestCase):
    def test_prioriza_fingerprint_sobre_deviceid(self):
        t = _tok(fingerprint="fp_abc123", deviceId="did_xyz789")
        self.assertEqual(aa._subscriber_identity(t), "fp:fp_abc123")

    def test_usa_deviceid_si_no_hay_fingerprint(self):
        t = _tok(deviceId="did_xyz789")
        self.assertEqual(aa._subscriber_identity(t), "did:did_xyz789")

    def test_usa_token_como_ultimo_respaldo(self):
        t = _tok(token="a" * 60)
        self.assertEqual(aa._subscriber_identity(t), "tk:" + "a" * 60)

    def test_sin_token_no_es_suscriptor(self):
        self.assertIsNone(aa._subscriber_identity({"deviceId": "did_x"}))
        self.assertIsNone(aa._subscriber_identity({}))
        self.assertIsNone(aa._subscriber_identity(None))

    def test_deviceid_que_cambia_mismo_fingerprint_no_cuenta_como_churn(self):
        """El caso real reportado: mismo dispositivo, deviceId nuevo cada
        visita porque el navegador no persiste el carnet — con fingerprint
        estable, current == known, cero alertas falsas."""
        conocido = {aa._subscriber_identity(_tok(fingerprint="fp_estable", deviceId="did_viejo"))}
        actual = {aa._subscriber_identity(_tok(fingerprint="fp_estable", deviceId="did_nuevo"))}
        self.assertEqual(conocido, actual)
        self.assertEqual(actual - conocido, set())  # nuevos
        self.assertEqual(conocido - actual, set())  # perdidos

    def test_alta_real_si_cambia_fingerprint(self):
        """Un suscriptor genuinamente nuevo (fingerprint distinto) sigue
        detectándose como alta real."""
        conocido = {aa._subscriber_identity(_tok(fingerprint="fp_uno"))}
        actual = conocido | {aa._subscriber_identity(_tok(fingerprint="fp_dos"))}
        nuevos = actual - conocido
        self.assertEqual(len(nuevos), 1)

    def test_baja_real_si_desaparece_el_fingerprint(self):
        conocido = {aa._subscriber_identity(_tok(fingerprint="fp_uno")),
                    aa._subscriber_identity(_tok(fingerprint="fp_dos"))}
        actual = {aa._subscriber_identity(_tok(fingerprint="fp_uno"))}
        perdidos = conocido - actual
        self.assertEqual(len(perdidos), 1)


if __name__ == "__main__":
    unittest.main()
