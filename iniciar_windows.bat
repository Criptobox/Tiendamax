@echo off
title Bot TiendaMax - Activo
echo ==========================================
echo   🚀 INICIANDO BOT DE TIENDAMAX (WINDOWS)
echo ==========================================
echo.

:: Verificar si Python está instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERROR: Python no esta instalado.
    pause
    exit
)

echo ⚙️  Iniciando Backend en puerto 5002...
echo ⚠️  NO CIERRES ESTA VENTANA mientras uses el bot.
echo.

cd backend
python app.py

pause
