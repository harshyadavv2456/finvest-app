# FinVest Unified Startup Script
# Starts the unified FinSight+FinDash system

Write-Host "============================================" -ForegroundColor Green
Write-Host "        FINVEST - Financial OS" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Starting unified system..." -ForegroundColor Cyan
Write-Host "- Backend: http://localhost:8001" -ForegroundColor Yellow
Write-Host "- Frontend: http://localhost:5174" -ForegroundColor Yellow
Write-Host ""

# Start backend in new terminal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\FinSight\backend'; Write-Host 'Starting FinVest Backend...' -ForegroundColor Green; python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001"

# Wait for backend to start
Write-Host "Waiting for backend to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Start frontend in new terminal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\FinSight\frontend'; Write-Host 'Starting FinVest Frontend...' -ForegroundColor Green; npm run dev"

# Wait a moment then open browser
Start-Sleep -Seconds 3
Start-Process "http://localhost:5174"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "FinVest is starting!" -ForegroundColor Green
Write-Host ""
Write-Host "Access the application at:" -ForegroundColor Cyan
Write-Host "  http://localhost:5174" -ForegroundColor Yellow
Write-Host ""
Write-Host "Authority Status:" -ForegroundColor Cyan
Write-Host "  FinSight = Intelligence Engine (LOCKED)" -ForegroundColor Yellow
Write-Host "  FinDash  = Market Data Engine (LOCKED)" -ForegroundColor Yellow
Write-Host "  Execution = DISABLED" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Green

