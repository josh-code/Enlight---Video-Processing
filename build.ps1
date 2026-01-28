# build.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$scriptName = "hls_converter.py"
$exeName    = "EnlightHLS"

if (!(Test-Path ".\.venv\Scripts\python.exe")) {
  Write-Host "Virtual env not found. Run: .\init.ps1" -ForegroundColor Red
  exit 1
}

Write-Host "Cleaning old build artifacts..." -ForegroundColor Yellow
Remove-Item -Recurse -Force ".\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\dist"  -ErrorAction SilentlyContinue
Remove-Item -Force ".\*.spec"         -ErrorAction SilentlyContinue

Write-Host "Building EXE..." -ForegroundColor Yellow
.\.venv\Scripts\python.exe -m PyInstaller --noconsole --onefile --name $exeName $scriptName

Write-Host ""
Write-Host "✅ Build complete!" -ForegroundColor Green
Write-Host ("EXE: " + (Join-Path $PSScriptRoot "dist\$exeName.exe")) -ForegroundColor Green