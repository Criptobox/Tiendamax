@echo off
title Reparador de Errores TiendaMax
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
echo 📦 Reinstalando componentes criticos...
%PY_CMD% -m pip uninstall greenlet playwright -y
%PY_CMD% -m pip install --upgrade pip
%PY_CMD% -m pip install greenlet==3.0.1 playwright==1.40.0

echo.
echo 🌐 Reconfigurando navegador...
%PY_CMD% -m playwright install chromium

echo.
echo ==========================================
echo ✅ REPARACION COMPLETADA
echo 👉 Intenta abrir de nuevo "iniciar_windows.bat"
echo ==========================================
pause
