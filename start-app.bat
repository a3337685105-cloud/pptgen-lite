@echo off
setlocal
cd /d "%~dp0"
title PPTgen V2 Studio

if not "%~1"=="" (
  set "APP_PORT=%~1"
) else (
  if defined PORT (
    set "APP_PORT=%PORT%"
  ) else (
    set "APP_PORT=3000"
  )
)

set "REQUESTED_PORT=%APP_PORT%"
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = [int]$env:REQUESTED_PORT; while (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue) { $port++ }; Write-Output $port"') do set "APP_PORT=%%P"
set "PORT=%APP_PORT%"

if not exist "generated-images" mkdir "generated-images"
if not exist ".npm-cache" mkdir ".npm-cache"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed or not in PATH.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo [1/3] Installing dependencies...
  call npm install --cache .npm-cache
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Dependencies already installed.
)

if not "%APP_PORT%"=="%REQUESTED_PORT%" (
  echo [INFO] Port %REQUESTED_PORT% is already in use. Switched to %APP_PORT%.
)

set "APP_URL=http://127.0.0.1:%APP_PORT%/"

echo [2/3] Waiting for app to become available...
start "" powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url = '%APP_URL%';" ^
  "for ($i = 0; $i -lt 120; $i++) {" ^
  "  try {" ^
  "    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2;" ^
  "    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {" ^
  "      Start-Process $url;" ^
  "      exit 0;" ^
  "    }" ^
  "  } catch {}" ^
  "  Start-Sleep -Milliseconds 500;" ^
  "}" ^
  "Start-Process $url"

echo [3/3] Starting PPTgen V2 local server on port %APP_PORT%...
echo [INFO] If the browser does not open automatically, open %APP_URL%
node server.js

endlocal
