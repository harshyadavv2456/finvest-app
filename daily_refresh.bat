@echo off
REM ================================================================
REM FinVest: Daily Data Refresh (delegates to FinSight orchestrator)
REM ================================================================
REM This is a convenience shortcut. The real pipeline is:
REM   D:\FinVest2\FinSight\refresh_and_deploy.bat
REM
REM That BAT file runs the orchestrator which handles ALL modules:
REM   market_data, insider_flow, fii_dii, stratax, announcements,
REM   finax, mnemos, screener, intelligence, timeline, positions
REM ================================================================

echo.
echo ========================================
echo   FinVest Daily Refresh
echo   Delegating to FinSight orchestrator...
echo ========================================
echo.

cd /d "%~dp0FinSight"
call refresh_and_deploy.bat

echo.
echo ========================================
echo   Rebuilding InsiderFlow signals...
echo ========================================
echo.
cd /d "%~dp0FinSight\InsiderFlow"
python build_signals.py
if %errorlevel% neq 0 (
    echo [ERROR] build_signals.py failed with error %errorlevel%
) else (
    echo [OK] Signals rebuilt successfully.
)
cd /d "%~dp0FinSight"
