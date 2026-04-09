# setup-post-task.ps1
# Creates a Windows Task Scheduler entry for the JoyMaze 4am Creative Posting job.
# Run once as Administrator:  powershell -ExecutionPolicy Bypass -File scripts\setup-post-task.ps1

$taskName    = "JoyMaze 4am Post"
$nodePath    = (Get-Command node).Source
$scriptPath  = "D:\Joymaze-Content\scripts\daily-scheduler.mjs"
$workingDir  = "D:\Joymaze-Content"
$triggerTime = "04:00"

# Remove existing task if re-running
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task: $taskName"
}

$action  = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "$scriptPath --post-now" `
    -WorkingDirectory $workingDir

$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

# Run as current user (no password prompt, has access to .env and node_modules)
$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName  $taskName `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -Principal $principal `
    -Description "JoyMaze: post queued images + videos to Pinterest/TikTok/YouTube/X at 4am Cairo time (peak US window). Runs missed jobs on next login." | Out-Null

Write-Host ""
Write-Host "Task created: '$taskName'"
Write-Host "Runs daily at: $triggerTime (local PC time - make sure your PC clock is Cairo time or adjust)"
Write-Host "If PC is off at 4am: runs automatically on next login (StartWhenAvailable)"
Write-Host ""
Write-Host "To verify: Get-ScheduledTask -TaskName '$taskName' | Get-ScheduledTaskInfo"
Write-Host "To test now: Start-ScheduledTask -TaskName '$taskName'"
