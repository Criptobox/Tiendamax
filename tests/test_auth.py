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
    def test_existe_la_zona_privada(self):
        p = REGLAS.get("privado")
        self.assertIsNotNone(p, "falta /privado: es donde van reservas, vales y clientes")
        self.assertEqual(p.get(".read"), "auth != null")
        self.assertEqual(p.get(".write"), "auth != null")

    def test_ventas_ya_no_la_lee_cualquiera(self):
        """Lleva ingresos, ganancias y comisiones."""
        self.assertEqual(
            REGLAS["ventas"].get(".read"), "auth != null",
            "/ventas debe pedir cuenta para leerse",
        )

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

    def test_hay_forma_de_comprobar_que_las_reglas_estan_publicadas(self):
        """Unas reglas viejas se ven igual que 'todavía no hay nada guardado'.
        Es el mismo fallo mudo que tuvieron Web Vitals y las preguntas de Max:
        meses sin datos y sin una sola pista."""
        self.assertIn("function tmCuentaProbar()", ADMIN)
        self.assertIn("Publica el firebase-rules.json", ADMIN)

    def test_el_login_no_deja_a_nadie_fuera(self):
        """La contraseña local sigue valiendo. Cambiar el login de golpe dejaría
        fuera a quien todavía no haya creado su cuenta — y el panel no tiene
        otra puerta."""
        ui = (ROOT / "js" / "src" / "tm-admin.src.js").read_text(encoding="utf-8")
        self.assertIn("if (emailInput.trim() && typeof TMAuth !== 'undefined')", ui)
        self.assertIn("1. PRIORIDAD: localStorage", ui,
                      "la vía local tiene que seguir existiendo")


if __name__ == "__main__":
    unittest.main()
