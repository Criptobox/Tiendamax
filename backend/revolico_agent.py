"""
=================================================
  BOT TIENDAMAX v3.0 - COMPLETO Y FUNCIONAL
  Revolico + Grupos de Facebook
=================================================
  USA TU CHROME REAL → Cloudflare no detecta nada

  CONFIGURACIÓN: edita la sección de abajo
=================================================
"""

import json, time, base64, os, sys, logging, tempfile, threading
from datetime import datetime
from pathlib import Path

# ══════════════════════════════════════════════
#   ⚙️  CONFIGURACIÓN  ← EDITA ESTO
# ══════════════════════════════════════════════

WHATSAPP_NUMERO = "5354320170"

# ── Grupos de Facebook ──────────────────────────────────────────────────────
# Opción A: Descarga grupos_facebook_config.json desde el panel admin
#           y ponlo en la misma carpeta que este script.
#           El bot lo leerá automáticamente.
#
# Opción B: Agrégalos manualmente aquí:
FACEBOOK_GRUPOS_MANUAL = [
    # "https://www.facebook.com/groups/XXXXXXX",
]

def cargar_grupos_fb():
    """Carga la config de grupos desde el archivo exportado del panel admin,
       o usa la lista manual si no existe el archivo."""
    config_path = Path(__file__).parent / "grupos_facebook_config.json"
    if config_path.exists():
        try:
            with open(config_path, encoding="utf-8") as f:
                data = json.load(f)
            grupos = data.get("grupos", [])
            ok(f"Configuración Facebook cargada: {len(grupos)} grupos desde grupos_facebook_config.json")
            return grupos
        except Exception as e:
            warn(f"Error leyendo grupos_facebook_config.json: {e}")

    # Fallback a lista manual
    grupos_manual = [{"url": url, "productos": None} for url in FACEBOOK_GRUPOS_MANUAL]
    if grupos_manual:
        info(f"Usando {len(grupos_manual)} grupos manuales")
    return grupos_manual

# URL de tus productos (GitHub o tiendamax.org)
PRODUCTOS_URL = "https://raw.githubusercontent.com/Criptobox/Tiendamax/main/productos.json"
PRODUCTOS_FALLBACK = "https://tiendamax.org/productos.json"

# Pausas anti-detección (en segundos)
PAUSA_ENTRE_PRODUCTOS_REVOLICO = 120   # 2 minutos entre productos en Revolico
PAUSA_ENTRE_GRUPOS_FACEBOOK    = 45    # 45 segundos entre grupos

# ══════════════════════════════════════════════
#   MAPEO DE CATEGORÍAS → REVOLICO
# ══════════════════════════════════════════════

# Categorías por defecto (si no hay config del panel admin)
CATEGORIAS_REVOLICO_DEFAULT = {
    "ENERGIA"    : "Hogar y Jardín > Energía Solar",
    "WIFI"       : "Computación > Redes y Conectividad",
    "TECNOLOGIA" : "Electrónica > Electrónica en General",
    "ELECTRONICA": "Electrónica > Electrónica en General",
    "GENERAL"    : "Electrónica > Electrónica en General",
}

_revolico_config_cache = None

def cargar_revolico_config():
    """Carga la config de categorías Revolico desde GitHub o archivo local."""
    global _revolico_config_cache
    if _revolico_config_cache is not None:
        return _revolico_config_cache

    import urllib.request
    headers = {"User-Agent": "Mozilla/5.0"}

    # Intentar desde GitHub primero
    github_user = "Criptobox"
    github_repo = "Tiendamax"
    url = f"https://raw.githubusercontent.com/{github_user}/{github_repo}/main/revolico_config.json"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            _revolico_config_cache = {int(k): v for k, v in data.items()}
            ok(f"Config Revolico cargada desde GitHub ({len(_revolico_config_cache)} productos asignados)")
            return _revolico_config_cache
    except Exception as e:
        warn(f"No se pudo cargar revolico_config.json desde GitHub: {e}")

    # Fallback: archivo local
    local = Path(__file__).parent / "revolico_config.json"
    if local.exists():
        try:
            with open(local, encoding="utf-8") as f:
                data = json.load(f)
            _revolico_config_cache = {int(k): v for k, v in data.items()}
            ok(f"Config Revolico cargada desde archivo local")
            return _revolico_config_cache
        except Exception as e:
            warn(f"Error leyendo revolico_config.json local: {e}")

    _revolico_config_cache = {}
    return _revolico_config_cache

def obtener_categoria_revolico(producto):
    """Devuelve la categoría de Revolico para un producto.
       Usa la config del panel admin; si no hay, usa el mapeo por defecto."""
    config = cargar_revolico_config()
    prod_id = producto.get("id")

    # Buscar por ID del producto
    if prod_id and prod_id in config:
        return config[prod_id]

    # Buscar por str también por si acaso
    if prod_id and str(prod_id) in config:
        return config[str(prod_id)]

    # Fallback: mapeo por categoría de la tienda
    cat_tienda = producto.get("categoria", "GENERAL").upper()
    return CATEGORIAS_REVOLICO_DEFAULT.get(cat_tienda, "Electrónica > Electrónica en General")

# ══════════════════════════════════════════════
#   LOGGING
# ══════════════════════════════════════════════

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("bot_log.txt", encoding="utf-8"),
    ]
)
log = logging.getLogger()

G = "\033[92m"; Y = "\033[93m"; R = "\033[91m"; B = "\033[94m"; W = "\033[0m"

def ok(m):   log.info(f"{G}✅ {m}{W}")
def info(m): log.info(f"{B}ℹ️  {m}{W}")
def warn(m): log.warning(f"{Y}⚠️  {m}{W}")
def err(m):  log.error(f"{R}❌ {m}{W}")

# ══════════════════════════════════════════════
#   OBTENER PRODUCTOS
# ══════════════════════════════════════════════

def obtener_productos():
    import urllib.request
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    for url in [PRODUCTOS_URL, PRODUCTOS_FALLBACK]:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
                if isinstance(data, list) and len(data) > 0:
                    ok(f"{len(data)} productos cargados desde internet")
                    return data
        except Exception as e:
            warn(f"No se pudo cargar desde {url}: {e}")

    # Fallback: archivo local
    for ruta in [
        Path(__file__).parent / "productos.json",
        Path(__file__).parent.parent / "productos.json",
    ]:
        if ruta.exists():
            with open(ruta, encoding="utf-8") as f:
                data = json.load(f)
            ok(f"{len(data)} productos cargados desde archivo local")
            return data

    err("No se encontraron productos")
    return []

# ══════════════════════════════════════════════
#   IMAGEN: BASE64 → ARCHIVO TEMPORAL
# ══════════════════════════════════════════════

def imagen_a_archivo(producto):
    img = producto.get("imagen", "")
    if not img:
        return None
    try:
        if ";base64," in img:
            _, b64 = img.split(";base64,", 1)
        else:
            b64 = img
        datos = base64.b64decode(b64)
        nombre = producto.get("nombre", "prod").replace(" ", "_")[:25]
        ruta = Path(tempfile.gettempdir()) / f"tiendamax_{nombre}.jpg"
        ruta.write_bytes(datos)
        return str(ruta)
    except Exception as e:
        warn(f"Error procesando imagen: {e}")
        return None

def limpiar_imagen(ruta):
    try:
        if ruta and os.path.exists(ruta):
            os.remove(ruta)
    except:
        pass

# ══════════════════════════════════════════════
#   TEXTOS DE PUBLICACIÓN
# ══════════════════════════════════════════════

def texto_revolico(producto):
    desc     = producto.get("descripcion", "").strip()
    garantia = producto.get("garantia", "")
    usado    = producto.get("usado", False)

    partes = [desc]
    if garantia:
        partes.append(f"\n✅ {garantia}")
    if usado:
        partes.append("\n📦 Producto usado/refurbished en buen estado")
    partes.append(f"\n📱 WhatsApp: {WHATSAPP_NUMERO}")
    partes.append("🛍️ Más productos: tiendamax.org")

    return "\n".join(partes)

def texto_facebook(producto):
    nombre = producto.get("nombre", "Producto")
    precio = producto.get("precioActual", 0)
    desc   = producto.get("descripcion", "").strip()
    # Solo las primeras 3 líneas de descripción
    desc_corta = "\n".join(desc.split("\n")[:3])

    return (
        f"🔥 {nombre} — ${precio} USD\n\n"
        f"{desc_corta}\n\n"
        f"📱 WhatsApp: {WHATSAPP_NUMERO}\n"
        f"🌐 tiendamax.org"
    )

# ══════════════════════════════════════════════
#   CHROME: CONECTAR AL TUYO (puerto 9222)
# ══════════════════════════════════════════════

_driver = None

def obtener_driver():
    global _driver
    if _driver:
        try:
            _ = _driver.current_url  # test si sigue activo
            return _driver
        except:
            _driver = None

    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        opts = Options()
        opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        _driver = webdriver.Chrome(options=opts)
        ok("Conectado a tu Chrome (puerto 9222)")
        return _driver
    except Exception as e:
        err(f"No se pudo conectar a Chrome: {e}")
        err("Ejecuta primero: abrir_chrome_especial.bat")
        return None

def esperar(driver, by, selector, segundos=12):
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    try:
        return WebDriverWait(driver, segundos).until(
            EC.presence_of_element_located((by, selector))
        )
    except:
        return None

def pausa(seg, variacion=5):
    import random
    t = max(seg + random.uniform(-variacion, variacion), 3)
    info(f"Esperando {t:.0f}s...")
    time.sleep(t)

def escribir_lento(elemento, texto):
    """Escribe carácter a carácter para simular escritura humana."""
    import random
    elemento.clear()
    for c in texto:
        elemento.send_keys(c)
        time.sleep(random.uniform(0.04, 0.12))

# ══════════════════════════════════════════════
#   PUBLICAR EN REVOLICO
# ══════════════════════════════════════════════

def publicar_revolico(producto):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys

    driver = obtener_driver()
    if not driver:
        return False

    nombre   = producto.get("nombre", "Producto")
    precio   = str(producto.get("precioActual", 0))
    desc     = texto_revolico(producto)
    img_ruta = imagen_a_archivo(producto)
    cat_rev  = obtener_categoria_revolico(producto)

    # Si la categoría es vacía, el producto está marcado como "no publicar"
    if not cat_rev:
        info(f"Revolico → {nombre} OMITIDO (sin categoría asignada en el panel admin)")
        return True  # No es un error, es intencional

    info(f"Revolico → {nombre} (${precio}) → [{cat_rev}]")

    try:
        # Abrir página de publicar en nueva pestaña
        driver.execute_script("window.open('https://www.revolico.com/item/publish', '_blank');")
        driver.switch_to.window(driver.window_handles[-1])
        pausa(6, 2)

        # ── Verificar si Cloudflare bloqueó ──
        if "Just a moment" in driver.title or "Checking" in driver.title:
            warn("Cloudflare detectado. Espera 10s y reintenta manualmente.")
            time.sleep(10)

        # ── Título ──
        campo = (
            esperar(driver, By.NAME, "title") or
            esperar(driver, By.CSS_SELECTOR, "input[name='title']") or
            esperar(driver, By.CSS_SELECTOR, "input[placeholder*='ítulo'], input[placeholder*='itulo']")
        )
        if campo:
            escribir_lento(campo, nombre)
            pausa(1, 0.3)
        else:
            warn("No encontré campo de título")

        # ── Precio ──
        campo = (
            esperar(driver, By.NAME, "price") or
            esperar(driver, By.CSS_SELECTOR, "input[name='price']")
        )
        if campo:
            escribir_lento(campo, precio)
            pausa(1, 0.3)

        # ── Descripción ──
        campo = (
            esperar(driver, By.NAME, "body") or
            esperar(driver, By.CSS_SELECTOR, "textarea[name='body']") or
            esperar(driver, By.CSS_SELECTOR, "textarea")
        )
        if campo:
            escribir_lento(campo, desc)
            pausa(1, 0.3)

        # ── Teléfono ──
        campo = esperar(driver, By.CSS_SELECTOR, "input[name='phone'], input[type='tel']")
        if campo:
            try:
                escribir_lento(campo, WHATSAPP_NUMERO)
                pausa(0.5, 0.2)
            except:
                pass

        # ── Imagen ──
        if img_ruta and os.path.exists(img_ruta):
            try:
                file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
                file_input.send_keys(img_ruta)
                pausa(3, 1)
                ok("Imagen cargada")
            except Exception as e:
                warn(f"No se pudo subir imagen: {e}")

        # ── Publicar ──
        pausa(2, 0.5)
        boton = (
            esperar(driver, By.CSS_SELECTOR, "button[type='submit']") or
            esperar(driver, By.CSS_SELECTOR, "input[type='submit']") or
            esperar(driver, By.XPATH, "//button[contains(text(),'Publicar') or contains(text(),'Submit')]")
        )
        if boton:
            boton.click()
            pausa(4, 1)
            ok(f"Publicado en Revolico: {nombre}")
            return True
        else:
            warn("No encontré botón de publicar. Verifica la página manualmente.")
            return False

    except Exception as e:
        err(f"Error en Revolico ({nombre}): {e}")
        return False
    finally:
        limpiar_imagen(img_ruta)
        # Cerrar la pestaña extra si quedó abierta
        try:
            if len(driver.window_handles) > 1:
                driver.close()
                driver.switch_to.window(driver.window_handles[0])
        except:
            pass

# ══════════════════════════════════════════════
#   PUBLICAR EN GRUPOS DE FACEBOOK
# ══════════════════════════════════════════════

def publicar_facebook(producto):
    from selenium.webdriver.common.by import By

    if not FACEBOOK_GRUPOS:
        warn("No hay grupos de Facebook configurados en FACEBOOK_GRUPOS.")
        return 0

    driver = obtener_driver()
    if not driver:
        return 0

    nombre   = producto.get("nombre", "Producto")
    texto    = texto_facebook(producto)
    img_ruta = imagen_a_archivo(producto)
    publicados = 0

    info(f"Facebook → {nombre} en {len(FACEBOOK_GRUPOS)} grupos")

    for i, grupo_url in enumerate(FACEBOOK_GRUPOS, 1):
        info(f"Grupo {i}/{len(FACEBOOK_GRUPOS)}: {grupo_url}")
        try:
            driver.get(grupo_url)
            pausa(5, 2)

            # Buscar caja "Crear publicación"
            caja = (
                esperar(driver, By.CSS_SELECTOR, "[aria-label='Crear una publicación']") or
                esperar(driver, By.CSS_SELECTOR, "[aria-label='Create a post']") or
                esperar(driver, By.XPATH, "//span[contains(text(),'Escribe algo') or contains(text(),'Write something')]")
            )
            if not caja:
                warn(f"No encontré caja de publicación en {grupo_url}")
                continue

            caja.click()
            pausa(2, 1)

            # Área de texto expandida
            area = esperar(driver, By.CSS_SELECTOR,
                "[contenteditable='true'][role='textbox']"
            )
            if not area:
                warn("No encontré área de texto")
                continue

            # Escribir texto
            for linea in texto.split("\n"):
                area.send_keys(linea)
                from selenium.webdriver.common.keys import Keys
                area.send_keys(Keys.SHIFT + Keys.ENTER)
                time.sleep(0.1)
            pausa(1, 0.5)

            # Intentar agregar imagen
            if img_ruta and os.path.exists(img_ruta):
                try:
                    foto_btn = (
                        driver.find_element(By.CSS_SELECTOR, "[aria-label='Foto/video']") or
                        driver.find_element(By.CSS_SELECTOR, "[aria-label='Photo/video']")
                    )
                    foto_btn.click()
                    pausa(2, 1)
                    file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file'][accept*='image']")
                    file_input.send_keys(img_ruta)
                    pausa(3, 1)
                except:
                    pass  # Sin imagen está bien también

            # Publicar
            pausa(1, 0.5)
            publicar_btn = (
                esperar(driver, By.CSS_SELECTOR, "[aria-label='Publicar']") or
                esperar(driver, By.CSS_SELECTOR, "[aria-label='Post']") or
                esperar(driver, By.XPATH, "//div[@aria-label='Publicar' or @aria-label='Post']")
            )
            if publicar_btn:
                publicar_btn.click()
                pausa(3, 1)
                ok(f"Publicado en grupo {i}")
                publicados += 1
            else:
                warn(f"No encontré botón Publicar en grupo {i}")

            # Pausa entre grupos (excepto el último)
            if i < len(FACEBOOK_GRUPOS):
                info(f"Esperando {PAUSA_ENTRE_GRUPOS_FACEBOOK}s antes del siguiente grupo...")
                pausa(PAUSA_ENTRE_GRUPOS_FACEBOOK, 8)

        except Exception as e:
            err(f"Error en grupo {grupo_url}: {e}")

    limpiar_imagen(img_ruta)
    return publicados

# ══════════════════════════════════════════════
#   TAREAS PROGRAMADAS
# ══════════════════════════════════════════════

def tarea_todos_revolico():
    global _revolico_config_cache
    _revolico_config_cache = None  # Refrescar config en cada ejecución
    info("═" * 48)
    info(f"REVOLICO — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    info("═" * 48)

    productos = obtener_productos()
    if not productos:
        return

    bien = 0
    for i, p in enumerate(productos, 1):
        info(f"[{i}/{len(productos)}] {p.get('nombre')}")
        if publicar_revolico(p):
            bien += 1
        if i < len(productos):
            info(f"Pausa {PAUSA_ENTRE_PRODUCTOS_REVOLICO}s antes del siguiente...")
            time.sleep(PAUSA_ENTRE_PRODUCTOS_REVOLICO)

    ok(f"Revolico listo: {bien}/{len(productos)} publicados")

def publicar_en_grupo_facebook(producto, url_grupo):
    """Publica un producto en un grupo específico de Facebook."""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys

    driver = obtener_driver()
    if not driver:
        return False

    nombre   = producto.get("nombre", "Producto")
    texto    = texto_facebook(producto)
    img_ruta = imagen_a_archivo(producto)

    try:
        driver.get(url_grupo)
        pausa(5, 2)

        caja = (
            esperar(driver, By.CSS_SELECTOR, "[aria-label='Crear una publicación']") or
            esperar(driver, By.CSS_SELECTOR, "[aria-label='Create a post']") or
            esperar(driver, By.XPATH, "//span[contains(text(),'Escribe algo') or contains(text(),'Write something')]")
        )
        if not caja:
            warn(f"No encontré caja de publicación en {url_grupo}")
            return False

        caja.click()
        pausa(2, 1)

        area = esperar(driver, By.CSS_SELECTOR, "[contenteditable='true'][role='textbox']")
        if not area:
            warn("No encontré área de texto")
            return False

        for linea in texto.split("
"):
            area.send_keys(linea)
            area.send_keys(Keys.SHIFT + Keys.ENTER)
            time.sleep(0.08)
        pausa(1, 0.5)

        if img_ruta and os.path.exists(img_ruta):
            try:
                foto_btn = driver.find_element(By.CSS_SELECTOR, "[aria-label='Foto/video'], [aria-label='Photo/video']")
                foto_btn.click()
                pausa(2, 1)
                file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file'][accept*='image']")
                file_input.send_keys(img_ruta)
                pausa(3, 1)
            except:
                pass

        pausa(1, 0.5)
        publicar_btn = (
            esperar(driver, By.CSS_SELECTOR, "[aria-label='Publicar']") or
            esperar(driver, By.CSS_SELECTOR, "[aria-label='Post']") or
            esperar(driver, By.XPATH, "//div[@aria-label='Publicar' or @aria-label='Post']")
        )
        if publicar_btn:
            publicar_btn.click()
            pausa(3, 1)
            ok(f"Publicado: {nombre} → {url_grupo}")
            return True
        else:
            warn("No encontré botón Publicar")
            return False

    except Exception as e:
        err(f"Error publicando {nombre} en {url_grupo}: {e}")
        return False
    finally:
        limpiar_imagen(img_ruta)

def tarea_todos_facebook():
    info("═" * 48)
    info(f"FACEBOOK — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    info("═" * 48)

    grupos = cargar_grupos_fb()
    if not grupos:
        warn("No hay grupos de Facebook configurados.")
        warn("Ve al panel admin → Publicar → Grupos de Facebook, configura y descarga el JSON.")
        return

    todos_productos = obtener_productos()
    if not todos_productos:
        return

    productos_por_id = {p.get("id"): p for p in todos_productos}

    for ig, grupo in enumerate(grupos, 1):
        url_grupo = grupo.get("url", "")
        ids_permitidos = grupo.get("productos")  # None = todos

        # Filtrar productos para este grupo
        if ids_permitidos is not None:
            prods_grupo = [p for p in todos_productos if p.get("id") in ids_permitidos]
        else:
            prods_grupo = todos_productos

        if not prods_grupo:
            warn(f"Grupo {ig}: no hay productos asignados, saltando.")
            continue

        info(f"Grupo {ig}/{len(grupos)}: {url_grupo} ({len(prods_grupo)} productos)")

        for i, p in enumerate(prods_grupo, 1):
            info(f"  [{i}/{len(prods_grupo)}] {p.get('nombre')}")
            publicar_en_grupo_facebook(p, url_grupo)
            if i < len(prods_grupo):
                time.sleep(PAUSA_ENTRE_GRUPOS_FACEBOOK)

        if ig < len(grupos):
            info(f"Pausa 60s antes del siguiente grupo...")
            time.sleep(60)

    ok("Facebook listo")

def modo_automatico():
    try:
        import schedule
    except ImportError:
        os.system(f"{sys.executable} -m pip install schedule -q")
        import schedule

    info("MODO AUTOMÁTICO ACTIVADO")
    info("  Facebook → 8:00 AM y 5:00 PM")
    info("  Revolico → 9:00 AM (diario)")
    info("Presiona Ctrl+C para detener\n")

    schedule.every().day.at("08:00").do(tarea_todos_facebook)
    schedule.every().day.at("09:00").do(tarea_todos_revolico)
    schedule.every().day.at("17:00").do(tarea_todos_facebook)

    while True:
        schedule.run_pending()
        proxima = schedule.next_run()
        if proxima:
            diff  = proxima - datetime.now()
            h     = int(diff.total_seconds() // 3600)
            m     = int((diff.total_seconds() % 3600) // 60)
            print(f"\r⏰  Próxima tarea en {h}h {m}m   ", end="", flush=True)
        time.sleep(30)

# ══════════════════════════════════════════════
#   MENÚ
# ══════════════════════════════════════════════

def ver_productos():
    productos = obtener_productos()
    print(f"\n{'─'*52}")
    print(f"  PRODUCTOS ({len(productos)} total)")
    print(f"{'─'*52}")
    for p in productos:
        print(f"  • {p['nombre']:<38} ${p.get('precioActual',0):<5} [{p.get('categoria','?')}]")
    print()

def menu():
    productos = obtener_productos()
    grupos_ok = len(FACEBOOK_GRUPOS)

    print(f"""
{B}╔══════════════════════════════════════════════╗
║         BOT TIENDAMAX v3.0                   ║
║   Revolico + Grupos Facebook                 ║
╠══════════════════════════════════════════════╣
║  Productos:  {len(productos):<3}  │  Grupos FB: {grupos_ok:<3}            ║
╚══════════════════════════════════════════════╝{W}

  {G}1.{W} Publicar AHORA en Revolico (todos los productos)
  {G}2.{W} Publicar AHORA en grupos de Facebook
  {G}3.{W} Publicar AHORA en ambos (Revolico + Facebook)
  {G}4.{W} Modo AUTOMÁTICO ← recomendado (8AM, 9AM, 5PM)
  {G}5.{W} Ver productos cargados
  {G}0.{W} Salir
""")

# ══════════════════════════════════════════════
#   INICIO
# ══════════════════════════════════════════════

if __name__ == "__main__":
    # Avisos de configuración pendiente
    if not FACEBOOK_GRUPOS:
        warn("Aún no configuraste grupos de Facebook.")
        warn("Edita FACEBOOK_GRUPOS en este archivo y agrega los URLs de tus grupos.\n")

    while True:
        menu()
        op = input("  Elige una opción: ").strip()

        if   op == "1": tarea_todos_revolico()
        elif op == "2": tarea_todos_facebook()
        elif op == "3": tarea_todos_revolico(); tarea_todos_facebook()
        elif op == "4": modo_automatico()
        elif op == "5": ver_productos()
        elif op == "0": print("Hasta luego 👋"); break
        else:           print("Opción no válida\n")
