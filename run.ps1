# run.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (!(Test-Path ".\.venv\Scripts\python.exe")) {
  Write-Host "Virtual env not found. Run: .\init.ps1" -ForegroundColor Red
  exit 1
}

.\.venv\Scripts\python.exe .\hls_converter.py



