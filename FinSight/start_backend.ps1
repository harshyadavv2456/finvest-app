# Start FinSight Backend
Write-Host "Starting FinSight Backend..." -ForegroundColor Cyan
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

