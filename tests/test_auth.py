"""
Firebase Authentication: la cuenta del dueño, y qué se cierra con ella.

Hasta ahora no había autenticación en todo el proyecto. Los permisos de
LECTURA de Firebase no ven nada de lo que manda el cliente —un GET es solo un
GET—, así que toda regla que dejara leer al admin dejaba leer a cualquiera. De
ahí que /ventas, con los ingresos y las ganancias, estuviera abierto a quien
supiera la URL.

Con cuenta, las reglas ya pueden decir `auth != null`. Pero eso corta en las
dos direcciones y es exactamente donde este cambio puede tumbar la tienda:

  · Meter `auth != null` en una ruta que usa la WEB PÚBLICA rechaza las
    peticiones de los propios clientes. Ya pasó con /admin_auth, y el síntoma
    fue que la contraseña dejó de sincronizarse entre dispositivos sin que
    nada diera error.
  · Y cerrar la lectura de una ruta sin firmar a la vez las llamadas del panel
    deja al admin enseñando ceros como si no hubiera datos.

Por eso aquí se cruzan las dos cosas: qué rutas pueden pedir cuenta, y que
todo el que lee /ventas la firme.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGLAS = json.loads((ROOT / "firebase-rules.json").read_text(encoding="utf-8"))["rules"]
AUTH_JS = (ROOT / "js" / "auth.js").read_text(encoding="utf-8")
ADMIN = (ROOT / "admin.html").read_text(encoding="utf-8")

# Rutas que usa la web pública sin haber entrado con ninguna cuenta. Si alguna
# de estas pide `auth`, se rompe para todos los clientes.
PUBLICAS = [
    "analytics", "tokens", "errores_js", "web_vitals", "auditoria_productos",
    "avisos_stock", "wishlist_avisos", "resenas", "pedidos", "lista_espera",
    "interesados", "configuracion", "config", "avisos_count", "almacenes",
    "agente",
]


def texto_reglas(nodo):
    return json.dumps(nodo, ensure_ascii=False)


class AuthTest(unittest.TestCase):
    # ── Lo que se abre ──────────────────────────────────────────────────
    def test_lo_privado_es_de_UNA_cuenta_no_de_cualquiera(self):
        """`auth != null` a secas no protege nada en este proyecto.

        La clave de API de Firebase es PÚBLICA —va servida en el propio sitio,
        dentro de firebase-messaging-sw.js— y el registro por correo está
        abierto por defecto. Cualquiera puede crearse una cuenta contra este
        proyecto y quedar autenticado: con `auth != null` leería las ventas y
        la zona privada igual que el dueño. Tiene que ser SU uid."""
        for ruta, nodo in (("privado", REGLAS.get("privado")), ("ventas", REGLAS.get("ventas"))):
            self.assertIsNotNone(nodo, f"falta /{ruta}")
            with self.subTest(ruta=ruta):
                self.assertIn(
                    "root.child('admin_uid').val()", nodo.get(".read", ""),
                    f"/{ruta} se conforma con cualquier cuenta autenticada",
                )
        self.assertIn("root.child('admin_uid').val()", REGLAS["privado"].get(".write", ""),
                      "escribir en lo privado también es solo del dueño")

    def test_el_dueno_se_reclama_una_sola_vez_y_con_su_propio_uid(self):
        """Si se pudiera reescribir, quien entrara después se quedaría la base;
        y si se pudiera poner un uid ajeno, se la regalaría a otro."""
        w = REGLAS["admin_uid"][".write"]
        self.assertIn("!data.exists()", w, "una vez reclamada, no se cambia desde el navegador")
        self.assertIn("newData.val() === auth.uid", w, "solo puedes poner TU uid, no el de otro")
        self.assertIn("auth != null", w)

    def test_el_panel_reclama_y_avisa_si_la_base_es_de_otro(self):
        """Sin reclamar, las reglas de arriba dejan lo privado inaccesible: hay
        que hacerlo solo, y decirlo si ya la tiene otra cuenta."""
        self.assertIn("function tmCuentaReclamar(", ADMIN)
        self.assertIn("reclamada por OTRA cuenta", AUTH_JS)
        self.assertIn("admin_uid", ADMIN, "el aviso debe decir qué nodo borrar en la consola")

    def test_la_escritura_de_ventas_no_se_toca(self):
        """Solo se cierra la LECTURA, que es lo que exponía los ingresos.

        La escritura se queda en "solo alta" tal cual estaba, por dos motivos.
        Exigir cuenta la haría fallar con el token caducado, y esas escrituras
        son fire-and-forget: la venta no llegaría a Firebase y no se enteraría
        nadie. Y permitir sobrescribir no lo necesita nada del código — abrir
        una puerta que nadie usa solo añade superficie."""
        self.assertEqual(
            "!data.exists()", REGLAS["ventas"]["$ventaId"].get(".write"),
            "una venta escrita no se pisa: ver tests/test_reglas_destructivas.py",
        )

    # ── Lo que NO se puede tocar ────────────────────────────────────────
    def test_ninguna_ruta_publica_pide_cuenta(self):
        for nombre in PUBLICAS:
            nodo = REGLAS.get(nombre)
            if nodo is None:
                continue
            with self.subTest(ruta=nombre):
                self.assertNotIn(
                    "auth != null", texto_reglas(nodo),
                    f"/{nombre} la usa la web pública sin cuenta: pedirle auth "
                    "rechazaría a los propios clientes, no solo a un atacante",
                )

    def test_admin_uid_no_es_publico(self):
        self.assertEqual(REGLAS["admin_uid"][".read"], "auth != null",
                         "el uid del dueño no tiene por qué verlo un visitante")

    def test_la_raiz_sigue_cerrada(self):
        self.assertIs(REGLAS.get(".read"), False)
        self.assertIs(REGLAS.get(".write"), False)

    # ── Que el panel firme lo que ya no es público ──────────────────────
    def test_todo_el_que_lee_ventas_la_firma(self):
        """Cerrar la lectura sin firmar las llamadas deja al panel enseñando
        ceros con la misma cara que si no hubiera ventas."""
        lectores = {
            "admin.html": ADMIN,
            "js/analytics.js": (ROOT / "js" / "analytics.js").read_text(encoding="utf-8"),
            "js/admin-copilot.js": (ROOT / "js" / "admin-copilot.js").read_text(encoding="utf-8"),
            "js/src/tm-ui.src.js": (ROOT / "js" / "src" / "tm-ui.src.js").read_text(encoding="utf-8"),
        }
        for nombre, src in lectores.items():
            if "ventas.json" not in src and "/ventas/" not in src:
                continue
            with self.subTest(archivo=nombre):
                self.assertRegex(
                    src, r"TMAuth\.token\(\)|_fbAuthQS|_firma\(",
                    f"{nombre} lee /ventas pero no firma con la cuenta: "
                    "recibirá 401 y lo tratará como 'no hay datos'",
                )

    # ── El SDK y los mensajes ───────────────────────────────────────────
    def test_usa_el_mismo_sdk_que_el_resto(self):
        """Mezclar versiones del SDK de Firebase en la misma página rompe."""
        self.assertIn("firebasejs/10.8.0/firebase-app-compat.js", AUTH_JS)
        self.assertIn("firebasejs/10.8.0/firebase-auth-compat.js", AUTH_JS)

    def test_el_token_se_pide_fresco(self):
        """Caduca cada hora. Uno guardado da 401 mudos."""
        self.assertIn("getIdToken()", AUTH_JS)
        self.assertNotRegex(
            AUTH_JS, r"localStorage\.setItem\(\s*['\"]tm_id_token",
            "el token no se guarda: se pide al SDK, que lo renueva solo",
        )

    def test_los_errores_de_firebase_se_traducen(self):
        """'auth/operation-not-allowed' no le dice nada a nadie, y es
        justamente el que sale si falta activar el proveedor en la consola."""
        self.assertIn("auth/operation-not-allowed", AUTH_JS)
        self.assertIn("Authentication", AUTH_JS)
        for codigo in ("auth/user-not-found", "auth/wrong-password", "auth/email-already-in-use"):
            self.assertIn(codigo, AUTH_JS, f"falta traducir {codigo}")

    def test_el_panel_sabe_traerte_las_reglas(self):
        """firebase-rules.json no se publica con el sitio (pages.yml lo
        excluye), y copiarlo a mano desde GitHub en un móvil es justo el paso
        donde la gente se rinde y deja la base a medias."""
        self.assertIn("function tmCopiarReglas()", ADMIN)
        self.assertIn("raw.githubusercontent.com", ADMIN)
        self.assertIn("JSON.parse(txt)", ADMIN,
                      "pegar medio archivo deja la base sin reglas que valgan: "
                      "hay que validarlo antes de copiar")

    def test_distingue_reglas_viejas_de_base_sin_reclamar(self):
        """Son dos problemas distintos con arreglos distintos, y el error de
        escritura suena igual en los dos casos."""
        self.assertIn("Firebase todavía tiene las reglas viejas", ADMIN)

    def test_hay_forma_de_comprobar_que_las_reglas_estan_publicadas(self):
        """Unas reglas viejas se ven igual que 'todavía no hay nada guardado'.
        Es el mismo fallo mudo que tuvieron Web Vitals y las preguntas de Max:
        meses sin datos y sin una sola pista."""
        self.assertIn("function tmCuentaProbar()", ADMIN)
        self.assertIn("Publica el firebase-rules.json", ADMIN)

    def test_avisa_si_entraste_sin_la_cuenta(self):
        """La contraseña local sigue valiendo, pero desde que /ventas y
        /privado piden la cuenta esa puerta ya NO abre lo mismo: se entra al
        panel y las ventas de Firebase, las reservas y el historial de vales
        devuelven 401 sin decir nada. El panel se ve entero y funciona a
        medias, que es la peor forma de fallar."""
        self.assertIn("function tmAvisoSinCuenta()", ADMIN)
        self.assertIn("Entrar con mi cuenta", ADMIN, "y con la forma de arreglarlo al lado")
        ui = (ROOT / "js" / "src" / "tm-admin.src.js").read_text(encoding="utf-8")
        self.assertIn("tmAvisoSinCuenta", ui,
                      "tiene que saltar al abrir el panel, que es cuando pasa, "
                      "no solo al cambiar de sesión")

    def test_una_sola_puerta_y_abre_todo(self):
        """Ya no hay contraseña local.

        Tenía sentido como red mientras se montaba la cuenta, pero desde que
        /ventas y /privado la piden, entrar por la vía vieja dejaba el panel a
        medias: se veía entero, sin ventas, sin reservas y sin vales. Dos
        puertas donde solo una abre lo de dentro es peor que una.

        Y las tres vías viejas —hash en localStorage, /admin_auth y un archivo
        en GitHub— no sobrevivían a borrar los datos del navegador. Eso dejó al
        dueño fuera de su propia tienda sin nada que hacer."""
        ui = (ROOT / "js" / "src" / "tm-admin.src.js").read_text(encoding="utf-8")
        login = ui[ui.index("async function verificarPassword"):
                   ui.index("function abrirAdminPanel")]
        self.assertIn("TMAuth.entrar(email, pass)", login)
        for vestigio in ("AUTH_HASH_KEY", "admin_auth.json", ".admin-auth.json"):
            self.assertNotIn(
                vestigio, login,
                f"el login ya no puede apoyarse en {vestigio}: no sobrevive a "
                "borrar los datos del navegador",
            )

    def test_el_dueno_sigue_sin_contarse_como_visita(self):
        """El contador de visitas deducía "este es el dueño" de que existiera el
        hash de la contraseña local. Sin ese hash, el dueño navegando su propia
        tienda empezaría a contarse como cliente y las analíticas mentirían."""
        ui = (ROOT / "js" / "src" / "tm-admin.src.js").read_text(encoding="utf-8")
        self.assertIn("localStorage.setItem('tm_es_admin', '1')", ui)
        patches = (ROOT / "js" / "src" / "tm-patches.src.js").read_text(encoding="utf-8")
        self.assertIn("tm_es_admin", patches, "y el contador tiene que mirar esa marca")


if __name__ == "__main__":
    unittest.main()
