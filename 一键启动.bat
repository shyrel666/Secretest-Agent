@echo off
chcp 65001 >nul 2>&1
title Secretest Agent Launcher
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "MIN_NODE_MAJOR=20"

echo ============================================================
echo   Secretest Agent Launcher
echo ============================================================
echo.

call :require_admin || goto :fail
call :ensure_node || goto :fail
call :ensure_vcredist
call :ensure_pnpm || goto :fail
call :ensure_env || goto :fail
call :ensure_build || goto :fail
call :check_port || goto :fail
call :start_app
exit /b %ERRORLEVEL%

:require_admin
net session >nul 2>&1
if not errorlevel 1 (
    echo [OK] Administrator privileges detected.
    echo.
    exit /b 0
)

echo [WARN] This window is not running as Administrator.
echo       Automatic installation of Node.js or VC++ runtime may fail.
echo       Recommended: right-click this file and choose Run as administrator.
echo.
choice /C YN /M "Continue anyway? (Y=continue N=exit)"
if errorlevel 2 exit /b 1
echo.
exit /b 0

:ensure_node
where node >nul 2>&1
if not errorlevel 1 (
    call :verify_node_runtime
    if not errorlevel 1 (
        echo.
        exit /b 0
    )

    echo [WARN] Existing Node.js is missing, broken, or below v!MIN_NODE_MAJOR!.
    echo [INFO] Installing or upgrading Node.js LTS...
    echo.
    goto :install_node
)

echo [WARN] Node.js was not found. Installing Node.js LTS...

:install_node
where winget >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Installing Node.js LTS with winget...
    call winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if not errorlevel 1 (
        call :refresh_path
        where node >nul 2>&1
        if not errorlevel 1 (
            call :verify_node_runtime
            if not errorlevel 1 (
                echo.
                exit /b 0
            )
        )
    )
    echo [WARN] winget installation did not produce a usable Node.js environment. Trying MSI fallback...
)

set "NODE_LTS_VER="
for /f "delims=" %%v in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $r=Invoke-WebRequest -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing; ($r.Content|ConvertFrom-Json)[0].version } catch { '' }"') do set "NODE_LTS_VER=%%v"
if not defined NODE_LTS_VER set "NODE_LTS_VER=v20.18.3"

echo [INFO] Downloading Node.js !NODE_LTS_VER! MSI...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/!NODE_LTS_VER!/node-!NODE_LTS_VER!-x64.msi' -OutFile \"$env:TEMP\node-lts.msi\""
if errorlevel 1 (
    echo [ERROR] Failed to download Node.js. Install Node.js 20.x LTS manually from https://nodejs.org/
    pause
    exit /b 1
)

echo [INFO] Installing Node.js MSI...
msiexec /i "%TEMP%\node-lts.msi" /qn /norestart
if errorlevel 1 (
    echo [ERROR] Node.js MSI installation failed. Install Node.js 20.x LTS manually from https://nodejs.org/
    pause
    exit /b 1
)
del "%TEMP%\node-lts.msi" >nul 2>&1
call :refresh_path

:node_ready
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was installed, but this terminal cannot find node.
    echo         Close this window and run this launcher again.
    pause
    exit /b 1
)
call :verify_node_runtime
if errorlevel 1 (
    echo [ERROR] Node.js installation did not create a usable v!MIN_NODE_MAJOR!+ environment.
    echo         Close this window and run this launcher again, or install Node.js 20.x LTS manually.
    pause
    exit /b 1
)
echo.
exit /b 0

:verify_node_runtime
set "NODE_VER="
set "NODE_MAJOR="
set "NPM_VER="
for /f "tokens=*" %%a in ('node -v 2^>nul') do set "NODE_VER=%%a"
for /f "tokens=*" %%a in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%a"

if not defined NODE_VER (
    echo [WARN] Node.js command exists, but node -v failed.
    exit /b 1
)

if not defined NODE_MAJOR (
    echo [WARN] Node.js version could not be parsed: !NODE_VER!
    exit /b 1
)

if !NODE_MAJOR! lss !MIN_NODE_MAJOR! (
    echo [WARN] Node.js !NODE_VER! found, but v!MIN_NODE_MAJOR!+ is required.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [WARN] Node.js !NODE_VER! found, but npm was not found on PATH.
    exit /b 1
)

for /f "tokens=*" %%a in ('npm -v 2^>nul') do set "NPM_VER=%%a"
if not defined NPM_VER (
    echo [WARN] npm command exists, but npm -v failed.
    exit /b 1
)

echo [OK] Node.js found: !NODE_VER! (npm v!NPM_VER!)
exit /b 0

:ensure_vcredist
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" /v Major >nul 2>&1
if not errorlevel 1 (
    echo [OK] VC++ runtime found.
    echo.
    exit /b 0
)

echo [WARN] VC++ 2015-2022 x64 runtime was not found.
where winget >nul 2>&1
if errorlevel 1 (
    echo [WARN] Install it manually if sqlite native modules fail:
    echo        https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo.
    exit /b 0
)

echo [INFO] Installing VC++ runtime with winget...
call winget install Microsoft.VCRedist.2015+.x64 --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo [WARN] VC++ runtime installation failed. Manual download:
    echo        https://aka.ms/vs/17/release/vc_redist.x64.exe
) else (
    echo [OK] VC++ runtime installed.
)
echo.
exit /b 0

:ensure_pnpm
echo [INFO] Checking pnpm package manager...
where pnpm >nul 2>&1
if not errorlevel 1 (
    call :verify_pnpm_runtime
    if not errorlevel 1 (
        echo.
        exit /b 0
    )
    echo [WARN] Existing pnpm command is not usable or did not respond within 15 seconds.
    echo [INFO] Trying Corepack...
) else (
    echo [WARN] pnpm was not found. Trying Corepack...
)

set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
where corepack >nul 2>&1
if not errorlevel 1 (
    call corepack enable
    call corepack prepare pnpm@9.0.0 --activate
    call :refresh_path
    call :verify_pnpm_runtime
    if not errorlevel 1 (
        echo.
        exit /b 0
    )
)

echo [WARN] Corepack did not provide pnpm. Trying npm global install...
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found. Reinstall Node.js 20.x LTS and run this launcher again.
    pause
    exit /b 1
)

call npm install -g pnpm@9
if errorlevel 1 (
    echo [ERROR] pnpm installation failed. Try manually: npm install -g pnpm@9
    pause
    exit /b 1
)

call :refresh_path
call :add_npm_prefix_to_path
call :verify_pnpm_runtime
if errorlevel 1 (
    echo [ERROR] pnpm was installed, but this terminal cannot run pnpm -v.
    echo         Close this window and run this launcher again.
    pause
    exit /b 1
)
echo.
exit /b 0

:verify_pnpm_runtime
set "PNPM_VER="
for /f "tokens=*" %%a in ('pnpm -v 2^>nul') do set "PNPM_VER=%%a"
if not defined PNPM_VER exit /b 1
echo [OK] pnpm found: v!PNPM_VER!
exit /b 0

:ensure_env
if exist ".env.local" exit /b 0

echo [WARN] .env.local was not found. Creating it from .env.example...
if not exist ".env.example" (
    echo [ERROR] .env.example was not found. Cannot create local config.
    pause
    exit /b 1
)

copy ".env.example" ".env.local" >nul
if errorlevel 1 (
    echo [ERROR] Failed to create .env.local.
    pause
    exit /b 1
)

echo [OK] .env.local created.
echo [INFO] For LAN access, set HOSTNAME=0.0.0.0 in .env.local.
echo.
choice /C YN /M "Open .env.local in Notepad now? (Y=edit N=continue)"
if errorlevel 2 exit /b 0
notepad ".env.local"
echo Save and close Notepad, then press any key to continue.
pause >nul
exit /b 0

:ensure_build
set "NEED_BUILD=0"
if not exist "dist\server.js" (
    set "NEED_BUILD=1"
    echo [WARN] Build output was not found. First build is required.
) else if not exist "node_modules" (
    set "NEED_BUILD=1"
    echo [WARN] node_modules was not found. Dependencies and build are required.
) else (
    echo [OK] Build output found. Starting without rebuild.
)

if not "!NEED_BUILD!"=="1" (
    echo.
    exit /b 0
)

echo.
echo ------------------------------------------------------------
echo Step 1/2: Installing dependencies with pnpm install
echo ------------------------------------------------------------
call pnpm install
if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.

echo.
echo ------------------------------------------------------------
echo Step 2/2: Building project with pnpm build
echo ------------------------------------------------------------
call pnpm build
if errorlevel 1 (
    echo [ERROR] Project build failed.
    pause
    exit /b 1
)
echo [OK] Build completed.
echo.
exit /b 0

:check_port
set "APP_PORT=10929"
if exist ".env.local" (
    for /f "tokens=1,2 delims==" %%a in ('findstr /I "^PORT=" ".env.local" 2^>nul') do set "APP_PORT=%%b"
)

echo [INFO] Checking port !APP_PORT!...
netstat -ano | findstr /R ":!APP_PORT! .*LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [OK] Port !APP_PORT! is available.
    echo.
    exit /b 0
)

echo [ERROR] Port !APP_PORT! is already in use.
echo Processes using this port:
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R ":!APP_PORT! .*LISTENING"') do (
    echo   PID: %%p
    for /f "tokens=1" %%n in ('tasklist /FI "PID eq %%p" /NH 2^>nul') do echo   Process: %%n
)
echo.
choice /C YN /M "Continue anyway? (Y=continue N=exit)"
if errorlevel 2 exit /b 1
echo.
exit /b 0

:start_app
echo ============================================================
echo   Starting Secretest Agent
echo.
echo   Local: http://localhost:!APP_PORT!
echo   LAN:   http://YOUR_IP:!APP_PORT!  (set HOSTNAME=0.0.0.0)
echo.
echo   Press Ctrl+C to stop the service.
echo ============================================================
echo.

call pnpm start
set "START_EXIT=%ERRORLEVEL%"
if not "%START_EXIT%"=="0" (
    echo.
    echo [ERROR] Service exited with code %START_EXIT%.
)
pause
exit /b %START_EXIT%

:refresh_path
set "SYS_PATH="
set "USR_PATH="
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=!SYS_PATH!;!USR_PATH!;!PATH!"
call :add_npm_prefix_to_path
exit /b 0

:add_npm_prefix_to_path
where npm >nul 2>&1
if errorlevel 1 exit /b 0
set "NPM_PREFIX="
for /f "delims=" %%p in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%p"
if not defined NPM_PREFIX exit /b 0
if /I "!NPM_PREFIX!"=="undefined" exit /b 0
if exist "!NPM_PREFIX!\pnpm.cmd" set "PATH=!NPM_PREFIX!;!PATH!"
exit /b 0

:fail
echo.
echo [ERROR] Launcher stopped before the service could start.
pause
exit /b 1
