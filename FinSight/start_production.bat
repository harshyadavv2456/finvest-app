@echo off
echo ========================================
echo FinVest Production Server v3.0
echo ========================================
echo.

echo [1/4] Starting Backend (production mode)...
start "FinVest Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate 2>nul && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"

echo Waiting for backend to start...
timeout /t 5 /nobreak >nul

echo [2/4] Building Frontend...
cd /d %~dp0frontend
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed! Falling back to dev server.
    start "FinVest Frontend" cmd /k "cd /d %~dp0frontend && call npm run dev"
    goto :done
)

echo [3/4] Serving Frontend (production build)...
start "FinVest Frontend" cmd /k "cd /d %~dp0frontend && npx serve -s dist -l 5173"

:done
echo.
echo [4/4] All services started.
echo ========================================
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo ========================================
echo.
echo Close the terminal windows to stop services.
echo.
timeout /t 3 /nobreak >nul
start http://localhost:5173
