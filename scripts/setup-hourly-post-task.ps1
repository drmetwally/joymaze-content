# setup-hourly-post-task.ps1
# Creates two hourly Task Scheduler jobs for JoyMaze:
#   1. JoyMaze Hourly Creative Post  -- post-content.mjs --scheduled --limit 2
#   2. JoyMaze Hourly X Text Post    -- post-x-scheduled.mjs
#
# Run once as Administrator (script self-elevates if needed):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-hourly-post-task.ps1

# Self-elevate if not already running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting administrator privileges..."
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Wait
    exit
}

$nodePath   = (Get-Command node).Source
$workingDir = "D:\Joymaze-Content"

# ── Task 1: Hourly Creative Post ──────────────────────────────────────────────
$task1Name = "JoyMaze Hourly Creative Post"
Write-Host ""
Write-Host "Setting up: $task1Name"

if (Get-ScheduledTask -TaskName $task1Name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $task1Name -Confirm:$false
    Write-Host "  Removed existing task."
}

$action1 = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "D:\Joymaze-Content\scripts\post-content.mjs --scheduled --limit 2" `
    -WorkingDirectory $workingDir

$trigger1 = New-ScheduledTaskTrigger `
    -Once -At "06:00" `
    -RepetitionInterval (New-TimeSpan -Hours 1) `
    -RepetitionDuration (New-TimeSpan -Days 9999)

$settings1 = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

$principal1 = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $task1Name `
    -Action $action1 `
    -Trigger $trigger1 `
    -Settings $settings1 `
    -Principal $principal1 `
    -Description "JoyMaze: drip creative image/video posts hourly. Only posts items whose scheduledHour has arrived. Max 2 per run." | Out-Null

Write-Host "  Created: runs every hour from 6 AM. Catches up on next login if PC was off."

# ── Task 2: Hourly X Text Post ────────────────────────────────────────────────
$task2Name = "JoyMaze Hourly X Text Post"
Write-Host ""
Write-Host "Setting up: $task2Name"

if (Get-ScheduledTask -TaskName $task2Name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $task2Name -Confirm:$false
    Write-Host "  Removed existing task."
}

$action2 = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "D:\Joymaze-Content\scripts\post-x-scheduled.mjs" `
    -WorkingDirectory $workingDir

$trigger2 = New-ScheduledTaskTrigger `
    -Once -At "07:00" `
    -RepetitionInterval (New-TimeSpan -Hours 1) `
    -RepetitionDuration (New-TimeSpan -Days 9999)

$settings2 = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

$principal2 = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $task2Name `
    -Action $action2 `
    -Trigger $trigger2 `
    -Settings $settings2 `
    -Principal $principal2 `
    -Description "JoyMaze: drip X text thread posts hourly from x-text-YYYY-MM-DD.json." | Out-Null

Write-Host "  Created: runs every hour from 7 AM. Catches up on next login if PC was off."

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "====================================="
Write-Host " Both hourly posting tasks created."
Write-Host "====================================="
Write-Host ""
Write-Host "Creative posts : every hour from 6 AM (post-content.mjs --scheduled --limit 2)"
Write-Host "X text posts   : every hour from 7 AM (post-x-scheduled.mjs)"
Write-Host ""
Write-Host "Both tasks respect output\posting-cooldown.json"
Write-Host "Posting is PAUSED until 2026-04-12 (shadowban cool-down)."
Write-Host ""
Write-Host "Verify:"
Write-Host "  Get-ScheduledTask -TaskName '$task1Name' | Get-ScheduledTaskInfo"
Write-Host "  Get-ScheduledTask -TaskName '$task2Name' | Get-ScheduledTaskInfo"
Write-Host ""
Write-Host "Dry-run test:"
Write-Host "  node D:\Joymaze-Content\scripts\post-content.mjs --scheduled --limit 2 --dry-run"
Write-Host ""
Write-Host "NOTE: The old 'JoyMaze 4am Post' task is now a no-op. You can disable or delete it."
