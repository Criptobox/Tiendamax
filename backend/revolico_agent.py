#!/usr/bin/env python3
"""
Agente de Revolico - Publica anuncios automáticamente usando Playwright
"""

import os
import json
import time
import logging
import base64
import tempfile
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

logger = logging.getLogger(__name__)

# Archivo para guardar las cookies de sesión
COOKIES_FILE = '/home/ubuntu/tiendamax/backend/revolico_cookies.json'

# Mapeo de categorías de la tienda a categorías de Revolico
CATEGORIA_MAP = {
    'General': 'Otros',
    'Ropa': 'Ropa y Accesorios',
    'Electrónica': 'Computadoras y Electrónica',
    'Hogar': 'Hogar y Jardín',
    'Alimentos': 'Alimentos y Bebidas',
    'Belleza': 'Salud y Belleza',
    'Deportes': 'Deportes y Recreación',
    'Juguetes': 'Niños y Bebés',
    'Libros': 'Libros, Música y Películas',
    'Automóviles': 'Autos y Motos',
}


class RevolicoAgent:
    """Agente para publicar anuncios en Revolico automáticamente"""
    
    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self._session_active = False
    
    def _iniciar_navegador(self):
        """Inicia el navegador Playwright"""
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
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ]
            )
            
            # Cargar cookies guardadas si existen
            if os.path.exists(COOKIES_FILE):
                with open(COOKIES_FILE, 'r') as f:
                    cookies = json.load(f)
                self.context = self.browser.new_context(
                    viewport={'width': 1280, 'height': 800},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                )
                self.context.add_cookies(cookies)
            else:
                self.context = self.browser.new_context(
                    viewport={'width': 1280, 'height': 800},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                )
            
            self.page = self.context.new_page()
            logger.info("✅ Navegador iniciado correctamente")
            return True
        except Exception as e:
            logger.error(f"Error iniciando navegador: {e}")
            return False
    
    def _cerrar_navegador(self):
        """Cierra el navegador"""
        try:
            if self.context:
                # Guardar cookies antes de cerrar
                cookies = self.context.cookies()
                with open(COOKIES_FILE, 'w') as f:
                    json.dump(cookies, f)
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
            time.sleep(2)
            
            # Verificar si está logueado buscando el enlace de "Cuenta"
            cuenta_link = self.page.query_selector('a:has-text("Cuenta")')
            if cuenta_link:
                logger.info("✅ Sesión activa en Revolico")
                return True
            
            # También verificar por "Favoritos"
            favoritos = self.page.query_selector('a:has-text("Favoritos")')
            if favoritos:
                logger.info("✅ Sesión activa en Revolico (verificado por Favoritos)")
                return True
                
            return False
        except Exception as e:
            logger.error(f"Error verificando sesión: {e}")
            return False
    
    def _hacer_login(self) -> bool:
        """Realiza el login en Revolico"""
        try:
            logger.info("Iniciando login en Revolico...")
            
            # Ir a la página de login
            self.page.goto('https://www.revolico.com/auth/signin', timeout=30000)
            time.sleep(3)
            
            # Esperar y llenar el formulario
            self.page.wait_for_selector('input[type="email"]', timeout=15000)
            self.page.fill('input[type="email"]', self.email)
            self.page.fill('input[type="password"]', self.password)
            
            # Hacer clic en el botón de login
            self.page.click('button:has-text("Iniciar sesión")')
            time.sleep(4)
            
            # Verificar si el login fue exitoso
            current_url = self.page.url
            if 'signin' not in current_url and 'auth' not in current_url:
                logger.info("✅ Login exitoso en Revolico")
                # Guardar cookies
                cookies = self.context.cookies()
                with open(COOKIES_FILE, 'w') as f:
                    json.dump(cookies, f)
                return True
            
            # Verificar si hay mensaje de error
            error = self.page.query_selector('.error, [class*="error"]')
            if error:
                logger.error(f"Error de login: {error.text_content()}")
            
            # Intentar verificar por URL
            self.page.goto('https://www.revolico.com', timeout=30000)
            time.sleep(2)
            
            if self._verificar_sesion():
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
        
        # Si es base64, convertir a archivo temporal
        if imagen_data.startswith('data:image'):
            try:
                # Extraer el tipo y los datos
                header, data = imagen_data.split(',', 1)
                ext = 'jpg'
                if 'png' in header:
                    ext = 'png'
                elif 'gif' in header:
                    ext = 'gif'
                elif 'webp' in header:
                    ext = 'webp'
                
                # Crear archivo temporal
                tmp_file = tempfile.NamedTemporaryFile(
                    suffix=f'.{ext}',
                    delete=False,
                    dir='/tmp'
                )
                tmp_file.write(base64.b64decode(data))
                tmp_file.close()
                return tmp_file.name
            except Exception as e:
                logger.error(f"Error preparando imagen: {e}")
                return None
        
        # Si es una URL, descargar
        elif imagen_data.startswith('http'):
            try:
                import urllib.request
                tmp_file = tempfile.NamedTemporaryFile(
                    suffix='.jpg',
                    delete=False,
                    dir='/tmp'
                )
                urllib.request.urlretrieve(imagen_data, tmp_file.name)
                return tmp_file.name
            except Exception as e:
                logger.error(f"Error descargando imagen: {e}")
                return None
        
        return None
    
    def _seleccionar_categoria(self, categoria_tienda: str) -> bool:
        """Selecciona la categoría correcta en el formulario de Revolico"""
        try:
            # Hacer clic en el selector de categoría
            self.page.click('#category-selector', timeout=5000)
            time.sleep(1)
            
            # Buscar la categoría más apropiada
            categoria_revolico = CATEGORIA_MAP.get(categoria_tienda, 'Otros')
            
            # Intentar encontrar y hacer clic en la categoría
            # Primero buscar por texto exacto
            cat_element = self.page.query_selector(f'[role="option"]:has-text("{categoria_revolico}")')
            if not cat_element:
                # Buscar "Otros" como fallback
                cat_element = self.page.query_selector('[role="option"]:has-text("Otros")')
            
            if cat_element:
                cat_element.click()
                time.sleep(1)
                return True
            
            # Si no encontramos la categoría, buscar en la lista
            opciones = self.page.query_selector_all('[role="option"]')
            if opciones:
                # Seleccionar la primera opción disponible
                opciones[0].click()
                time.sleep(1)
                return True
                
            return False
        except Exception as e:
            logger.error(f"Error seleccionando categoría: {e}")
            return False
    
    def publicar_producto(self, producto: dict) -> dict:
        """
        Publica un producto en Revolico
        
        Args:
            producto: Diccionario con datos del producto
            
        Returns:
            dict con 'success', 'mensaje' y opcionalmente 'url'
        """
        imagen_tmp = None
        
        try:
            # Iniciar navegador
            if not self._iniciar_navegador():
                return {'success': False, 'error': 'No se pudo iniciar el navegador'}
            
            # Verificar/hacer login
            if not self._verificar_sesion():
                if not self._hacer_login():
                    return {'success': False, 'error': 'No se pudo iniciar sesión en Revolico'}
            
            # Preparar imagen
            imagen_tmp = self._preparar_imagen(producto)
            
            # Navegar al formulario de publicación
            logger.info(f"Navegando al formulario de publicación para: {producto.get('nombre', 'producto')}")
            self.page.goto('https://www.revolico.com/item/publish', timeout=30000)
            time.sleep(3)
            
            # Verificar que estamos en la página correcta
            if 'publish' not in self.page.url and 'item' not in self.page.url:
                logger.error(f"URL inesperada: {self.page.url}")
                return {'success': False, 'error': 'No se pudo acceder al formulario de publicación'}
            
            # Subir imagen si existe
            if imagen_tmp and os.path.exists(imagen_tmp):
                try:
                    file_input = self.page.query_selector('input[type="file"]')
                    if file_input:
                        file_input.set_input_files(imagen_tmp)
                        time.sleep(2)
                        logger.info("✅ Imagen subida")
                except Exception as e:
                    logger.warning(f"No se pudo subir imagen: {e}")
            
            # Llenar título (máximo 120 caracteres)
            nombre = producto.get('nombre', 'Producto disponible')[:120]
            self.page.wait_for_selector('#title', timeout=10000)
            self.page.fill('#title', nombre)
            time.sleep(0.5)
            
            # Llenar precio
            precio = str(producto.get('precioActual', producto.get('precio', 0)))
            self.page.fill('#price', precio)
            time.sleep(0.5)
            
            # Seleccionar moneda (USD por defecto)
            try:
                moneda_select = self.page.query_selector('select')
                if moneda_select:
                    moneda_select.select_option('USD')
            except Exception:
                pass
            
            # Llenar descripción
            descripcion = self._generar_descripcion(producto)
            self.page.fill('#description', descripcion)
            time.sleep(0.5)
            
            # Seleccionar categoría
            categoria = producto.get('categoria', 'General')
            self._seleccionar_categoria(categoria)
            
            # Seleccionar provincia (La Habana por defecto)
            try:
                provincia_select = self.page.query_selector('#province-select')
                if provincia_select:
                    provincia_select.select_option('La Habana')
                    time.sleep(1)
            except Exception as e:
                logger.warning(f"Error seleccionando provincia: {e}")
            
            # Seleccionar municipio (Plaza por defecto)
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
            publicar_btn = self.page.query_selector('button:has-text("Publicar anuncio")')
            if not publicar_btn:
                publicar_btn = self.page.query_selector('button[type="submit"]')
            
            if publicar_btn:
                publicar_btn.click()
                time.sleep(5)
                
                # Verificar si se publicó correctamente
                url_actual = self.page.url
                
                # Buscar mensaje de éxito
                success_msg = self.page.query_selector('[class*="success"], [class*="Success"]')
                
                if 'item' in url_actual and 'publish' not in url_actual:
                    logger.info(f"✅ Producto publicado exitosamente: {url_actual}")
                    return {
                        'success': True,
                        'mensaje': f'Producto "{nombre}" publicado en Revolico',
                        'url': url_actual
                    }
                elif success_msg:
                    return {
                        'success': True,
                        'mensaje': f'Producto "{nombre}" publicado en Revolico',
                        'url': url_actual
                    }
                else:
                    # Verificar si hay errores
                    error_msg = self.page.query_selector('[class*="error"], [class*="Error"]')
                    if error_msg:
                        error_text = error_msg.text_content()
                        logger.error(f"Error al publicar: {error_text}")
                        return {'success': False, 'error': error_text}
                    
                    # Si no hay error claro, asumir éxito si la URL cambió
                    if url_actual != 'https://www.revolico.com/item/publish':
                        return {
                            'success': True,
                            'mensaje': f'Producto "{nombre}" enviado a Revolico',
                            'url': url_actual
                        }
                    
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
            # Limpiar imagen temporal
            if imagen_tmp and os.path.exists(imagen_tmp):
                try:
                    os.unlink(imagen_tmp)
                except Exception:
                    pass
            # Cerrar navegador
            self._cerrar_navegador()
    
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
            texto += f"~~Precio anterior: ${precio_original} USD~~\n"
            if descuento:
                texto += f"🏷️ ¡{descuento}% de descuento!\n"
        else:
            texto += f"💰 Precio: ${precio_actual} USD\n"
        
        if stock and int(stock) <= 5:
            texto += f"⚠️ ¡Solo quedan {stock} unidades!\n"
        
        texto += "\n📱 Contactar por WhatsApp para más información\n"
        texto += "✅ Calidad garantizada\n"
        texto += "🚚 Envío disponible"
        
        return texto[:1000]  # Límite de Revolico
    
    def verificar_conexion(self) -> dict:
        """Verifica la conexión con Revolico"""
        try:
            if not self._iniciar_navegador():
                return {'success': False, 'error': 'No se pudo iniciar el navegador'}
            
            if self._verificar_sesion():
                return {'success': True, 'mensaje': 'Sesión activa en Revolico'}
            
            if self._hacer_login():
                return {'success': True, 'mensaje': 'Login exitoso en Revolico'}
            
            return {'success': False, 'error': 'No se pudo conectar a Revolico'}
        finally:
            self._cerrar_navegador()
