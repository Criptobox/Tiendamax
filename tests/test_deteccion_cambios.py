"""Los tres avisos que no salían, y el que salía de más.

Todo esto es la misma avería vista por cuatro lados:

  · La detección comparaba productos.json contra el commit ANTERIOR que tocó
    ese archivo (`git log -- productos.json`), y el workflow hacía checkout con
    `fetch-depth: 20`. Entre dos ediciones del catálogo se cuelan decenas de
    commits automáticos —solo `sync_resenas.py` mete varios por hora—, así que
    dentro de los 20 descargados productos.json aparecía UNA vez: sin término
    de comparación, la función devolvía None y no se detectaba nada. Ni
    productos nuevos, ni rebajas, ni reposiciones. Sin un error en el log.

  · Y lo que ya estaba encolado no se iba nunca: al guardar, la fusión veía las
    rebajas todavía en el nodo (no las habíamos escrito vacías aún) y las
    reponía. Cada pasada las volvía a mandar.

Aquí se fija el comportamiento nuevo: estado en la base en vez de git, y una
cola que se vacía de verdad sin perder lo que encole otra corrida a la vez.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import send_notifications as sn  # noqa: E402

DIA = 86400000


def prod(pid, precio=100, stock=5, original=0, nombre=None):
    return {"id": pid, "nombre": nombre or f"Producto {pid}",
            "precioActual": precio, "precioOriginal": original, "stock": stock}


class DeteccionContraElEstadoGuardadoTest(unittest.TestCase):

    def test_sin_estado_previo_no_anuncia_el_catalogo_entero(self):
        # Primera pasada contra una base sin apunte: los 128 productos serían
        # "nuevos" y saldría un push anunciando la tienda entera.
        c = sn.detectar_cambios_catalogo(None, [prod(1), prod(2)])
        self.assertEqual([], c["nuevos"])
        self.assertEqual([], c["rebajas"])
        self.assertEqual([], c["restock"])

    def test_detecta_un_producto_nuevo(self):
        anterior = sn.resumen_catalogo([prod(1)])
        c = sn.detectar_cambios_catalogo(anterior, [prod(1), prod(2)])
        self.assertEqual([2], [p["id"] for p in c["nuevos"]])

    def test_detecta_una_rebaja_con_sus_dos_precios(self):
        anterior = sn.resumen_catalogo([prod(1, precio=100)])
        c = sn.detectar_cambios_catalogo(anterior, [prod(1, precio=80)])
        self.assertEqual(1, len(c["rebajas"]))
        self.assertEqual((100, 80), (c["rebajas"][0]["antes"], c["rebajas"][0]["ahora"]))

    def test_una_subida_de_precio_no_es_una_rebaja(self):
        anterior = sn.resumen_catalogo([prod(1, precio=100)])
        self.assertEqual([], sn.detectar_cambios_catalogo(anterior, [prod(1, precio=120)])["rebajas"])

    def test_detecta_la_reposicion_de_un_agotado(self):
        anterior = sn.resumen_catalogo([prod(1, stock=0)])
        c = sn.detectar_cambios_catalogo(anterior, [prod(1, stock=3)])
        self.assertEqual([1], [r["id"] for r in c["restock"]])

    def test_vender_hasta_agotar_no_es_una_reposicion(self):
        anterior = sn.resumen_catalogo([prod(1, stock=3)])
        self.assertEqual([], sn.detectar_cambios_catalogo(anterior, [prod(1, stock=0)])["restock"])

    def test_una_pasada_sin_cambios_no_detecta_nada(self):
        # Lo que hace que correr la detección en CADA pasada del cron sea
        # inofensivo: en cuanto se apunta el estado, deja de haber diferencia.
        cat = [prod(1), prod(2, stock=0)]
        self.assertEqual({"nuevos": [], "rebajas": [], "restock": []},
                         sn.detectar_cambios_catalogo(sn.resumen_catalogo(cat), cat))

    def test_no_revienta_con_basura_en_el_catalogo(self):
        anterior = sn.resumen_catalogo([prod(1)])
        c = sn.detectar_cambios_catalogo(anterior, [None, "x", {}, prod(1, precio=50)])
        self.assertEqual(1, len(c["rebajas"]))


class DeteccionDeTasaTest(unittest.TestCase):

    def test_usa_la_ultima_tasa_vista_antes_que_tasaMNAnterior(self):
        # tasaMNAnterior solo lo escribe update_rate_from_eltoque.py: cuando el
        # dueño cambia la tasa a mano se queda con el valor viejo y el cambio
        # pasaba inadvertido.
        cfg = {"tasaMN": 400, "tasaMNAnterior": 400}
        self.assertEqual((400.0, 380.0), sn.detectar_tasa(cfg, 380))

    def test_sin_cambio_no_devuelve_nada(self):
        self.assertIsNone(sn.detectar_tasa({"tasaMN": 400}, 400))

    def test_cae_en_tasaMNAnterior_si_no_hay_estado(self):
        self.assertEqual((400.0, 390.0),
                         sn.detectar_tasa({"tasaMN": 400, "tasaMNAnterior": 390}, None))

    def test_sin_referencia_no_inventa_un_cambio(self):
        self.assertIsNone(sn.detectar_tasa({"tasaMN": 400}, None))


class LaColaSeVaciaDeVerdadTest(unittest.TestCase):
    """El bug que hacía salir '🏷️ N productos rebajados' una y otra vez."""

    def test_lo_enviado_no_vuelve_a_la_cola(self):
        item = {"id": "p1", "nombre": "Inversor"}
        # Lo mandamos y vaciamos la lista; en el nodo sigue estando.
        out = sn._fusionar_cola({"rebajas_pendientes": [item]},
                                {"rebajas_pendientes": []},
                                {"rebajas_pendientes": {sn._clave_item(item)}})
        self.assertEqual([], out["rebajas_pendientes"],
                         "la fusión repuso lo que se acababa de enviar")

    def test_sigue_sin_perder_lo_que_encolo_la_otra_corrida(self):
        enviado = {"id": "p1"}
        nuevo = {"id": "p2"}
        out = sn._fusionar_cola({"rebajas_pendientes": [enviado, nuevo]},
                                {"rebajas_pendientes": []},
                                {"rebajas_pendientes": {sn._clave_item(enviado)}})
        self.assertEqual([nuevo], out["rebajas_pendientes"])

    def test_el_producto_es_el_mismo_aunque_cambie_el_precio(self):
        # La identidad es el id. Comparando el dict entero, el mismo producto
        # con la foto o el precio cambiados colaba como entrada distinta.
        enviado = {"id": "p1", "ahora": 80}
        out = sn._fusionar_cola({"rebajas_pendientes": [{"id": "p1", "ahora": 75}]},
                                {"rebajas_pendientes": []},
                                {"rebajas_pendientes": {sn._clave_item(enviado)}})
        self.assertEqual([], out["rebajas_pendientes"])

    def test_sin_consumidos_se_comporta_como_antes(self):
        item = {"id": "p2"}
        out = sn._fusionar_cola({"nuevos_pendientes": [item]}, {"nuevos_pendientes": []})
        self.assertEqual([item], out["nuevos_pendientes"])

    def test_el_envio_declara_lo_que_vacia(self):
        # Vaciar una lista sin anotarlo en `consumidos` es exactamente el bug.
        src = (ROOT / "scripts" / "send_notifications.py").read_text(encoding="utf-8")
        cuerpo = src[src.index("# Lógica de envío"):]
        self.assertNotIn('cola["rebajas_pendientes"] = []', cuerpo,
                         "usa _vaciar(): vaciar a pelo lo repone la fusión")
        self.assertNotIn('cola["nuevos_pendientes"] = []', cuerpo,
                         "usa _vaciar(): vaciar a pelo lo repone la fusión")
        self.assertIn("guardar_cola(db_api, cola, consumidos)", cuerpo)


class ConteoDeSuscriptoresTest(unittest.TestCase):
    """El número que se apunta cada día tiene que ser el mismo que enseña el
    panel, o la línea del gráfico contradice al badge de al lado."""

    def test_un_aparato_con_varias_filas_cuenta_una_vez(self):
        # Pasa de verdad: el token de FCM rota y el código viejo escribía con
        # otra clave. Contando filas, un solo móvil parecían tres.
        datos = {
            "a": {"token": "T1", "deviceId": "did_1"},
            "b": {"token": "T2", "deviceId": "did_1"},
            "c": {"token": "T3", "deviceId": "did_2"},
        }
        self.assertEqual(2, sn.contar_dispositivos(datos))

    def test_sin_carnet_manda_la_huella(self):
        datos = {"a": {"token": "T1", "fingerprint": "fp_x"},
                 "b": {"token": "T2", "fingerprint": "fp_x"}}
        self.assertEqual(1, sn.contar_dispositivos(datos))

    def test_una_fila_antigua_no_suma_si_su_aparato_ya_se_reregistro(self):
        datos = {"viejo": {"token": "T1", "userAgent": "UA"},
                 "nuevo": {"token": "T2", "userAgent": "UA", "fingerprint": "fp_x"}}
        self.assertEqual(1, sn.contar_dispositivos(datos))

    def test_aguanta_nodos_vacios_o_con_basura(self):
        self.assertEqual(0, sn.contar_dispositivos(None))
        self.assertEqual(0, sn.contar_dispositivos({"a": None, "b": {}, "c": "x"}))

    def test_cuenta_igual_que_el_panel(self):
        # js/analytics.js hace lo mismo en el navegador; si las dos cuentas se
        # separan, el gráfico y el badge dicen cosas distintas.
        js = (ROOT / "js" / "analytics.js").read_text(encoding="utf-8")
        for marca in ("'did:' + t.deviceId", "'fp:' + t.fingerprint", "'tk:' + t.token"):
            self.assertIn(marca, js, "cambió el criterio del panel; ajusta contar_dispositivos")


class ElAvisoGeneralLlevaFotoTest(unittest.TestCase):

    def test_se_elige_el_de_mayor_descuento_en_porcentaje(self):
        # Por porcentaje y no por pesos: un 20 % en un cargador se lee como
        # ganga, 20 USD menos en un inversor de 900 no.
        cat = [{"id": 1, "precioOriginal": 900, "precioActual": 880},   # -2 %
               {"id": 2, "precioOriginal": 100, "precioActual": 60}]    # -40 %
        self.assertEqual(2, sn.mas_rebajado(cat)["id"])

    def test_sin_ofertas_no_devuelve_nada(self):
        self.assertIsNone(sn.mas_rebajado([{"id": 1, "precioActual": 50}]))
        self.assertIsNone(sn.mas_rebajado([]))

    def test_no_revienta_con_basura(self):
        self.assertEqual(1, sn.mas_rebajado(
            [None, "x", {}, {"id": 1, "precioOriginal": 10, "precioActual": 5}])["id"])


class SeguimientosVencidosTest(unittest.TestCase):

    def _reg(self, dias, hecho=""):
        ahora = 1_700_000_000_000
        return {"v1": {"ts": ahora - dias * DIA, "hecho": hecho}}, ahora

    def test_una_venta_de_ayer_todavia_no_toca(self):
        reg, ahora = self._reg(1)
        self.assertEqual([], sn.seguimientos_vencidos(reg, ahora))

    def test_a_los_tres_dias_toca_el_inicial(self):
        reg, ahora = self._reg(4)
        v = sn.seguimientos_vencidos(reg, ahora)
        self.assertEqual(["inicial"], [x["hito"] for x in v])

    def test_pasada_la_ventana_el_hito_se_salta_no_se_manda_tarde(self):
        # 20 días: el inicial (3 + 14 de ventana) ya no vale, y el de 30 aún no.
        reg, ahora = self._reg(20)
        self.assertEqual([], sn.seguimientos_vencidos(reg, ahora))

    def test_solo_sale_el_hito_mas_avanzado(self):
        # 35 días sin mirar esto: toca el de satisfacción, no los dos.
        reg, ahora = self._reg(35)
        self.assertEqual(["satisfaccion"], [x["hito"] for x in sn.seguimientos_vencidos(reg, ahora)])

    def test_lo_ya_atendido_no_vuelve(self):
        reg, ahora = self._reg(4, hecho="inicial")
        self.assertEqual([], sn.seguimientos_vencidos(reg, ahora))

    def test_el_ultimo_hito_no_caduca(self):
        reg, ahora = self._reg(300)
        self.assertEqual(["recompra"], [x["hito"] for x in sn.seguimientos_vencidos(reg, ahora)])

    def test_aguanta_un_nodo_vacio_o_con_basura(self):
        self.assertEqual([], sn.seguimientos_vencidos(None))
        self.assertEqual([], sn.seguimientos_vencidos({"a": "x", "b": {}, "c": {"ts": 0}}))

    def test_los_hitos_son_los_mismos_que_los_del_panel(self):
        # tm-crm.src.js calcula los mismos hitos en el navegador. Si las dos
        # tablas se separan, el push dice "3 por contactar" y el panel enseña
        # otra cosa.
        crm = (ROOT / "js" / "src" / "tm-crm.src.js").read_text(encoding="utf-8")
        for hito, dias, ventana in sn.SEG_HITOS:
            with self.subTest(hito=hito):
                self.assertIn(f"hito: '{hito}'", crm)
                self.assertRegex(crm, rf"hito: '{hito}',\s*\n\s*dias: {dias},")


class NoSeGuardanDatosDelClienteTest(unittest.TestCase):
    """/seguimientos solo lleva fechas. El nombre y el WhatsApp se quedan en el
    localStorage del panel — ver CLAUDE.md."""

    def test_la_regla_rechaza_cualquier_campo_que_no_sea_ts_ni_hecho(self):
        import json
        reglas = json.loads((ROOT / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]
        nodo = reglas["seguimientos"]["$ventaId"]
        self.assertIs(False, nodo["$otro"][".validate"],
                      "sin esto, un descuido puede subir el teléfono del cliente")
        self.assertEqual({"ts", "hecho"},
                         {k for k in nodo if not k.startswith((".", "$"))})

    def test_solo_el_dueno_lo_lee_y_lo_escribe(self):
        import json
        reglas = json.loads((ROOT / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]
        nodo = reglas["seguimientos"]
        for expr in (nodo[".read"], nodo["$ventaId"][".write"]):
            self.assertIn("root.child('admin_uid').val()", expr,
                          "`auth != null` a secas no protege nada aquí")

    def test_lo_que_sube_el_panel_no_lleva_al_cliente(self):
        import re
        for fichero in ("js/src/tm-ui.src.js", "admin.html"):
            texto = (ROOT / fichero).read_text(encoding="utf-8")
            for m in re.finditer(r"/seguimientos/[^\n]*?\n(?:[^\n]*\n){0,4}?[^\n]*?"
                                 r"JSON\.stringify\((\{[^}]*\})\)", texto):
                with self.subTest(fichero=fichero):
                    for prohibido in ("cliente", "telefono", "tel", "nombre"):
                        self.assertNotIn(prohibido, m.group(1))


if __name__ == "__main__":
    unittest.main()
