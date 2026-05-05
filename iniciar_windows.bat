@echo off
title Bot TiendaMax - Activo
echo ==========================================
echo   🚀 INICIANDO BOT DE TIENDAMAX (WINDOWS)
echo ==========================================
echo.

:: Intentar encontrar Python
set "PY_CMD=python"
python --version >nul 2>&1
if %errorlevel% neq 0 (
    set "PY_CMD=py"
    py --version >nul 2>&1
    if %errorlevel% neq 0 (
        set "PY_CMD=%USERPROFILE%\AppData\Local\Microsoft\WindowsApps\python.exe"
    )
)

echo ⚙️  Iniciando Backend en puerto 5002...
echo ⚠️  NO CIERRES ESTA VENTANA mientras uses el bot.
echo.

cd backend
%PY_CMD% app.py

echo.
echo ❌ El bot se ha detenido. Revisa los mensajes de arriba.
pause
