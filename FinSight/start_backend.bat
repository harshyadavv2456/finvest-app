@echo off
echo ========================================
echo Starting FinSight Backend...
echo ========================================
echo.

cd backend
if %errorlevel% neq 0 (
    echo ERROR: Failed to change to backend directory
    pause
    exit /b 1
)

echo [1/5] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    pause
    exit /b 1
)

echo [2/5] Setting up virtual environment...
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
) else (
    echo Virtual environment already exists
)

call venv\Scripts\activate
if %errorlevel% neq 0 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)

echo [3/5] Installing/updating dependencies...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo [4/5] Checking screener snapshot...
if exist "..\data\screener.parquet" (
    echo Screener snapshot already exists, skipping build...
) else (
    echo Building screener snapshot (this may take a few minutes)...
    python -m app.screener_snapshot
    if %errorlevel% neq 0 (
        echo WARNING: Screener snapshot build failed, but continuing...
    ) else (
        echo Screener snapshot built successfully!
    )
)

echo.
echo [5/5] Starting FastAPI server...
echo ========================================
echo Backend will be available at: http://localhost:8000
echo API docs will be at: http://localhost:8000/docs
echo ========================================
echo.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Backend server failed to start
    pause
    exit /b 1
)

