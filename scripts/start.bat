@echo off
echo ========================================
echo   AI Radio - Claudio FM
echo ========================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.11+
    pause
    exit /b 1
)

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

echo [1/3] Installing backend dependencies...
cd /d "%~dp0..\backend"
pip install -r requirements.txt -q
if %errorlevel% neq 0 (
    echo [WARN] pip install had issues, continuing...
)

echo [2/3] Installing frontend dependencies...
cd /d "%~dp0..\frontend"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)

echo [3/3] Starting servers...
echo.
echo Starting backend on http://localhost:8000 ...
start "AI Radio Backend" cmd /c "cd /d "%~dp0..\backend" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo Starting frontend on http://localhost:5173 ...
start "AI Radio Frontend" cmd /c "cd /d "%~dp0..\frontend" && npm run dev"

echo.
echo ========================================
echo   AI Radio is starting!
echo   Open http://localhost:5173 in browser
echo ========================================
pause
