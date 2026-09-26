"""Lo que llega a Telegram.

El dueño decidió (26-sep-2026) qué quiere en su chat: TODO lo que cambie en la
tienda principal, más suscriptores, interesados/lista de espera y el radar
busco/compro. Fuera: el pack del día con la checklist de renovar en Revólico,
el reporte de las 9 PM, el aviso de web caída y el resumen del Copiloto.

Nada de esto falla con un error: un aviso que deja de llegar no avisa de que
dejó de llegar, y uno quitado que vuelve por un cron olvidado es ruido que
hace ignorar los que importan.
"""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import comparar_principal as cp  # noqa: E402

WF = ROOT / ".github" / "workflows"


def _fila(pid, nombre, stock=5, precio=100, moneda="USD", com=10, com_mon="USD", **kw):
    f = {"id": pid, "nombre": nombre, "stock": stock, "precio": precio,
         "precioMoneda": moneda, "comision": com, "comisionMoneda": com_mon}
    f.update(kw)
    return f


class CambiosPrincipalTest(unittest.TestCase):
    def setUp(self):
        self.antes = {
            "1": _fila("1", "Router A", stock=4),
            "2": _fila("2", "Router B", stock=0),
            "3": _fila("3", "Switch 8", precio=50),
            "4": _fila("4", "Linterna", com=1500, com_mon="MN"),
            "5": _fila("5", "Cable", stock=10),
            "6": _fila("6", "Retirado", stock=1),
        }
        self.ahora = [
            _fila("1", "Router A", stock=0),                 # agotado
            _fila("2", "Router B", stock=7),                 # repuesto
            _fila("3", "Switch 8", precio=45),               # precio
            _fila("4", "Linterna", com=2, com_mon="USD"),    # comisión (cambia moneda)
            _fila("5", "Cable", stock=8),                    # cantidad
            _fila("7", "Nuevo", stock=3),                    # nuevo
        ]
        self.c = cp.cambios_principal(self.antes, self.ahora)

    def test_detecta_cada_tipo(self):
        tipos = {k: [(a or f or {}).get("id") for a, f in v] for k, v in self.c.items()}
        self.assertEqual(tipos["agotados"], ["1"])
        self.assertEqual(tipos["repuestos"], ["2"])
        self.assertEqual(tipos["precio"], ["3"])
        self.assertEqual(tipos["comision"], ["4"])
        self.assertEqual(tipos["cantidad"], ["5"])
        self.assertEqual(tipos["nuevos"], ["7"])
        self.assertEqual(tipos["quitados"], ["6"])

    def test_la_primera_corrida_no_avisa_de_nada(self):
        """Sin fichero anterior, los 111 serían «nuevos»: un mensaje enorme
        que no dice nada y enseña a no leer los siguientes."""
        c = cp.cambios_principal({}, self.ahora)
        self.assertEqual(0, sum(len(v) for v in c.values()))
        self.assertEqual("", cp.mensaje_cambios(c, {}, set()))

    def test_sin_cambios_no_hay_mensaje(self):
        mismo = {f["id"]: dict(f) for f in self.ahora}
        c = cp.cambios_principal(mismo, self.ahora)
        self.assertEqual("", cp.mensaje_cambios(c, {}, set()))

    def test_la_moneda_viaja_con_la_cifra(self):
        """1500 MN → $2 no es «bajó 1498»: se dice tal cual, con su moneda,
        y sin la flecha de bajada."""
        txt = cp.mensaje_cambios(self.c, {}, set())
        linea = next(l for l in txt.splitlines() if "1500 MN" in l)
        self.assertIn("1500 MN ➜ <b>$2</b>", linea)
        self.assertNotIn("📉", linea)
        self.assertIn("$50 ➜ <b>$45</b> 📉", txt, "misma moneda y bajó: se marca")

    def test_lo_tuyo_va_al_lado(self):
        mios = {"1": {"id": "m1", "nombre": "Mi Router A", "stock": 0},
                "3": {"id": "m3", "nombre": "Mi Switch", "precioActual": 55, "stock": 2},
                "2": {"id": "m2", "nombre": "Mi Router B", "stock": 0}}
        txt = cp.mensaje_cambios(self.c, mios, {"m1"})
        self.assertIn("<b>Router A</b>\n├ Tenía 4 ➜ <b>0</b>\n└ ✅ Lo agoté en tu tienda", txt)
        self.assertIn("<b>Switch 8</b>\n├ $50 ➜ <b>$45</b> 📉\n└ 🏷️ El tuyo: $55", txt)
        self.assertIn("Lo tienes agotado: ponle stock", txt,
                      "un repuesto que tú tienes en 0 es una venta que puedes hacer hoy: hay que decirlo")
        self.assertIn("<b>Nuevo</b>\n├ $100 · 3 disponibles\n└ ➖ No lo tienes en tu tienda", txt)

    def test_agotado_que_tu_sigues_vendiendo_lo_dice(self):
        mios = {"1": {"id": "m1", "nombre": "Mi Router A", "stock": 5}}
        txt = cp.mensaje_cambios(self.c, mios, set())
        self.assertIn("Tú aún tienes 5", txt)

    def test_cabe_en_un_mensaje_de_telegram_y_no_corta_etiquetas(self):
        """Telegram rechaza el mensaje ENTERO si pasa de 4096 o si queda un
        <b> sin cerrar: el recorte tiene que ser por productos completos."""
        antes = {str(i): _fila(str(i), f"Producto largo número {i} " * 3, stock=5, precio=10) for i in range(300)}
        ahora = [_fila(str(i), f"Producto largo número {i} " * 3, stock=0, precio=12) for i in range(300)]
        txt = cp.mensaje_cambios(cp.cambios_principal(antes, ahora), {}, set())
        self.assertLessEqual(len(txt), 4096)
        for tag in ("b", "i", "code"):
            self.assertEqual(txt.count(f"<{tag}>"), txt.count(f"</{tag}>"), tag)
        self.assertTrue("…y" in txt or "No cabe todo" in txt)

    def test_un_nombre_con_simbolos_no_rompe_el_html(self):
        antes = {"9": _fila("9", "Cable <RJ45> & más", stock=3)}
        ahora = [_fila("9", "Cable <RJ45> & más", stock=0)]
        txt = cp.mensaje_cambios(cp.cambios_principal(antes, ahora), {}, set())
        self.assertIn("Cable &lt;RJ45&gt; &amp; más", txt)
        self.assertNotIn("<RJ45>", txt)

    def test_arriba_va_el_resumen(self):
        txt = cp.mensaje_cambios(self.c, {}, set())
        cabeza = txt.split("┄")[0]
        self.assertIn("🔀 <b>Tienda principal</b>", cabeza)
        self.assertIn("7 cambios", cabeza)
        for trozo in ("🔴 1 agotado", "🟢 1 repuesto", "💲 1 precio", "💰 1 comisión",
                      "🆕 1 nuevo", "🗑️ 1 retirado", "📦 1 cantidad"):
            self.assertIn(trozo, cabeza)

    def test_se_manda_en_html_con_boton_a_comparar(self):
        visto = {}

        class _R:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def abrir(req, timeout=0):
            visto["cuerpo"] = json.loads(req.data.decode("utf-8"))
            return _R()
        with mock.patch.dict(os.environ, {"BOT_TOKEN": "t", "ADMIN_CHAT_ID": "1"}), \
                mock.patch("urllib.request.urlopen", abrir):
            self.assertTrue(cp.enviar_telegram("<b>hola</b>"))
        c = visto["cuerpo"]
        self.assertEqual("HTML", c["parse_mode"])
        boton = c["reply_markup"]["inline_keyboard"][0][0]
        self.assertTrue(boton["url"].endswith("/admin.html#comparar"),
                        "el botón tiene que abrir 🔀 Comparar, no el panel en Inicio")

    def test_sin_token_no_intenta_enviar(self):
        with mock.patch.dict(os.environ, {"BOT_TOKEN": "", "ADMIN_CHAT_ID": ""}), \
                mock.patch("urllib.request.urlopen") as abrir:
            self.assertFalse(cp.enviar_telegram("hola"))
            abrir.assert_not_called()

    def test_el_mismo_emparejamiento_para_agotar_y_para_avisar(self):
        """Con dos emparejamientos, el aviso diría «lo agoté en tu tienda» de un
        producto distinto del que se agotó."""
        src = (ROOT / "scripts" / "comparar_principal.py").read_text(encoding="utf-8")
        cuerpo = src[src.index("def agotar_mios("):src.index("def escribir_catalogo_mio(")]
        self.assertIn("emparejar(productos, catalogo_mio, enlaces)", cuerpo)


def _pasos(fichero):
    """Los pasos de un workflow como texto, {nombre: bloque}. Se lee a mano y
    no con PyYAML, que no está en las dependencias de CI."""
    txt = (WF / fichero).read_text(encoding="utf-8")
    trozos = txt.split("\n      - name: ")[1:]
    return {t.split("\n", 1)[0].strip(): t for t in trozos}


def _cabecera(fichero):
    """Lo que va antes de `jobs:` — el bloque `on:`, sin comentarios."""
    txt = (WF / fichero).read_text(encoding="utf-8").split("\njobs:")[0]
    return "\n".join(l for l in txt.splitlines() if not l.strip().startswith("#"))


class WorkflowTelegramTest(unittest.TestCase):
    def setUp(self):
        self.pasos = _pasos("comparar-principal.yml")
        self.nombres = list(self.pasos)

    def _paso(self, prefijo):
        return next(v for k, v in self.pasos.items() if k.startswith(prefijo))

    def test_se_envia_solo_despues_de_subir(self):
        """Si el push se rechaza, la corrida se rehace sobre origin/main y el
        mensaje se recalcula: mandarlo desde el script lo mandaría dos veces."""
        i_commit = self.nombres.index("Commit y push")
        i_tg = next(i for i, n in enumerate(self.nombres) if n.startswith("Avisar por Telegram"))
        self.assertGreater(i_tg, i_commit)
        tg = self._paso("Avisar por Telegram")
        self.assertIn("steps.commit.outputs.subido == '1'", tg)
        self.assertIn("--enviar-telegram", tg)
        self.assertIn("BOT_TOKEN: ${{ secrets.BOT_TOKEN }}", tg)
        self.assertIn("ADMIN_CHAT_ID: ${{ secrets.ADMIN_CHAT_ID }}", tg)

    def test_las_dos_corridas_del_script_preparan_el_mensaje(self):
        for nombre in ("Leer el catálogo de la principal", "Commit y push"):
            self.assertIn("AVISO_TELEGRAM:", self._paso(nombre), nombre)
        self.assertIn('echo "subido=1"', self._paso("Commit y push"))

    def test_pages_solo_si_hubo_commit(self):
        self.assertIn("steps.commit.outputs.subido == '1'", self._paso("Publicar en GitHub Pages"))

    def test_el_script_no_manda_telegram_por_su_cuenta(self):
        src = (ROOT / "scripts" / "comparar_principal.py").read_text(encoding="utf-8")
        cuerpo = src[src.index("def main() -> int:"):src.index('if __name__ == "__main__":')]
        self.assertNotIn("enviar_telegram(", cuerpo)


class LoQuitadoNoVuelveTest(unittest.TestCase):
    def test_pack_del_dia_y_reporte_ya_no_corren_solos(self):
        for f in ("marketing-diario.yml", "telegram-daily-report.yml"):
            cab = _cabecera(f)
            self.assertNotIn("schedule:", cab, f"{f} volvió a tener cron: el dueño lo quitó de Telegram")
            self.assertIn("workflow_dispatch", cab)

    def test_la_salud_web_sigue_pero_sin_telegram(self):
        self.assertIn("schedule:", _cabecera("web-health-agent.yml"),
                      "el Copiloto lee admin_meta/web_health: tiene que seguir corriendo")
        for bloque in _pasos("web-health-agent.yml").values():
            self.assertNotIn("secrets.BOT_TOKEN", bloque)

    def test_alertas_sin_resumen_del_copiloto(self):
        src = (ROOT / "scripts" / "admin_alerts.py").read_text(encoding="utf-8")
        self.assertNotIn("build_copilot_digest", src)
        for sigue in ("_alertas_suscriptores", "interesados", "lista_espera"):
            self.assertIn(sigue, src)

    def test_el_radar_busco_compro_sigue(self):
        self.assertIn("schedule:", _cabecera("demanda-radar.yml"))


if __name__ == "__main__":
    unittest.main()
