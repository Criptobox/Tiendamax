#!/bin/bash
# ===== TiendaMax - Script de Inicio =====
# Inicia el servidor web y el backend de publicación automática

echo "🚀 Iniciando TiendaMax..."
echo "================================"

# Directorio del proyecto
PROYECTO_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROYECTO_DIR/backend"

# Crear directorio de datos si no existe
mkdir -p "$BACKEND_DIR/data"

# Instalar dependencias si no están instaladas
echo "📦 Verificando dependencias..."
pip3 install flask flask-cors apscheduler pytz playwright -q 2>/dev/null
python3 -m playwright install chromium -q 2>/dev/null

# Detener procesos anteriores
echo "🔄 Deteniendo procesos anteriores..."
pkill -f "python3 app.py" 2>/dev/null || true
pkill -f "python3 -m http.server 8000" 2>/dev/null || true
sleep 2

# Iniciar backend (puerto 5002)
echo "⚙️  Iniciando backend de publicación automática (puerto 5002)..."
cd "$BACKEND_DIR"
nohup python3 app.py > "$BACKEND_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Esperar que el backend inicie
sleep 3

# Verificar backend
if curl -s http://localhost:5002/api/status > /dev/null 2>&1; then
    echo "   ✅ Backend activo en puerto 5002"
else
    echo "   ⚠️  Backend iniciando... (puede tardar unos segundos)"
fi

# Iniciar servidor web (puerto 8000)
echo "🌐 Iniciando servidor web (puerto 8000)..."
cd "$PROYECTO_DIR"
nohup python3 -m http.server 8000 > "$PROYECTO_DIR/web.log" 2>&1 &
WEB_PID=$!
echo "   Servidor web PID: $WEB_PID"

sleep 2

# Verificar servidor web
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/ | grep -q "200"; then
    echo "   ✅ Servidor web activo en puerto 8000"
else
    echo "   ⚠️  Servidor web iniciando..."
fi

echo ""
echo "================================"
echo "✅ TiendaMax iniciado correctamente"
echo ""
echo "📌 Accesos:"
echo "   🌐 Tienda web:  http://localhost:8000"
echo "   ⚙️  Backend API: http://localhost:5002/api/status"
echo ""
echo "📅 Publicaciones automáticas en Revolico:"
echo "   ⏰ 8:00 AM (hora Cuba)"
echo "   ⏰ 5:00 PM (hora Cuba)"
echo ""
echo "📋 Logs:"
echo "   Backend: $BACKEND_DIR/backend.log"
echo "   Web:     $PROYECTO_DIR/web.log"
echo "================================"

# Guardar PIDs
echo "$BACKEND_PID" > "$BACKEND_DIR/backend.pid"
echo "$WEB_PID" > "$PROYECTO_DIR/web.pid"
