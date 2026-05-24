@echo off
chcp 65001 >nul
title AI Radio - Claudio FM

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   🎵 AI Radio — Claudio FM          ║
echo  ║   启动中...                         ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ── 1. Backend (auto-starts NetEase sidecar) ──
echo [1/2] 启动后端服务 + 网易云侧车...
start "AI Radio - Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
echo        后端: http://localhost:8000

:: Wait for backend to start
echo        等待后端就绪...
:wait_backend
timeout /t 2 /nobreak >nul
curl -s http://localhost:8000/api/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo        后端已就绪 ✓

:: ── 2. Frontend ──
echo [2/2] 启动前端界面...
start "AI Radio - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo        前端: http://localhost:5173

:: Wait for frontend to start
echo        等待前端就绪...
:wait_frontend
timeout /t 2 /nobreak >nul
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 goto wait_frontend
echo        前端已就绪 ✓

:: ── 3. Open browser ──
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   全部就绪，打开浏览器...            ║
echo  ╚══════════════════════════════════════╝
start http://localhost:5173

echo.
echo  按任意键关闭此窗口（不影响服务运行）
pause >nul
