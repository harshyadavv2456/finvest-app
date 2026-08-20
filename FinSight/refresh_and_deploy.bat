@echo off
REM ================================================================
REM FinVest: SINGLE Refresh + Deploy Pipeline
REM ================================================================
REM Run this ONE file to:
REM   1. Daily Refresh Orchestrator (market data, screener, FII/DII,
REM      insider flow, announcements, StrataX, Mnemos, intelligence,
REM      timeline, positions, audit)
REM   2. Build frontend
REM   3. Git add + commit + push (triggers Vercel + Render deploy)
REM
REM Location: D:\FinVest2\FinSight\refresh_and_deploy.bat
REM ================================================================

echo.
echo ========================================================
echo  FinVest: Full Refresh + Deploy Pipeline
echo  %date% %time%
echo ========================================================
echo.

cd /d "%~dp0"

REM Activate venv if exists
if exist "backend\venv\Scripts\activate.bat" (
    call backend\venv\Scripts\activate.bat
)

REM Step 1: Run the full orchestrator
REM Runs ALL modules: market_data, insider_flow, fii_dii, stratax,
REM announcements, finax, mnemos, mnemos2_sync, screener, intelligence,
REM intelligence_archive, timeline, positions, pipeline_audit
echo.
echo [1/3] Running Daily Refresh Orchestrator...
echo --------------------------------------------------------
python daily_refresh_orchestrator.py
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Orchestrator had failures - check state\refresh_registry.json
)

REM Step 2: Build InsiderFlow signals from freshly updated raw data
echo.
echo [2/4] Building InsiderFlow signals...
echo --------------------------------------------------------
cd /d "%~dp0InsiderFlow"
python build_signals.py
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] build_signals.py had failures - signals may be stale
) else (
    echo [OK] InsiderFlow signals built successfully.
)
cd /d "%~dp0"

REM Step 3: Build frontend
echo.
echo [3/4] Building Frontend...
echo --------------------------------------------------------
cd frontend
call npm run build
cd ..

REM Step 4: Git commit and push
echo.
echo [4/4] Git: Stage + Commit + Push...
echo --------------------------------------------------------
cd /d "%~dp0.."
git add -A
git commit -m "data: Daily refresh %date% - all modules updated"
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git push failed. Check your connection.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo  DONE - All data refreshed and deployed!
echo ========================================================
echo  - Vercel rebuilds frontend at finvest.fintaxlife.com
echo  - Render rebuilds backend API
echo ========================================================
echo.
pause
