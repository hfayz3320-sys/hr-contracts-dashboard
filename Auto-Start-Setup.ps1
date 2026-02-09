# Auto-start HR Dashboard servers on Windows boot
# Run this script with admin privileges

$scriptPath = "d:\ai\New folder (3)\hr-contracts-dashboard-copy\start-servers.bat"
$startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = "$startupFolder\HR-Dashboard-Servers.lnk"

# Create shortcut to start-servers.bat in Startup folder
$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $scriptPath
$shortcut.WorkingDirectory = "d:\ai\New folder (3)\hr-contracts-dashboard-copy"
$shortcut.WindowStyle = 1
$shortcut.Description = "HR Dashboard Servers"
$shortcut.Save()

Write-Host "Auto-start configured!" -ForegroundColor Green
Write-Host "Servers will start automatically when Windows boots"
Write-Host "Shortcut created at: $shortcutPath"
