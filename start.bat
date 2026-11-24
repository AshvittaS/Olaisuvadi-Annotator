@echo off
REM One-click launcher for the Palm-Leaf Annotator (Windows).
REM First run: creates .venv and installs requirements. Later runs: just starts the tool.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Setting up for the first time - this can take several minutes...
    python -m venv .venv || (echo Python not found. Install Python 3.10+ from python.org & pause & exit /b 1)
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt || (echo Install failed. & pause & exit /b 1)
)

echo.
echo  Palm-Leaf Annotator is starting...
echo  Open http://127.0.0.1:8000 in your browser.
echo  Press Ctrl+C in this window to stop.
echo.
start "" /min cmd /c "timeout /t 4 >nul & start http://127.0.0.1:8000"
".venv\Scripts\python.exe" -m uvicorn app:app
pause
