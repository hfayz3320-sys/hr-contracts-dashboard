param(
    [int]$ApiPort = 8787,
    [int]$UiPort = 5173,
    [string]$StorageDir = ""
)

$ErrorActionPreference = "Stop"

$env:PORT = "$ApiPort"
$env:VITE_PORT = "$UiPort"
$env:VITE_API_PROXY_TARGET = "http://127.0.0.1:$ApiPort"

if ([string]::IsNullOrWhiteSpace($StorageDir)) {
    $StorageDir = Join-Path $PSScriptRoot "server\storage"
}

if (-not (Test-Path $StorageDir)) {
    New-Item -ItemType Directory -Path $StorageDir -Force | Out-Null
}

$resolvedStorage = (Resolve-Path $StorageDir).Path
$env:STORAGE_DIR = $resolvedStorage

Write-Host "Starting shared HR dashboard (UI + API)..."
Write-Host "UI (LAN):  http://<YOUR-PC-IP>:$UiPort"
Write-Host "API (LAN): http://<YOUR-PC-IP>:$ApiPort"
Write-Host "Storage path: $resolvedStorage"

npm run dev:all
