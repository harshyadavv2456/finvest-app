# Registers the news-intelligence sync as a Windows Scheduled Task,
# running every 15 minutes to match finvest_news_intelligence_v2.py's own
# cycle. This is the one piece of the pipeline that can't move to GitHub
# Actions (the source SQLite DB only exists on this machine) - see
# REPO_AUDIT_REPORT.md §3A.5/§7 Phase 1B.
#
# Run this once, as the user who normally runs finvest_news_intelligence_v2.py:
#   powershell -ExecutionPolicy Bypass -File setup_news_sync_task.ps1

$ErrorActionPreference = "Stop"

$taskName = "FinVest-NewsSync"
$scriptPath = "E:\FinVest2\FinSight\backend\scripts\sync_news_intelligence.py"
$pythonExe = (Get-Command python).Source
$workingDir = "E:\FinVest2\FinSight\backend\scripts"

$action = New-ScheduledTaskAction -Execute $pythonExe -Argument "`"$scriptPath`"" -WorkingDirectory $workingDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Syncs FinVest News's local SQLite DB into Supabase every 15 min. See REPO_AUDIT_REPORT.md Phase 1B."

Write-Host "Task '$taskName' registered - runs every 15 minutes."
Write-Host "Check status with: Get-ScheduledTask -TaskName '$taskName' | Get-ScheduledTaskInfo"
