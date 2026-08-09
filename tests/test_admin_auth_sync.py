"""La sincronización de la contraseña admin entre dispositivos.

La regla de admin_auth pedía `auth != null`, pero en este proyecto no hay
Firebase Auth (0 llamadas a getAuth/signInAnonymously), así que esa condición
es siempre falsa: nadie podía leer el hash guardado. Como el cliente lo leía
para mandarlo como `proof`, la escritura quedaba rechazada y la contraseña
dejaba de sincronizarse tras el primer cambio.

Eso no es solo un problema de comodidad: `almacenes/$almId` y
`admin_push_requests/$reqId` comparan su proof contra admin_auth/hash, así que
con la sincronización rota el admin no puede rotar la contraseña sin dejar de
poder escribir en esos dos nodos.
"""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGLAS = RAIZ / "firebase-rules.json"
TM_ADMIN = RAIZ / "js" / "src" / "tm-admin.src.js"


class ReglaAdminAuthTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.reglas = json.loads(REGLAS.read_text(encoding="utf-8"))
        cls.crudo = REGLAS.read_text(encoding="utf-8")
        cls.admin_auth = cls.reglas["rules"]["admin_auth"]

    def test_admin_auth_no_se_apoya_en_la_cuenta(self):
        # Ya existe Firebase Auth (ver tests/test_auth.py), pero /admin_auth
        # NO puede depender de ella: es la contrasena local, la via de entrada
        # de quien todavia no ha creado su cuenta. Pedirle auth cerraria la
        # unica puerta que le queda a ese admin. Que ninguna ruta publica pida
        # cuenta se comprueba en test_auth.py.
        self.assertNotIn("auth != null", json.dumps(self.admin_auth))

    def test_el_hash_no_es_legible(self):
        self.assertIs(False, self.admin_auth[".read"])

    def test_el_salt_tampoco_se_expone(self):
        # Con el salt público cualquiera puede derivar hashes candidatos y
        # probarlos contra las reglas que comparan proof (almacenes,
        # admin_push_requests): eso convierte esas reglas en un oráculo de
        # fuerza bruta online contra la contraseña del admin.
        for hijo in ("salt", "iterations", "hash"):
            sub = self.admin_auth.get(hijo)
            if isinstance(sub, dict):
                self.assertNotEqual(True, sub.get(".read"),
                                    f"admin_auth/{hijo} no puede ser público")

    def test_la_escritura_sigue_exigiendo_proof(self):
        self.assertIn("newData.child('proof').val()", self.admin_auth[".write"])

    def test_la_cola_de_push_ya_no_depende_del_hash_local(self):
        # El `proof` era el hash de la contrasena guardada en localStorage. Al
        # dejar el login solo en manos de la cuenta de Firebase, ese hash no
        # existe en un dispositivo nuevo — que es justo el caso que la cuenta
        # viene a resolver — y las notificaciones se habrian rechazado sin
        # decir nada. Ahora la cola pide la cuenta del dueno.
        push = self.reglas["rules"]["admin_push_requests"]["$reqId"][".write"]
        self.assertNotIn("admin_auth/hash", push)
        self.assertIn("root.child('admin_uid').val()", push)

    def test_el_hash_no_se_guarda_en_un_nodo_publico(self):
        # almacenes es .read true. Mandar ahi el _proof dejaba el hash del
        # admin a la vista de cualquiera, y con el se forjan notificaciones a
        # todos los clientes. La regla ya no lo pide y el admin ya no lo manda.
        alm = self.reglas["rules"]["almacenes"]
        self.assertIs(True, alm[".read"])
        self.assertNotIn("_proof", json.dumps(alm))
        self.assertNotIn("_proof", (RAIZ / "admin.html").read_text(encoding="utf-8"))


class SenalDeVersionTest(unittest.TestCase):
    """config/version: la señal que fuerza a los clientes a actualizarse.

    Tenía `.write: "auth != null"`, o sea rechazo garantizado, así que el PUT
    que hace el admin tras publicar nunca entraba y ningún cliente llegaba a
    enterarse de que había catálogo nuevo: se quedaban con el service worker
    viejo hasta que caducara por su cuenta.
    """

    @classmethod
    def setUpClass(cls):
        cls.reglas = json.loads(REGLAS.read_text(encoding="utf-8"))
        cls.config = cls.reglas["rules"]["config"]
        cls.catalog = (RAIZ / "js" / "src" / "tm-catalog.src.js").read_text(encoding="utf-8")

    def test_no_usa_el_patron_proof(self):
        # Guardar el proof dentro de /config no protegia nada: en una escritura
        # parcial a un hijo, newData en el padre es el MERGE de lo existente con
        # lo que llega, asi que el proof ya guardado satisfacia la regla por si
        # solo y cualquiera podia reescribir o borrar version sin conocerlo.
        crudo = json.dumps(self.config)
        self.assertNotIn("_proof", crudo)
        self.assertNotIn("auth != null", crudo)

    def test_version_sigue_siendo_publica(self):
        # index.html y admin.html la leen sin credencial ninguna.
        self.assertIs(True, self.config["version"][".read"])

    def test_la_version_solo_puede_subir(self):
        # Sin esto cualquiera la baja y deja el cache-bust inservible.
        escritura = self.config["version"][".write"]
        self.assertIn("newData.val() > data.val()", escritura)

    def test_no_se_puede_borrar_la_version(self):
        # Un DELETE no lleva payload, asi que hay que exigir que newData exista;
        # borrarla mataria la senal de actualizacion para siempre.
        self.assertIn("newData.exists()", self.config["version"][".write"])
        self.assertIs(False, self.config[".write"])

    def test_no_se_pueden_colar_hijos_nuevos(self):
        # Sin comodin "$otro": la consola de Firebase lo rechazaba, y ademas
        # sobraba. El padre tiene .write false y solo "version" concede
        # escritura, asi que /config/loquesea ya esta denegado por si solo.
        self.assertIs(False, self.config[".write"])
        self.assertEqual({".read", ".write", "version"}, set(self.config))

    def test_la_ventana_de_reloj_es_simetrica(self):
        # Era now-300000 .. now+60000: un movil 61 s adelantado (normal) hacia
        # fallar el .validate y la publicacion se perdia en silencio.
        v = self.config["version"][".validate"]
        self.assertIn("now - 300000", v)
        self.assertIn("now + 300000", v)

    def test_el_cliente_avisa_si_no_pudo_publicar(self):
        # fetch no lanza en 4xx: sin mirar res.ok, el admin veia "actualizado"
        # y ningun cliente se enteraba nunca.
        i = self.catalog.index("async function _tmPublicarVersionFirebase")
        cuerpo = self.catalog[i:i + 1400]
        self.assertIn("res.ok", cuerpo)
        self.assertIn("config/version.json", cuerpo)


class SinPuertasPintadasTest(unittest.TestCase):
    """La contraseña local y el código de recuperación ya no existen.

    Los dos manejaban el hash de `tm_auth_hash_v3`, que el login dejó de
    comprobar cuando se pasó a la cuenta de Firebase. Dejar sus formularios
    habría sido peor que quitarlos: un "🔒 Cambiar contraseña" que cambia algo
    que nadie mira, y un "código de recuperación" que promete un acceso que ya
    no recupera nada. La gente los usa, cree que está protegida, y no lo está.

    Lo que sustituye a los dos es real: la contraseña vive en la cuenta y se
    cambia por correo, y borrar los datos del navegador ya no deja fuera a
    nadie.
    """

    @classmethod
    def setUpClass(cls):
        cls.admin = (RAIZ / "admin.html").read_text(encoding="utf-8")

    def test_no_queda_el_formulario_de_la_contrasena_local(self):
        for resto in ('id="ci"', 'id="ni"', 'id="coi"', 'onclick="tmCambiarPassword()"'):
            self.assertNotIn(
                resto, self.admin,
                f"{resto} cambia un hash que el login ya no comprueba",
            )

    def test_no_queda_el_codigo_de_recuperacion(self):
        for resto in ('id="recCodigo"', 'tmVerCodigoRecuperacion()',
                      'tmRestaurarCodigoRecuperacion()', 'recCodigoLogin'):
            self.assertNotIn(
                resto, self.admin,
                f"{resto} promete recuperar un acceso que ya no depende de eso",
            )

    def test_configuracion_dice_donde_esta_la_contrasena_ahora(self):
        # Quitar una sección sin decir a dónde se fue deja al dueño buscándola.
        self.assertIn("Tu cuenta", self.admin)
        self.assertIn("Olvidé la contraseña", self.admin)

    def test_se_puede_recuperar_desde_el_login(self):
        # El motivo original sigue en pie y es el que importa: todo lo que esté
        # dentro del panel queda detrás del propio login, así que una
        # recuperación que viva solo en Configuración es inalcanzable justo
        # cuando hace falta. Lo que cambia es CÓMO se recupera: el código TMX1
        # restauraba un hash local que ya nadie comprueba —una puerta pintada—,
        # y ahora se manda un correo de verdad, que es lo que no existía el día
        # que el dueño se quedó fuera.
        i_login = self.admin.index('id="tm2LoginPass"')
        i_caja = self.admin.index('id="tm2RecBox"')
        self.assertLess(i_login, i_caja, "la recuperación debe estar en el login")
        self.assertIn('onclick="tmRecuperarPorCorreo()"', self.admin)
        self.assertIn("window.tmRecuperarPorCorreo", self.admin)
        self.assertIn("TMAuth.recuperar(", self.admin)


class SinRastroDeLaContrasenaLocalTest(unittest.TestCase):
    """Ya no queda codigo que maneje la contrasena guardada en el navegador.

    Esta clase probaba cambiarPasswordAdmin, sincronizarPasswordAFirebase y
    _checkPasswordSync — el mecanismo entero. Se fue con el login: nadie las
    llamaba, y dejarlas no era gratis. _checkPasswordSync avisaba «contrasena
    no sincronizada con GitHub: si borras datos del navegador perderas el
    acceso», que hoy es falso y asusta; las otras dos escribian en /admin_auth
    un hash que ya no abre ninguna puerta.

    Lo que se fija ahora es que no vuelvan por la puerta de atras.
    """

    @classmethod
    def setUpClass(cls):
        cls.motor = (RAIZ / "js" / "src" / "tm-admin.src.js").read_text(encoding="utf-8")
        cls.admin = (RAIZ / "admin.html").read_text(encoding="utf-8")

    def test_no_queda_el_mecanismo_viejo(self):
        for f in ("function cambiarPasswordAdmin",
                  "function sincronizarPasswordAFirebase",
                  "function _checkPasswordSync"):
            self.assertNotIn(f, self.motor, f"{f} ya no la llama nadie")

    def test_nadie_avisa_de_perder_el_acceso_por_borrar_datos(self):
        # Era verdad cuando la contrasena vivia solo aqui. Con la cuenta, no:
        # repetirlo asusta al dueno por algo que ya esta resuelto.
        for texto in ("perderás el acceso", "perderas el acceso"):
            self.assertNotIn(texto, self.motor)

    def test_el_admin_no_escribe_en_admin_auth(self):
        # El nodo sigue existiendo en las reglas por si queda algo escrito,
        # pero el panel ya no lo toca: su hash no autoriza nada.
        self.assertNotIn("/admin_auth.json", self.motor)
        self.assertNotIn("/admin_auth.json", self.admin)


if __name__ == "__main__":
    unittest.main()
