param(
    [int]$Port = 8787,
    [string]$OneDriveRoot = "",
    [string]$FolderName = "HRContractsDashboardStorage"
)

$ErrorActionPreference = "Stop"

$candidateRoots = @(
    $OneDriveRoot,
    $env:OneDriveCommercial,
    $env:OneDriveConsumer,
    $env:OneDrive
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path $_) }

if (-not $candidateRoots -or $candidateRoots.Count -eq 0) {
    throw "OneDrive folder was not found. Pass -OneDriveRoot manually, e.g. C:\Users\user\OneDrive"
}

$root = (Resolve-Path $candidateRoots[0]).Path
$storagePath = Join-Path $root $FolderName

if (-not (Test-Path $storagePath)) {
    New-Item -ItemType Directory -Path $storagePath -Force | Out-Null
}

Write-Host "Using OneDrive storage: $storagePath"

powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-anywhere.ps1") -Port $Port -StorageDir $storagePath
