param(
    [int]$Port = 8787,
    [string]$StorageDir = ""
)

$ErrorActionPreference = "Stop"
$env:PORT = "$Port"

if ([string]::IsNullOrWhiteSpace($StorageDir)) {
    $StorageDir = Join-Path $PSScriptRoot "server\storage"
}

if (-not (Test-Path $StorageDir)) {
    New-Item -ItemType Directory -Path $StorageDir -Force | Out-Null
}

$resolvedStorage = (Resolve-Path $StorageDir).Path
$env:STORAGE_DIR = $resolvedStorage

Write-Host "Building and starting shared server on http://0.0.0.0:$Port ..."
Write-Host "Open from another device: http://<YOUR-PC-IP>:$Port"
Write-Host "Storage path: $resolvedStorage"

npm run serve:shared
