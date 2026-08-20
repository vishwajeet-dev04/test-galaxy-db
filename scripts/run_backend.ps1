$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    $VenvPython = Join-Path $Root "backend\.venv\Scripts\python.exe"
}

$env:PYTHONPATH = if ($env:PYTHONPATH) {
    "$Root\backend;$env:PYTHONPATH"
} else {
    "$Root\backend"
}

& $VenvPython -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8080 --app-dir backend
