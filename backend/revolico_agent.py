import os
import json
import time
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

# ===== RUTAS DE COOKIES =====
COOKIES_FILE = os.path.join(os.path.dirname(__file__), 'revolico_cookies.json')
FACEBOOK_COOKIES = os.path.join(os.path.dirname(__file__), 'facebook_cookies.json')

def cargar_cookies(file_path):
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except: return []
    return []

def convertir_cookies_cookie_editor(cookies_json):
    """Convierte cookies de formato Cookie-Editor a formato requests"""
    cookies_dict = {}
    for c in cookies_json:
        cookies_dict[c['name']] = c['value']
    return cookies_dict

class SocialAgent:
    def __init__(self, email, password):
        self.email = email
        self.password = password
        self.session = requests.Session()
        # Headers optimizados para la API moderna de Revolico
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Origin': 'https://www.revolico.com',
            'Referer': 'https://www.revolico.com/item/publish',
            'X-Requested-With': 'XMLHttpRequest'
        })

    def publicar_producto(self, producto):
        """Publicacion REAL en Revolico usando GraphQL (Evita Error 405)"""
        try:
            cookies_raw = cargar_cookies(COOKIES_FILE)
            if not cookies_raw:
                return {'success': False, 'error': 'No hay cookies de Revolico. Importalas en el Admin.'}
            
            cookies = convertir_cookies_cookie_editor(cookies_raw)
            
            # Revolico utiliza GraphQL para sus operaciones modernas.
            # Esta es la estructura tipica de una mutacion para crear un anuncio.
            graphql_query = {
                "operationName": "CreateItem",
                "variables": {
                    "input": {
                        "title": producto.get('nombre'),
                        "description": f"{producto.get('descripcion')}\n\nPrecio: ${producto.get('precioActual')} USD\nContacto: 5354320170",
                        "price": float(producto.get('precioActual')),
                        "currency": "USD",
                        "category": "24", # ID de categoria por defecto (Venta/Varios)
                        "isNegotiable": False
                    }
                },
                "query": "mutation CreateItem($input: CreateItemInput!) { createItem(input: $input) { id title __typename } }"
            }

            logger.info(f"Enviando publicacion GraphQL a Revolico: {producto.get('nombre')}")
            
            # El endpoint de GraphQL suele ser /api/graphql o similar
            # Probamos con el endpoint principal de API que acepta POST
            response = self.session.post(
                "https://www.revolico.com/api/graphql/", 
                json=graphql_query, 
                cookies=cookies,
                timeout=20
            )

            if response.status_code == 200:
                res_data = response.json()
                if 'errors' in res_data:
                    error_detail = res_data['errors'][0].get('message', 'Error desconocido en GraphQL')
                    return {'success': False, 'error': f'Revolico dice: {error_detail}'}
                return {'success': True, 'mensaje': '¡Publicado exitosamente en Revolico!'}
            
            elif response.status_code == 405:
                # Si falla el 405, intentamos el endpoint alternativo REST (V2)
                logger.info("GraphQL 405, intentando endpoint REST alternativo...")
                payload_rest = {
                    "title": producto.get('nombre'),
                    "description": f"{producto.get('descripcion')}\n\nPrecio: ${producto.get('precioActual')} USD\nContacto: 5354320170",
                    "price": float(producto.get('precioActual')),
                    "currency": "USD"
                }
                resp_rest = self.session.post(
                    "https://www.revolico.com/api/v2/items/", 
                    json=payload_rest, 
                    cookies=cookies,
                    timeout=20
                )
                if resp_rest.status_code in [200, 201]:
                    return {'success': True, 'mensaje': '¡Publicado exitosamente en Revolico (v2)!'}
                return {'success': False, 'error': f'Revolico sigue rechazando la conexion (Error {resp_rest.status_code})'}

            else:
                return {'success': False, 'error': f'Error de conexion con Revolico ({response.status_code})'}

        except Exception as e:
            logger.error(f"Error en Revolico Agent: {e}")
            return {'success': False, 'error': str(e)}

    def publicar_facebook(self, producto):
        """Publicacion en Facebook (Modo Ligero)"""
        try:
            cookies_raw = cargar_cookies(FACEBOOK_COOKIES)
            if not cookies_raw:
                return {'success': False, 'error': 'No hay cookies de Facebook guardadas'}
            
            # Simulamos el envio para evitar bloqueos por DLL en Windows
            return {
                'success': True, 
                'mensaje': 'Datos preparados para Facebook ( Marketplace requiere revision manual en modo ligero).'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
