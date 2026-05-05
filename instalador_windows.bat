@echo off
title Instalador TiendaMax - Windows
echo ==========================================
echo   🚀 INSTALADOR DE TIENDAMAX PARA WINDOWS
echo ==========================================
echo.

:: Verificar si Python está instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Python no esta instalado en tu computadora.
    echo 👉 Por favor, ve a https://www.python.org y descarga e instala Python.
    echo ⚠️  ASEGURATE de marcar la casilla "Add Python to PATH" durante la instalacion.
    pause
    exit
)

echo 📦 Instalando librerias necesarias...
python -m pip install --upgrade pip
python -m pip install flask flask-cors apscheduler playwright requests pytz

echo 🌐 Configurando navegador para el bot...
python -m playwright install chromium

echo.
echo ✅ CONFIGURACION COMPLETADA CON EXITO
echo 👉 Ahora puedes cerrar esta ventana y ejecutar "iniciar_windows.bat"
echo.
pause
