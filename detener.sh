#!/bin/bash
# ===== TiendaMax - Script de Detención =====

echo "⏹️  Deteniendo TiendaMax..."

PROYECTO_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROYECTO_DIR/backend"

# Detener por PID si existe
if [ -f "$BACKEND_DIR/backend.pid" ]; then
    kill $(cat "$BACKEND_DIR/backend.pid") 2>/dev/null && echo "✅ Backend detenido"
    rm "$BACKEND_DIR/backend.pid"
fi

if [ -f "$PROYECTO_DIR/web.pid" ]; then
    kill $(cat "$PROYECTO_DIR/web.pid") 2>/dev/null && echo "✅ Servidor web detenido"
    rm "$PROYECTO_DIR/web.pid"
fi

echo "✅ TiendaMax detenido"
