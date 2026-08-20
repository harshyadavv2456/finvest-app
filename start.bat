@echo off
echo ============================================
echo         FINVEST - Financial OS
echo ============================================
echo.
echo Starting unified system...
echo - Backend: http://localhost:8001
echo - Frontend: http://localhost:5174
echo.

REM Start backend in new window
start "FinVest Backend" cmd /k "cd /d %~dp0FinSight\backend && echo Starting FinVest Backend... && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001"

REM Wait a moment
timeout /t 5 /nobreak > nul

REM Start frontend in new window
start "FinVest Frontend" cmd /k "cd /d %~dp0FinSight\frontend && echo Starting FinVest Frontend... && npm run dev"

REM Wait and open browser
timeout /t 3 /nobreak > nul
start http://localhost:5174

echo.
echo ============================================
echo FinVest is starting!
echo.
echo Access the application at:
echo   http://localhost:5174
echo.
echo Authority Status:
echo   FinSight = Intelligence Engine (LOCKED)
echo   FinDash  = Market Data Engine (LOCKED)
echo   Execution = DISABLED
echo ============================================
pause

