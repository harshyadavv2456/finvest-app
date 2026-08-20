# Script to push code to GitHub
# Make sure you've created the repository on GitHub first!

Write-Host "`n🚀 Pushing FinSight to GitHub" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

# Check if remote exists
$remoteCheck = git remote -v 2>&1
if ($remoteCheck -match "fatal") {
    Write-Host "`n📋 Setting up remote repository..." -ForegroundColor Yellow
    
    # Add remote
    git remote add origin https://github.com/harshyadavv2456/FinSight.git
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Remote added" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to add remote. Make sure you created the repo on GitHub first!" -ForegroundColor Red
        Write-Host "`nGo to: https://github.com/new" -ForegroundColor Yellow
        Write-Host "Create repo: FinSight" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "✅ Remote already configured" -ForegroundColor Green
    git remote -v
}

# Push to GitHub
Write-Host "`n📤 Pushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Deploy frontend to Vercel (see DEPLOY_AUTOMATED.md)" -ForegroundColor White
    Write-Host "2. Deploy backend to Railway (see DEPLOY_AUTOMATED.md)" -ForegroundColor White
} else {
    Write-Host "`n❌ Push failed. Common issues:" -ForegroundColor Red
    Write-Host "- Repository doesn't exist on GitHub (create it first)" -ForegroundColor Yellow
    Write-Host "- Authentication required (GitHub will prompt you)" -ForegroundColor Yellow
    Write-Host "- Check your internet connection" -ForegroundColor Yellow
}

