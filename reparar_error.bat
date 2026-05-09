@echo off
title Reparador Definitivo TiendaMax
echo ==========================================
echo   🛠️ REPARANDO ERROR DE LIBRERIAS (DLL)
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

echo 🔍 Usando: %PY_CMD%
echo.
echo 📦 Paso 1: Limpiando instalaciones previas...
%PY_CMD% -m pip uninstall greenlet playwright -y

echo.
echo 📦 Paso 2: Instalando versiones compatibles...
:: Forzamos la instalación de greenlet sin usar la cache para evitar archivos corruptos
%PY_CMD% -m pip install --upgrade pip
%PY_CMD% -m pip install --no-cache-dir greenlet==3.0.3 playwright==1.42.0

echo.
echo 🌐 Paso 3: Reconfigurando navegador...
%PY_CMD% -m playwright install chromium

echo.
echo ==========================================
echo ✅ REPARACION COMPLETADA
echo 👉 Ahora intenta abrir "iniciar_windows.bat"
echo ==========================================
pause
