@echo off
echo ========================================
echo Starting FinSight Frontend...
echo ========================================
echo.

cd frontend
if %errorlevel% neq 0 (
    echo ERROR: Failed to change to frontend directory
    pause
    exit /b 1
)

echo [1/3] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

echo [2/3] Checking dependencies...
if not exist node_modules (
    echo Installing dependencies (this may take a minute)...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed
)

echo.
echo [3/3] Starting Vite dev server...
echo ========================================
echo Frontend will be available at: http://localhost:5173
echo ========================================
echo.
echo NOTE: Make sure the backend is running on http://localhost:8000
echo       If you see proxy errors, the backend may not be ready yet.
echo.
call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Frontend server failed to start
    pause
    exit /b 1
)

