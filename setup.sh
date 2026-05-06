#!/bash
echo "🚀 Iniciando configuración de TiendaMax Bot..."

# 1. Instalar dependencias de Python
echo "📦 Instalando librerías necesarias..."
sudo pip3 install flask flask-cors apscheduler playwright requests

# 2. Instalar navegadores de Playwright
echo "🌐 Configurando navegador para el bot..."
python3 -m playwright install chromium
sudo python3 -m playwright install-deps

# 3. Crear carpetas necesarias
mkdir -p backend/data

# 4. Dar permisos
chmod +x iniciar.sh detener.sh

echo "✅ ¡Configuración completada!"
echo "Para iniciar el bot ahora, escribe: bash iniciar.sh"
