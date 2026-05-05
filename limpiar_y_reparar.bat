@echo off
TITLE Reparador de Emergencia - TiendaMax
color 0B

echo ======================================================
echo    REPARADOR DE CONFLICTOS DE PYTHON (TiendaMax)
echo ======================================================
echo.
echo Se ha detectado una nueva instalacion de Python. 
echo Vamos a limpiar y reconfigurar todo para que funcione.
echo.

:: 1. Intentar encontrar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python no se encuentra en el PATH todavia.
    echo Intentando buscarlo manualmente...
    set "PYTHON_EXE=python"
) else (
    set "PYTHON_EXE=python"
)

:: 2. Limpiar archivos temporales de Python
echo [+] Limpiando archivos temporales...
if exist "backend\__pycache__" rd /s /q "backend\__pycache__"
if exist "__pycache__" rd /s /q "__pycache__"

:: 3. Reinstalar librerias base
echo [+] Reinstalando librerias necesarias (esto puede tardar)...
%PYTHON_EXE% -m pip install --upgrade pip
%PYTHON_EXE% -m pip install flask flask-cors playwright greenlet apscheduler requests

:: 4. Forzar reparacion de Playwright
echo [+] Configurando navegador interno...
%PYTHON_EXE% -m playwright install chromium

:: 5. Verificar error de DLL greenlet especifico
echo [+] Aplicando parche de compatibilidad...
%PYTHON_EXE% -m pip install --force-reinstall greenlet==3.0.1

echo.
echo ======================================================
echo    ✅ PROCESO COMPLETADO
echo ======================================================
echo.
echo Ahora intenta abrir: iniciar_windows.bat
echo.
pause
