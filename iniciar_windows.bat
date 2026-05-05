@echo off
TITLE Servidor TiendaMax - Modo Ligero
color 0B

echo ======================================================
echo    SERVIDOR TIENDAMAX (MODO LIGERO)
echo ======================================================
echo.
echo Iniciando el motor del bot...
echo.

:: Intentar encontrar Python
set "PY_CMD=python"
python --version >nul 2>&1
if %errorlevel% neq 0 (
    set "PY_CMD=py"
)

cd backend
%PY_CMD% app.py

if %errorlevel% neq 0 (
    echo.
    echo [!] ERROR: El servidor se detuvo.
    echo Asegurate de haber corrido 'instalar_librerias.bat' primero.
    pause
)
