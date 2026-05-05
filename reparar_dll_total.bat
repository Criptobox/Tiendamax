@echo off
TITLE Reparador de DLL y Componentes - TiendaMax
color 0C

echo ======================================================
echo    REPARADOR DE COMPONENTES DE WINDOWS
echo ======================================================
echo.
echo El error de DLL ocurre porque te faltan componentes de 
echo Microsoft o tu version de Python (3.14) es inestable.
echo.

:: 1. Abrir descarga de Visual C++
echo [+] Abriendo descarga de Microsoft Visual C++...
echo (Este componente es NECESARIO para que las DLL funcionen)
start https://aka.ms/vs/17/release/vc_redist.x64.exe

echo.
echo ------------------------------------------------------
echo ⚠️ PASO MUY IMPORTANTE:
echo ------------------------------------------------------
echo Tu version de Python 3.14 es muy nueva y causa errores.
echo Te recomendamos instalar la version 3.12 que es ESTABLE.
echo.
echo [+] Abriendo descarga de Python 3.12...
start https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe

echo.
echo ------------------------------------------------------
echo INSTRUCCIONES:
echo 1. Instala el archivo de Microsoft que se esta bajando.
echo 2. Desinstala Python 3.14 e instala Python 3.12 (marca la casilla PATH).
echo 3. Una vez hecho esto, usa 'instalador_windows.bat' de nuevo.
echo ------------------------------------------------------
echo.
pause
