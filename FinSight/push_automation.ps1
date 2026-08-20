# ============================================================================
# FinSight Automation Push Script
# ============================================================================
# This script pushes the automation files to GitHub.
# Run this once to enable automated data updates.
# ============================================================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      FINSIGHT AUTOMATION - PUSH TO GITHUB                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Navigate to project root
Set-Location $PSScriptRoot

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "ERROR: Not a git repository!" -ForegroundColor Red
    Write-Host "Please initialize git first: git init" -ForegroundColor Yellow
    exit 1
}

# Show what files will be added
Write-Host "📁 Files to be pushed:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  .github/workflows/auto-update-data.yml  (GitHub Actions workflow)" -ForegroundColor White
Write-Host "  scripts/automation_runner.py            (Automation helper script)" -ForegroundColor White
Write-Host "  backend/scripts/fetch_stratax_data.py   (Updated StrataX fetcher)" -ForegroundColor White
Write-Host "  AUTOMATION_SETUP.md                     (Documentation)" -ForegroundColor White
Write-Host ""

# Confirm
Write-Host "This will enable automated data updates every 30 minutes during market hours." -ForegroundColor Green
Write-Host ""
$confirm = Read-Host "Continue? (y/n)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "📤 Adding files to git..." -ForegroundColor Cyan

# Add automation files
git add ".github/workflows/auto-update-data.yml"
git add "scripts/automation_runner.py"
git add "backend/scripts/fetch_stratax_data.py"
git add "AUTOMATION_SETUP.md"
git add "push_automation.ps1"

# Check status
Write-Host ""
Write-Host "📋 Git status:" -ForegroundColor Cyan
git status --short

# Commit
Write-Host ""
Write-Host "💾 Committing changes..." -ForegroundColor Cyan
git commit -m "🤖 Add GitHub Actions automation for data updates

- Add auto-update-data.yml workflow (runs every 30 min during market hours)
- Add automation_runner.py unified script
- Update fetch_stratax_data.py with --all and --quiet flags
- Add AUTOMATION_SETUP.md documentation

This enables fully automated:
- Stock data updates (screener)
- Option chain updates (StrataX)
- Auto-deploy to Render and Vercel"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "⚠️ Nothing to commit or commit failed." -ForegroundColor Yellow
    Write-Host "Files may already be committed. Attempting push anyway..." -ForegroundColor Yellow
}

# Push
Write-Host ""
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                    ✅ SUCCESS!                              ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "Automation files have been pushed to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Go to your GitHub repository" -ForegroundColor White
    Write-Host "  2. Click 'Actions' tab" -ForegroundColor White
    Write-Host "  3. You should see 'FinSight Auto Data Update' workflow" -ForegroundColor White
    Write-Host "  4. Click 'Run workflow' to test manually" -ForegroundColor White
    Write-Host ""
    Write-Host "🕐 The workflow will run automatically:" -ForegroundColor Cyan
    Write-Host "  - Every 30 minutes during market hours (9:15 AM - 4:00 PM IST)" -ForegroundColor White
    Write-Host "  - Monday to Friday only" -ForegroundColor White
    Write-Host ""
    Write-Host "📖 Read AUTOMATION_SETUP.md for full documentation." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Push failed!" -ForegroundColor Red
    Write-Host "Please check your git remote and try:" -ForegroundColor Yellow
    Write-Host "  git push origin main" -ForegroundColor White
}

Write-Host ""

