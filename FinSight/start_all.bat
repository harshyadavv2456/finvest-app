@echo off
echo ========================================
echo FinSight - Complete Startup Script
echo ========================================
echo.
echo This script will start both backend and frontend.
echo Backend must start first, then frontend.
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul

echo.
echo ========================================
echo STEP 1: Starting Backend Server
echo ========================================
echo.

start "FinSight Backend" cmd /k "start_backend.bat"

echo Waiting for backend to initialize (10 seconds)...
timeout /t 10 /nobreak >nul

echo.
echo ========================================
echo STEP 2: Starting Frontend Server
echo ========================================
echo.

start "FinSight Frontend" cmd /k "start_frontend.bat"

echo.
echo ========================================
echo Both servers are starting!
echo ========================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Two new windows have opened - one for backend, one for frontend.
echo Close those windows to stop the servers.
echo.
echo Press any key to exit this window...
pause >nul

