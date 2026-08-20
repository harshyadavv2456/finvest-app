# PowerShell script to set up GitHub repository for FinSight
# Run this script to initialize git and prepare for GitHub push

Write-Host "`n🚀 Setting up GitHub repository for FinSight" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

# Check if git is installed
try {
    $gitVersion = git --version
    Write-Host "✅ Git is installed: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git is not installed. Please install Git first." -ForegroundColor Red
    Write-Host "Download from: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# Initialize git if not already initialized
if (-not (Test-Path ".git")) {
    Write-Host "`n📦 Initializing git repository..." -ForegroundColor Yellow
    git init
    Write-Host "✅ Git repository initialized" -ForegroundColor Green
} else {
    Write-Host "`n✅ Git repository already exists" -ForegroundColor Green
}

# Add all files
Write-Host "`n📝 Adding files to git..." -ForegroundColor Yellow
git add .
Write-Host "✅ Files added" -ForegroundColor Green

# Check if there are changes to commit
$status = git status --porcelain
if ($status) {
    Write-Host "`n💾 Committing changes..." -ForegroundColor Yellow
    git commit -m "Initial commit - Ready for deployment"
    Write-Host "✅ Changes committed" -ForegroundColor Green
} else {
    Write-Host "`n✅ No changes to commit" -ForegroundColor Green
}

# Check if remote exists
$remoteOutput = git remote -v 2>&1
$hasRemote = $false
if ($remoteOutput -notmatch "fatal") {
    $hasRemote = $true
    Write-Host "`n✅ Remote repository already configured" -ForegroundColor Green
    Write-Host "Current remotes:" -ForegroundColor Cyan
    git remote -v
}

if (-not $hasRemote) {
    Write-Host "`n📋 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Go to https://github.com/new" -ForegroundColor White
    Write-Host "2. Repository name: FinSight" -ForegroundColor White
    Write-Host "3. Make it Private (recommended)" -ForegroundColor White
    Write-Host "4. Click 'Create repository'" -ForegroundColor White
    Write-Host "5. Copy the repository URL" -ForegroundColor White
    Write-Host "`n6. Then run these commands:" -ForegroundColor Yellow
    Write-Host "   git branch -M main" -ForegroundColor White
    Write-Host "   git remote add origin https://github.com/harshyadavv2456/FinSight.git" -ForegroundColor White
    Write-Host "   git push -u origin main" -ForegroundColor White
}

Write-Host "`n" -NoNewline
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "✅ Setup complete! Follow the steps above to push to GitHub." -ForegroundColor Green
Write-Host "`n📖 Then read DEPLOY_FOR_ME.md for deployment instructions" -ForegroundColor Yellow
