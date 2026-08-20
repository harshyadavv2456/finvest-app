# Start both backend and frontend
Write-Host "Starting FinSight Application..." -ForegroundColor Green
Write-Host ""

# Start backend in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

# Wait a bit for backend to start
Start-Sleep -Seconds 3

# Start frontend in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev"

Write-Host "✓ Backend starting on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "✓ Frontend starting on http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Both services are starting in separate windows." -ForegroundColor Yellow
Write-Host "Wait for 'Application startup complete' message before using." -ForegroundColor Yellow

