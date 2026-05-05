#!/usr/bin/env python3
"""
Backend de TiendaMax - Agente de Publicación Automática
Publica productos en Revolico automáticamente a las 8:00 y 17:00 horas
"""

import os
import json
import time
import logging
import threading
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

# Importar el agente social
from revolico_agent import SocialAgent as SocialAgent

# Configuración de logging
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'publicaciones.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Configuración CORS ultra-permisiva para Windows
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Zona horaria de Cuba
CUBA_TZ = pytz.timezone('America/Havana')

# Credenciales de Revolico
REVOLICO_EMAIL = "julio1992rivero@gmail.com"
REVOLICO_PASSWORD = "Qwe18*92"

# Directorio base del backend (relativo al script)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')

# Archivo de productos (compartido con el frontend)
PRODUCTS_FILE = os.path.normpath(os.path.join(DATA_DIR, 'products.json'))
LOG_FILE = os.path.normpath(os.path.join(BASE_DIR, 'publicaciones.log'))
REGISTRO_FILE = os.path.normpath(os.path.join(DATA_DIR, 'registro_publicaciones.json'))
COOKIES_FILE = os.path.normpath(os.path.join(BASE_DIR, 'revolico_cookies.json'))
FACEBOOK_COOKIES_FILE = os.path.normpath(os.path.join(BASE_DIR, 'facebook_cookies.json'))

# Inicializar agente
social_agent = SocialAgent(REVOLICO_EMAIL, REVOLICO_PASSWORD)

# Scheduler para publicaciones automáticas
scheduler = BackgroundScheduler(timezone=CUBA_TZ)


def cargar_productos():
    """Carga los productos desde el archivo JSON"""
    if os.path.exists(PRODUCTS_FILE):
        with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []


def guardar_productos(productos):
    """Guarda los productos en el archivo JSON"""
    os.makedirs(os.path.dirname(PRODUCTS_FILE), exist_ok=True)
    with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(productos, f, ensure_ascii=False, indent=2)


def publicacion_automatica():
    """Función que se ejecuta automáticamente a las 8:00 y 17:00"""
    hora_actual = datetime.now(CUBA_TZ).strftime('%H:%M')
    logger.info(f"=== PUBLICACIÓN AUTOMÁTICA INICIADA A LAS {hora_actual} ===")
    
    productos = cargar_productos()
    
    if not productos:
        logger.info("No hay productos para publicar")
        return
    
    logger.info(f"Publicando {len(productos)} productos en Revolico...")
    
    resultados = []
    for producto in productos:
        try:
            resultado = social_agent.publicar_producto(producto)
            resultados.append({
                'producto': producto.get('nombre', 'Sin nombre'),
                'exito': resultado['success'],
                'mensaje': resultado.get('mensaje', ''),
                'url': resultado.get('url', '')
            })
            logger.info(f"✅ Publicado: {producto.get('nombre')} - {resultado.get('mensaje', '')}")
            time.sleep(5)  # Esperar entre publicaciones para evitar spam
        except Exception as e:
            logger.error(f"❌ Error publicando {producto.get('nombre', 'producto')}: {str(e)}")
            resultados.append({
                'producto': producto.get('nombre', 'Sin nombre'),
                'exito': False,
                'mensaje': str(e)
            })
    
    exitosos = sum(1 for r in resultados if r['exito'])
    logger.info(f"=== PUBLICACIÓN COMPLETADA: {exitosos}/{len(resultados)} exitosos ===")
    
    # Guardar registro de publicación
    registro = {
        'fecha': datetime.now(CUBA_TZ).isoformat(),
        'hora': hora_actual,
        'total': len(resultados),
        'exitosos': exitosos,
        'resultados': resultados
    }
    
    registros = []
    if os.path.exists(REGISTRO_FILE):
        with open(REGISTRO_FILE, 'r') as f:
            registros = json.load(f)
    registros.append(registro)
    registros = registros[-100:]
    os.makedirs(os.path.dirname(REGISTRO_FILE), exist_ok=True)
    with open(REGISTRO_FILE, 'w') as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)


# ==================== RUTAS DE LA API ====================

@app.route('/api/status', methods=['GET'])
def status():
    """Estado del servidor"""
    return jsonify({
        'status': 'online',
        'hora_cuba': datetime.now(CUBA_TZ).strftime('%Y-%m-%d %H:%M:%S'),
        'proxima_publicacion': obtener_proxima_publicacion()
    })


@app.route('/api/productos', methods=['GET'])
def get_productos():
    """Obtener todos los productos"""
    return jsonify(cargar_productos())


@app.route('/api/productos', methods=['POST'])
def save_productos():
    """Guardar productos desde el frontend"""
    data = request.json
    if isinstance(data, list):
        guardar_productos(data)
        return jsonify({'success': True, 'mensaje': f'{len(data)} productos guardados'})
    return jsonify({'success': False, 'error': 'Datos inválidos'}), 400


@app.route('/api/publicar-revolico', methods=['POST'])
def publicar_revolico():
    """Publicar un producto en Revolico"""
    producto = request.json
    if not producto:
        return jsonify({'success': False, 'error': 'No se recibió producto'}), 400
    
    logger.info(f"Publicando en Revolico: {producto.get('nombre', 'Sin nombre')}")
    
    try:
        resultado = social_agent.publicar_producto(producto)
        return jsonify(resultado)
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/publicar-facebook', methods=['POST'])
def publicar_facebook():
    """Publicar un producto en Facebook"""
    producto = request.json
    if not producto:
        return jsonify({'success': False, 'error': 'No se recibió producto'}), 400
    
    logger.info(f"Publicando en Facebook: {producto.get('nombre', 'Sin nombre')}")
    
    try:
        resultado = social_agent.publicar_facebook(producto)
        return jsonify(resultado)
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/publicar-todos', methods=['POST'])
def publicar_todos():
    """Publicar todos los productos en Revolico"""
    productos = cargar_productos()
    
    if not productos:
        return jsonify({'success': False, 'error': 'No hay productos para publicar'})
    
    # Ejecutar en hilo separado para no bloquear
    def publicar_async():
        publicacion_automatica()
    
    thread = threading.Thread(target=publicar_async)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'mensaje': f'Publicando {len(productos)} productos en segundo plano...'
    })


@app.route('/api/publicar-ahora', methods=['POST'])
def publicar_ahora():
    """Publicar todos los productos ahora mismo"""
    productos_data = request.json
    
    if productos_data and isinstance(productos_data, list):
        # Guardar los productos recibidos
        guardar_productos(productos_data)
    
    productos = cargar_productos()
    
    if not productos:
        return jsonify({'success': False, 'error': 'No hay productos para publicar'})
    
    resultados = []
    for producto in productos:
        try:
            resultado = social_agent.publicar_producto(producto)
            resultados.append({
                'producto': producto.get('nombre', 'Sin nombre'),
                'exito': resultado['success'],
                'mensaje': resultado.get('mensaje', ''),
                'url': resultado.get('url', '')
            })
            time.sleep(3)
        except Exception as e:
            resultados.append({
                'producto': producto.get('nombre', 'Sin nombre'),
                'exito': False,
                'mensaje': str(e)
            })
    
    exitosos = sum(1 for r in resultados if r['exito'])
    
    return jsonify({
        'success': True,
        'mensaje': f'Publicados {exitosos}/{len(resultados)} productos en Revolico',
        'resultados': resultados
    })


@app.route('/api/historial', methods=['GET'])
def historial():
    """Obtener historial de publicaciones"""
    if os.path.exists(REGISTRO_FILE):
        with open(REGISTRO_FILE, 'r') as f:
            return jsonify(json.load(f))
    return jsonify([])


@app.route('/api/importar-cookies-revolico', methods=['POST'])
def importar_cookies_revolico():
    data = request.json
    try:
        from revolico_agent import convertir_cookies_cookie_editor, guardar_cookies
        cookies = convertir_cookies_cookie_editor(data) if data and 'expirationDate' in data[0] else data
        guardar_cookies(cookies)
        return jsonify({'success': True, 'mensaje': 'Cookies de Revolico guardadas'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/importar-cookies-facebook', methods=['POST'])
def importar_cookies_facebook():
    data = request.json
    try:
        from revolico_agent import convertir_cookies_cookie_editor
        cookies = convertir_cookies_cookie_editor(data) if data and 'expirationDate' in data[0] else data
        with open(FACEBOOK_COOKIES_FILE, 'w') as f:
            json.dump(cookies, f, indent=2)
        return jsonify({'success': True, 'mensaje': 'Cookies de Facebook guardadas'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Obtener los últimos logs"""
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'r') as f:
            lines = f.readlines()
            return jsonify({'logs': lines[-50:]})  # Últimas 50 líneas
    return jsonify({'logs': []})


def obtener_proxima_publicacion():
    """Obtener la próxima publicación programada"""
    jobs = scheduler.get_jobs()
    if jobs:
        next_run = min(job.next_run_time for job in jobs if job.next_run_time)
        return next_run.strftime('%Y-%m-%d %H:%M:%S %Z') if next_run else None
    return None


def iniciar_scheduler():
    """Iniciar el scheduler de publicaciones automáticas"""
    # Publicar a las 8:00 AM hora de Cuba
    scheduler.add_job(
        publicacion_automatica,
        CronTrigger(hour=8, minute=0, timezone=CUBA_TZ),
        id='publicacion_manana',
        name='Publicación de la mañana (8:00 AM)',
        replace_existing=True
    )
    
    # Publicar a las 5:00 PM hora de Cuba
    scheduler.add_job(
        publicacion_automatica,
        CronTrigger(hour=17, minute=0, timezone=CUBA_TZ),
        id='publicacion_tarde',
        name='Publicación de la tarde (5:00 PM)',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("✅ Scheduler iniciado - Publicaciones programadas a las 8:00 AM y 5:00 PM (hora Cuba)")


if __name__ == '__main__':
    print("\n" + "="*40)
    print("🚀 INICIANDO BACKEND TIENDAMAX")
    print("="*40)
    
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Verificación de dependencias críticas
    try:
        import playwright
        print("✅ Playwright: Detectado")
    except ImportError:
        print("❌ ERROR: Playwright no instalado. Ejecuta 'bash setup.sh'")
        
    try:
        import flask_cors
        print("✅ Flask-CORS: Detectado")
    except ImportError:
        print("❌ ERROR: Flask-CORS no instalado. Ejecuta 'bash setup.sh'")

    iniciar_scheduler()
    print("✅ Publicación automática: Programada (8AM y 5PM Cuba)")
    print("📡 Servidor: Escuchando en puerto 5002")
    print("="*40 + "\n")
    
    app.run(host='0.0.0.0', port=5002, debug=False)
