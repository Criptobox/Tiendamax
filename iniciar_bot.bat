@echo off
TITLE TiendaMax Bot - Publicador
color 0A

echo.
echo ╔══════════════════════════════════════════╗
echo ║        BOT TIENDAMAX v3.0                ║
echo ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0backend"

REM Instalar dependencias si faltan
echo Verificando dependencias...
pip install selenium schedule requests --quiet
echo Listo.
echo.

REM Iniciar bot
python revolico_agent.py

echo.
echo El bot se detuvo.
pause
