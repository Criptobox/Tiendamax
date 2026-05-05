@echo off
title Instalador TiendaMax - Windows
echo ==========================================
echo   🚀 INSTALADOR DE TIENDAMAX PARA WINDOWS
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
        "%USERPROFILE%\AppData\Local\Microsoft\WindowsApps\python.exe" --version >nul 2>&1
        if %errorlevel% neq 0 (
            echo ❌ ERROR: No se encuentra Python.
            echo.
            echo 👉 PASO A SEGUIR:
            echo 1. Abre la "Microsoft Store" en tu Windows.
            echo 2. Busca "Python 3.11" e instalalo.
            echo 3. Una vez instalado, vuelve a abrir este archivo.
            echo.
            pause
            exit
        )
    )
)

echo ✅ Python detectado: %PY_CMD%
echo.
echo 📦 Instalando librerias necesarias (esto puede tardar)...
%PY_CMD% -m pip install --upgrade pip
%PY_CMD% -m pip install flask flask-cors apscheduler playwright requests pytz

echo 🌐 Configurando navegador para el bot...
%PY_CMD% -m playwright install chromium

echo.
echo ==========================================
echo ✅ CONFIGURACION COMPLETADA CON EXITO
echo 👉 Ya puedes cerrar esta ventana.
echo 👉 Ahora abre el archivo "iniciar_windows.bat"
echo ==========================================
echo.
pause
