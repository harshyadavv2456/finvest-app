# FinSight - Complete Startup Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   FinSight Stock Screener" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Check if backend dependencies are installed
Write-Host "Checking backend dependencies..." -ForegroundColor Yellow
$backendDir = Join-Path $scriptDir "backend"
if (Test-Path $backendDir) {
    Set-Location $backendDir
    $depsCheck = python -c "import fastapi, uvicorn, pandas, groq" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
        pip install -r requirements.txt --quiet
        Write-Host "Backend dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "Backend dependencies OK" -ForegroundColor Green
    }
}

# Start Backend
Write-Host ""
Write-Host "Starting Backend Server..." -ForegroundColor Cyan
$backendScript = "cd '$backendDir'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript
Write-Host "Backend starting on http://127.0.0.1:8000" -ForegroundColor Green

# Wait for backend to be ready
Write-Host "Waiting for backend to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Check if backend is ready
$backendReady = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        $backendReady = $true
        Write-Host "Backend is ready!" -ForegroundColor Green
        break
    } catch {
        Write-Host "  Attempt $i/10..." -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if (-not $backendReady) {
    Write-Host "Backend may still be starting. Check the backend window." -ForegroundColor Yellow
}

# Start Frontend
Write-Host ""
Write-Host "Starting Frontend Server..." -ForegroundColor Cyan
$frontendDir = Join-Path $scriptDir "frontend"
if (Test-Path $frontendDir) {
    Set-Location $frontendDir
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
        npm install --silent
    }
    $frontendScript = "cd '$frontendDir'; npm run dev"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript
    Write-Host "Frontend starting on http://localhost:5173" -ForegroundColor Green
}

# Wait a bit for frontend
Start-Sleep -Seconds 5

# Open browser
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Application Ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor White
Write-Host "Frontend: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "Servers are running in separate windows." -ForegroundColor Gray
Write-Host "Close those windows to stop the servers." -ForegroundColor Gray
