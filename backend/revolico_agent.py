#!/usr/bin/env python3
"""
Agente de Revolico - Publica anuncios automáticamente usando Playwright
Mejorado con soporte de cookies exportadas desde Cookie-Editor
"""

import os
import json
import time
import logging
import base64
import tempfile
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

logger = logging.getLogger(__name__)

# ===== RUTAS DE COOKIES =====
# El agente busca las cookies en este orden de prioridad:
# 1. Cookies exportadas desde Cookie-Editor (formato original o convertido)
# 2. Cookies guardadas automáticamente por el agente en sesiones anteriores
COOKIES_FILE = os.path.join(os.path.dirname(__file__), 'revolico_cookies.json')
COOKIES_BACKUP = os.path.join(os.path.dirname(__file__), 'revolico_cookies_backup.json')

# ===== MAPEO DE CATEGORÍAS =====
# Categorías de la tienda → categorías de Revolico
CATEGORIA_MAP = {
    # Categorías propias de la tienda
    'General':    'Otros',
    'WIFI':       'Computadoras y Electrónica',
    'ENERGIA':    'Computadoras y Electrónica',
    'CELULARES':  'Celulares y Teléfonos',
    'UTILES':     'Hogar y Jardín',
    # Categorías genéricas
    'Ropa':       'Ropa y Accesorios',
    'Electrónica':'Computadoras y Electrónica',
    'Hogar':      'Hogar y Jardín',
    'Alimentos':  'Alimentos y Bebidas',
    'Belleza':    'Salud y Belleza',
    'Deportes':   'Deportes y Recreación',
    'Juguetes':   'Niños y Bebés',
    'Libros':     'Libros, Música y Películas',
    'Automóviles':'Autos y Motos',
}


def convertir_cookies_cookie_editor(cookies_raw: list) -> list:
    """
    Convierte cookies del formato Cookie-Editor al formato Playwright.
    Cookie-Editor exporta: domain, expirationDate, hostOnly, httpOnly, name, path, sameSite, secure, session, storeId, value
    Playwright espera: name, value, domain, path, expires, httpOnly, secure, sameSite
    """
    same_site_map = {
        'lax': 'Lax',
        'strict': 'Strict',
        'no_restriction': 'None',
        None: 'Lax',
        'Lax': 'Lax',
        'Strict': 'Strict',
        'None': 'None',
    }

    cookies_playwright = []
    for c in cookies_raw:
        # Detectar si ya está en formato Playwright (tiene 'expires' en vez de 'expirationDate')
        if 'expires' in c and 'expirationDate' not in c:
            cookies_playwright.append(c)
            continue

        same_site_raw = c.get('sameSite')
        same_site = same_site_map.get(same_site_raw, 'Lax')

        cookie_playwright = {
            'name': c['name'],
            'value': c['value'],
            'domain': c['domain'],
            'path': c.get('path', '/'),
            'expires': int(c.get('expirationDate', -1)),
            'httpOnly': c.get('httpOnly', False),
            'secure': c.get('secure', False),
            'sameSite': same_site,
        }
        cookies_playwright.append(cookie_playwright)

    return cookies_playwright


def cargar_cookies() -> list:
    """
    Carga las cookies desde el archivo, convirtiendo automáticamente
    si están en formato Cookie-Editor.
    """
    if not os.path.exists(COOKIES_FILE):
        logger.warning(f"No se encontró el archivo de cookies: {COOKIES_FILE}")
        return []

    try:
        with open(COOKIES_FILE, 'rb') as f:
            data = f.read()

        # Limpiar non-breaking spaces que puede exportar Cookie-Editor
        data = data.replace(b'\xc2\xa0', b' ')
        contenido = data.decode('utf-8')
        cookies_raw = json.loads(contenido)

        if not cookies_raw:
            return []

        # Detectar formato y convertir si es necesario
        primera = cookies_raw[0]
        if 'expirationDate' in primera:
            logger.info("Detectado formato Cookie-Editor, convirtiendo al formato Playwright...")
            cookies = convertir_cookies_cookie_editor(cookies_raw)
            # Guardar la versión convertida para próximas ejecuciones
            with open(COOKIES_FILE, 'w') as f:
                json.dump(cookies, f, indent=2)
            logger.info(f"✅ {len(cookies)} cookies convertidas y guardadas")
        else:
            cookies = cookies_raw
            logger.info(f"✅ {len(cookies)} cookies cargadas (formato Playwright)")

        return cookies

    except Exception as e:
        logger.error(f"Error cargando cookies: {e}")
        return []


def guardar_cookies(cookies: list):
    """Guarda las cookies actualizadas después de una sesión."""
    try:
        # Hacer backup de las cookies anteriores
        if os.path.exists(COOKIES_FILE):
            import shutil
            shutil.copy2(COOKIES_FILE, COOKIES_BACKUP)

        with open(COOKIES_FILE, 'w') as f:
            json.dump(cookies, f, indent=2)
        logger.info(f"✅ {len(cookies)} cookies guardadas")
    except Exception as e:
        logger.error(f"Error guardando cookies: {e}")


class SocialAgent:
    """Agente para publicar anuncios en Revolico y Facebook automáticamente"""

    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self._session_active = False

    def publicar_facebook(self, producto: dict) -> dict:
        """Publica un producto en Facebook Marketplace usando cookies"""
        imagen_tmp = None
        try:
            if not self._iniciar_navegador():
                return {'success': False, 'error': 'No se pudo iniciar el navegador'}

            imagen_tmp = self._preparar_imagen(producto)
            nombre = producto.get('nombre', 'Producto disponible')
            descripcion = self._generar_descripcion(producto)
            precio = str(producto.get('precioActual', 0))

            # Ir a Marketplace
            logger.info(f"Accediendo a Facebook Marketplace...")
            self.page.goto('https://www.facebook.com/marketplace/create/item', timeout=60000)
            time.sleep(7)

            # Verificación robusta de sesión
            if "login" in self.page.url or self.page.query_selector('input[name="email"], input[placeholder*="Correo"], input[placeholder*="Email"]'):
                logger.warning("❌ Sesión de Facebook expirada.")
                return {'success': False, 'error': 'La sesión de Facebook expiró. Por favor, exporta nuevas cookies desde Facebook y súbelas al panel admin.'}

            # Llenar el formulario de Marketplace
            # Facebook usa una estructura muy dinámica. Buscamos por múltiples criterios.
            try:
                # 1. Subir imagen (es lo primero que suele pedir)
                logger.info("Subiendo imagen...")
                if imagen_tmp:
                    # Buscamos cualquier input de archivo
                    file_input = self.page.query_selector('input[type="file"]')
                    if file_input:
                        file_input.set_input_files(imagen_tmp)
                        time.sleep(4)

                # 2. Título (Buscamos por etiquetas comunes en ES y EN)
                logger.info("Llenando título...")
                titulo_selectors = [
                    'label:has-text("Título") input', 'label:has-text("Title") input',
                    'input[aria-label="Título"]', 'input[aria-label="Title"]',
                    'input[placeholder*="Título"]', 'input[placeholder*="Title"]'
                ]
                titulo_llenado = False
                for sel in titulo_selectors:
                    try:
                        if self.page.query_selector(sel):
                            self.page.fill(sel, nombre)
                            titulo_llenado = True
                            break
                    except: continue
                
                if not titulo_llenado:
                    # Intento desesperado: el primer input de texto después de las fotos
                    self.page.keyboard.press("Tab")
                    self.page.keyboard.type(nombre)

                # 3. Precio
                logger.info("Llenando precio...")
                precio_selectors = [
                    'label:has-text("Precio") input', 'label:has-text("Price") input',
                    'input[aria-label="Precio"]', 'input[aria-label="Price"]'
                ]
                for sel in precio_selectors:
                    try:
                        if self.page.query_selector(sel):
                            self.page.fill(sel, precio)
                            break
                    except: continue

                # 4. Categoría (Suele ser un dropdown)
                logger.info("Seleccionando categoría...")
                cat_selectors = ['label:has-text("Categoría")', 'label:has-text("Category")', 'div[aria-label*="Categoría"]']
                for sel in cat_selectors:
                    try:
                        if self.page.query_selector(sel):
                            self.page.click(sel)
                            time.sleep(2)
                            # Seleccionar la primera opción disponible
                            self.page.click('div[role="listbox"] div[role="option"]:first-child, div[role="dialog"] div[role="listitem"]:first-child')
                            break
                    except: continue

                # 5. Estado (Nuevo)
                logger.info("Seleccionando estado...")
                estado_selectors = ['label:has-text("Estado")', 'label:has-text("Condition")']
                for sel in estado_selectors:
                    try:
                        if self.page.query_selector(sel):
                            self.page.click(sel)
                            time.sleep(1.5)
                            # Buscar "Nuevo" o "New"
                            self.page.click('span:has-text("Nuevo"), span:has-text("New")')
                            break
                    except: continue

                # 6. Descripción
                logger.info("Llenando descripción...")
                desc_selectors = [
                    'label:has-text("Descripción") textarea', 'label:has-text("Description") textarea',
                    'textarea[aria-label="Descripción"]', 'textarea[aria-label="Description"]'
                ]
                for sel in desc_selectors:
                    try:
                        if self.page.query_selector(sel):
                            self.page.fill(sel, descripcion)
                            break
                    except: continue

                # 7. Siguiente y Publicar
                logger.info("Finalizando publicación...")
                # Botón Siguiente
                btn_sig = self.page.query_selector('div[aria-label="Siguiente"], div[aria-label="Next"], span:has-text("Siguiente"), span:has-text("Next")')
                if btn_sig:
                    btn_sig.click()
                    time.sleep(3)
                
                # Botón Publicar
                btn_pub = self.page.query_selector('div[aria-label="Publicar"], div[aria-label="Publish"], span:has-text("Publicar"), span:has-text("Publish")')
                if btn_pub:
                    btn_pub.click()
                    time.sleep(6)
                    return {'success': True, 'mensaje': f'"{nombre}" enviado a Facebook Marketplace'}
                else:
                    return {'success': False, 'error': 'No se encontró el botón final de Publicar'}

            except Exception as e:
                logger.error(f"Error detallado en Facebook: {e}")
                self.page.screenshot(path="error_fb_detallado.png")
                return {'success': False, 'error': f'Fallo en el formulario: {str(e)}'}

        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if imagen_tmp and os.path.exists(imagen_tmp):
                os.unlink(imagen_tmp)
            self._cerrar_navegador()

    def _iniciar_navegador(self):
        """Inicia el navegador Playwright con las cookies guardadas"""
        try:
            self.playwright = sync_playwright().start()
            self.browser = self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-blink-features=AutomationControlled',
                ]
            )

            self.context = self.browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='es-CU',
            )

            # Cargar cookies si existen
            cookies = cargar_cookies()
            if cookies:
                try:
                    self.context.add_cookies(cookies)
                    logger.info(f"✅ {len(cookies)} cookies cargadas en el navegador")
                except Exception as e:
                    logger.warning(f"Error al cargar algunas cookies: {e}")

            self.page = self.context.new_page()
            logger.info("✅ Navegador iniciado correctamente")
            return True

        except Exception as e:
            logger.error(f"Error iniciando navegador: {e}")
            return False

    def _cerrar_navegador(self):
        """Cierra el navegador y guarda las cookies actualizadas"""
        try:
            if self.context:
                # Guardar cookies actualizadas antes de cerrar
                cookies_actualizadas = self.context.cookies()
                if cookies_actualizadas:
                    guardar_cookies(cookies_actualizadas)
                self.context.close()
            if self.browser:
                self.browser.close()
            if self.playwright:
                self.playwright.stop()
            self._session_active = False
        except Exception as e:
            logger.error(f"Error cerrando navegador: {e}")

    def _verificar_sesion(self) -> bool:
        """Verifica si la sesión está activa en Revolico"""
        try:
            self.page.goto('https://www.revolico.com', timeout=30000)
            time.sleep(3)

            # Verificar indicadores de sesión activa
            indicadores = [
                'a:has-text("Cuenta")',
                'a:has-text("Favoritos")',
                'a:has-text("Mis anuncios")',
                '[data-testid="user-menu"]',
                'a[href="/user/profile"]',
                'button:has-text("Publicar")',
            ]

            for selector in indicadores:
                try:
                    elemento = self.page.query_selector(selector)
                    if elemento:
                        logger.info(f"✅ Sesión activa en Revolico (verificado por: {selector})")
                        return True
                except Exception:
                    continue

            # Verificar si hay token en las cookies cargadas
            cookies_actuales = self.context.cookies()
            for c in cookies_actuales:
                if c['name'] in ('st-access-token', 'st-refresh-token', 'sFrontToken'):
                    logger.info("✅ Sesión activa (token encontrado en cookies)")
                    return True

            logger.warning("⚠️ No se detectó sesión activa")
            return False

        except Exception as e:
            logger.error(f"Error verificando sesión: {e}")
            return False

    def _hacer_login(self) -> bool:
        """Realiza el login en Revolico (solo si las cookies no funcionan)"""
        try:
            logger.info("Iniciando login en Revolico...")
            self.page.goto('https://www.revolico.com/auth/signin', timeout=30000)
            time.sleep(3)

            self.page.wait_for_selector('input[type="email"]', timeout=15000)
            self.page.fill('input[type="email"]', self.email)
            time.sleep(0.5)
            self.page.fill('input[type="password"]', self.password)
            time.sleep(0.5)

            # Buscar el botón de login
            botones_login = [
                'button:has-text("Iniciar sesión")',
                'button[type="submit"]',
                'button:has-text("Entrar")',
                'button:has-text("Login")',
            ]
            for selector in botones_login:
                try:
                    btn = self.page.query_selector(selector)
                    if btn:
                        btn.click()
                        break
                except Exception:
                    continue

            time.sleep(5)

            # Verificar si el login fue exitoso
            if self._verificar_sesion():
                logger.info("✅ Login exitoso en Revolico")
                # Guardar las nuevas cookies
                cookies = self.context.cookies()
                guardar_cookies(cookies)
                return True

            logger.error("❌ Login fallido en Revolico")
            return False

        except Exception as e:
            logger.error(f"Error durante login: {e}")
            return False

    def _preparar_imagen(self, producto: dict) -> str:
        """Prepara la imagen del producto para subir"""
        imagen_data = producto.get('imagen', '')
        if not imagen_data:
            return None

        if imagen_data.startswith('data:image'):
            try:
                header, data = imagen_data.split(',', 1)
                ext = 'jpg'
                if 'png' in header: ext = 'png'
                elif 'gif' in header: ext = 'gif'
                elif 'webp' in header: ext = 'webp'

                tmp_file = tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False, dir='/tmp')
                tmp_file.write(base64.b64decode(data))
                tmp_file.close()
                return tmp_file.name
            except Exception as e:
                logger.error(f"Error preparando imagen: {e}")
                return None

        elif imagen_data.startswith('http'):
            try:
                import urllib.request
                tmp_file = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False, dir='/tmp')
                urllib.request.urlretrieve(imagen_data, tmp_file.name)
                return tmp_file.name
            except Exception as e:
                logger.error(f"Error descargando imagen: {e}")
                return None

        return None

    def _seleccionar_categoria(self, categoria_tienda: str) -> bool:
        """Selecciona la categoría correcta en el formulario de Revolico"""
        try:
            categoria_revolico = CATEGORIA_MAP.get(categoria_tienda, 'Otros')

            # Intentar hacer clic en el selector de categoría
            selectores_categoria = ['#category-selector', '[data-testid="category-selector"]', 'select[name="category"]']
            for sel in selectores_categoria:
                try:
                    self.page.click(sel, timeout=3000)
                    time.sleep(1)
                    break
                except Exception:
                    continue

            # Buscar la opción de categoría
            cat_element = self.page.query_selector(f'[role="option"]:has-text("{categoria_revolico}")')
            if not cat_element:
                cat_element = self.page.query_selector('[role="option"]:has-text("Otros")')

            if cat_element:
                cat_element.click()
                time.sleep(1)
                return True

            # Fallback: seleccionar primera opción disponible
            opciones = self.page.query_selector_all('[role="option"]')
            if opciones:
                opciones[0].click()
                time.sleep(1)
                return True

            return False

        except Exception as e:
            logger.error(f"Error seleccionando categoría: {e}")
            return False

    def _generar_descripcion(self, producto: dict) -> str:
        """Genera una descripción atractiva para el anuncio"""
        nombre = producto.get('nombre', 'Producto')
        descripcion = producto.get('descripcion', '')
        precio_original = producto.get('precioOriginal', 0)
        precio_actual = producto.get('precioActual', producto.get('precio', 0))
        descuento = producto.get('descuento', 0)
        stock = producto.get('stock', 1)

        texto = f"{descripcion}\n\n" if descripcion else ""

        if precio_original and precio_original != precio_actual:
            texto += f"💰 Precio especial: ${precio_actual} USD\n"
            if descuento:
                texto += f"🏷️ ¡{descuento}% de descuento!\n"
        else:
            texto += f"💰 Precio: ${precio_actual} USD\n"

        if stock and int(stock) <= 5:
            texto += f"⚠️ ¡Solo quedan {stock} unidades!\n"

        texto += f"\n📞 Contacto por WhatsApp: +53 54320170"
        return texto[:2000]  # Revolico limita la descripción

    def publicar_producto(self, producto: dict) -> dict:
        """
        Publica un producto en Revolico.
        
        Args:
            producto: Diccionario con datos del producto
            
        Returns:
            dict con 'success', 'mensaje' y opcionalmente 'url'
        """
        imagen_tmp = None

        try:
            if not self._iniciar_navegador():
                return {'success': False, 'error': 'No se pudo iniciar el navegador'}

            # Verificar sesión; si no está activa, hacer login
            if not self._verificar_sesion():
                logger.info("Sesión no activa, intentando login...")
                if not self._hacer_login():
                    return {'success': False, 'error': 'No se pudo iniciar sesión en Revolico. Verifica las cookies o credenciales.'}

            imagen_tmp = self._preparar_imagen(producto)

            # Navegar al formulario de publicación
            nombre = producto.get('nombre', 'Producto disponible')[:120]
            logger.info(f"Publicando: {nombre}")
            self.page.goto('https://www.revolico.com/item/publish', timeout=30000)
            time.sleep(3)

            # Verificar que estamos en la página correcta
            if 'publish' not in self.page.url and 'item' not in self.page.url:
                # Intentar navegar directamente
                self.page.goto('https://www.revolico.com/item/publish', timeout=30000)
                time.sleep(3)
                if 'publish' not in self.page.url:
                    return {'success': False, 'error': f'No se pudo acceder al formulario. URL actual: {self.page.url}'}

            # Subir imagen
            if imagen_tmp and os.path.exists(imagen_tmp):
                try:
                    file_input = self.page.query_selector('input[type="file"]')
                    if file_input:
                        file_input.set_input_files(imagen_tmp)
                        time.sleep(2)
                        logger.info("✅ Imagen subida")
                except Exception as e:
                    logger.warning(f"No se pudo subir imagen: {e}")

            # Llenar título
            try:
                self.page.wait_for_selector('#title', timeout=10000)
                self.page.fill('#title', nombre)
                time.sleep(0.5)
            except Exception as e:
                logger.error(f"No se encontró el campo título: {e}")
                return {'success': False, 'error': 'No se encontró el formulario de publicación'}

            # Llenar precio
            precio = str(producto.get('precioActual', producto.get('precio', 0)))
            try:
                self.page.fill('#price', precio)
                time.sleep(0.5)
            except Exception as e:
                logger.warning(f"Error llenando precio: {e}")

            # Seleccionar moneda USD
            try:
                moneda_select = self.page.query_selector('select')
                if moneda_select:
                    moneda_select.select_option('USD')
            except Exception:
                pass

            # Llenar descripción
            descripcion = self._generar_descripcion(producto)
            try:
                self.page.fill('#description', descripcion)
                time.sleep(0.5)
            except Exception as e:
                logger.warning(f"Error llenando descripción: {e}")

            # Seleccionar categoría
            categoria = producto.get('categoria', 'General')
            self._seleccionar_categoria(categoria)

            # Seleccionar provincia (La Habana)
            try:
                provincia_select = self.page.query_selector('#province-select')
                if provincia_select:
                    provincia_select.select_option('La Habana')
                    time.sleep(1)
            except Exception as e:
                logger.warning(f"Error seleccionando provincia: {e}")

            # Seleccionar municipio (Plaza)
            try:
                municipio_select = self.page.query_selector('#municipality-select')
                if municipio_select:
                    time.sleep(1)
                    opciones = municipio_select.query_selector_all('option')
                    if len(opciones) > 1:
                        municipio_select.select_option(index=1)
                    time.sleep(0.5)
            except Exception as e:
                logger.warning(f"Error seleccionando municipio: {e}")

            # Verificar/llenar teléfono
            try:
                telefono_input = self.page.query_selector('#firstPhone\\.number')
                if telefono_input:
                    valor_actual = telefono_input.input_value()
                    if not valor_actual:
                        telefono_input.fill('54320170')
            except Exception as e:
                logger.warning(f"Error con teléfono: {e}")

            # Hacer clic en Publicar
            logger.info("Haciendo clic en Publicar anuncio...")
            publicar_btn = None
            for selector in ['button:has-text("Publicar anuncio")', 'button[type="submit"]', 'button:has-text("Publicar")']:
                try:
                    publicar_btn = self.page.query_selector(selector)
                    if publicar_btn:
                        break
                except Exception:
                    continue

            if publicar_btn:
                publicar_btn.click()
                time.sleep(5)

                url_actual = self.page.url
                success_msg = self.page.query_selector('[class*="success"], [class*="Success"]')

                if 'item' in url_actual and 'publish' not in url_actual:
                    logger.info(f"✅ Producto publicado: {url_actual}")
                    return {'success': True, 'mensaje': f'"{nombre}" publicado en Revolico', 'url': url_actual}
                elif success_msg:
                    return {'success': True, 'mensaje': f'"{nombre}" publicado en Revolico', 'url': url_actual}
                else:
                    error_msg = self.page.query_selector('[class*="error"], [class*="Error"]')
                    if error_msg:
                        error_text = error_msg.text_content()
                        logger.error(f"Error al publicar: {error_text}")
                        return {'success': False, 'error': error_text}

                    if url_actual != 'https://www.revolico.com/item/publish':
                        return {'success': True, 'mensaje': f'"{nombre}" enviado a Revolico', 'url': url_actual}

                    return {'success': False, 'error': 'No se pudo confirmar la publicación'}
            else:
                return {'success': False, 'error': 'No se encontró el botón de publicar'}

        except PlaywrightTimeout as e:
            logger.error(f"Timeout en Revolico: {e}")
            return {'success': False, 'error': f'Tiempo de espera agotado: {str(e)}'}
        except Exception as e:
            logger.error(f"Error publicando en Revolico: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            if imagen_tmp and os.path.exists(imagen_tmp):
                try:
                    os.unlink(imagen_tmp)
                except Exception:
                    pass
            self._cerrar_navegador()
