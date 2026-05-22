@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_CMD=python"
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
)

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8787'"

echo MD Manager starting...
echo Browser URL: http://127.0.0.1:8787
echo.
echo Keep this window open while using MD Manager.
echo Press Ctrl+C to stop the server.
echo.

"%PYTHON_CMD%" run_server.py

echo.
echo MD Manager stopped.
pause
