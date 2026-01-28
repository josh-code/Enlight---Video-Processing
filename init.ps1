# init.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "== Enlight Init ==" -ForegroundColor Cyan

# 1) Create venv if missing
if (!(Test-Path ".\.venv")) {
  Write-Host "Creating virtual environment (.venv)..." -ForegroundColor Yellow
  python -m venv .venv
} else {
  Write-Host "Virtual environment already exists." -ForegroundColor Green
}

# 2) Upgrade pip + install requirements
Write-Host "Installing dependencies..." -ForegroundColor Yellow
.\.venv\Scripts\python.exe -m pip install --upgrade pip | Out-Null
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3) Check ffmpeg + ffprobe availability
Write-Host "Checking FFmpeg..." -ForegroundColor Yellow
try {
  ffmpeg -version | Out-Null
  ffprobe -version | Out-Null
  Write-Host "✅ FFmpeg found in PATH." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "⚠️ FFmpeg NOT found in PATH." -ForegroundColor Red
  Write-Host "Fix options:" -ForegroundColor Yellow
  Write-Host "1) Install FFmpeg and add C:\ffmpeg\bin to PATH, then reopen PowerShell." -ForegroundColor Yellow
  Write-Host "2) Or place ffmpeg.exe + ffprobe.exe in a folder and add that folder to PATH." -ForegroundColor Yellow
  Write-Host ""
}

Write-Host ""
Write-Host "✅ Init complete." -ForegroundColor Green
Write-Host "Next: run .\run.ps1" -ForegroundColor Cyan


