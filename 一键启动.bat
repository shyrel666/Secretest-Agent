@echo off
chcp 65001 >nul 2>&1
title Secretest Agent - 一键启动
setlocal EnableDelayedExpansion

echo ============================================================
echo   Secretest Agent - 一键启动
echo ============================================================
echo.

REM ─────────────────────────────────────────────────────────
REM 0. 检测管理员权限
REM ─────────────────────────────────────────────────────────
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] 当前未以管理员身份运行
    echo     自动安装 Node.js / VC++ 运行库需要管理员权限
    echo     请右键「一键启动.bat」→ 选择「以管理员身份运行」
    echo.
    choice /C YN /M "是否仍要继续？（Y=继续 N=退出）"
    if !ERRORLEVEL! equ 2 exit /b 1
    echo.
    echo [!] 注意：缺少管理员权限可能导致部分安装步骤失败
    echo.
)

REM ─────────────────────────────────────────────────────────
REM 1. 检测并自动安装 Node.js
REM ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] 未检测到 Node.js，正在尝试自动安装...
    echo.

    REM 优先使用 winget（Windows 10 1709+ / Windows 11 内置）
    where winget >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [i] 使用 winget 安装 Node.js LTS...
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! equ 0 (
            echo [√] Node.js 安装成功，正在刷新环境变量...
            goto :refresh_path
        )
        echo [!] winget 安装失败，尝试备用方式...
    )

    REM 备用：用 PowerShell 动态获取最新 LTS 版本并下载安装
    echo [i] 正在获取 Node.js 最新 LTS 版本...
    set "NODE_LTS_VER="
    for /f "delims=" %%v in ('powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $r=Invoke-WebRequest -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing; ($r.Content|ConvertFrom-Json)[0].version } catch { '' }"') do set "NODE_LTS_VER=%%v"
    if not defined NODE_LTS_VER (
        echo [!] 无法获取最新版本号，使用固定版本 v20.18.3
        set "NODE_LTS_VER=v20.18.3"
    )
    echo [i] 将安装 Node.js !NODE_LTS_VER! ...
    powershell -NoProfile -Command ^
        "$ProgressPreference='SilentlyContinue'; "^
        "Invoke-WebRequest -Uri 'https://nodejs.org/dist/!NODE_LTS_VER!/node-!NODE_LTS_VER!-x64.msi' -OutFile \"$env:TEMP\node-lts.msi\""
    if !ERRORLEVEL! equ 0 (
        echo [i] 下载完成，正在静默安装...
        msiexec /i "%TEMP%\node-lts.msi" /qn /norestart
        if !ERRORLEVEL! equ 0 (
            echo [√] Node.js 安装成功，正在刷新环境变量...
            del "%TEMP%\node-lts.msi" >nul 2>&1
            goto :refresh_path
        )
    )

    REM 全部失败，给出手动指引
    echo.
    echo [错误] 自动安装失败，请手动安装 Node.js 20.x LTS：
    echo   下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:node_ok
for /f "tokens=1 delims=v" %%a in ('node -v') do set "NODE_VER=%%a"
echo [√] Node.js 已安装: v%NODE_VER%
goto :after_node_refresh

:refresh_path
REM 刷新 PATH 环境变量，让当前脚本能立即找到 node
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=!SYS_PATH!;!USR_PATH!"
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] 安装完成但当前终端无法找到 node，请关闭此窗口后重新双击 一键启动.bat
    pause
    exit /b 0
)
goto :node_ok

:after_node_refresh

REM ─────────────────────────────────────────────────────────
REM 1b. 检测 VC++ 运行库（better-sqlite3 / sqlite-vec 依赖）
REM ─────────────────────────────────────────────────────────
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" /v Major >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] 未检测到 VC++ 2015-2022 运行库，sqlite 相关功能可能无法运行
    where winget >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [i] 使用 winget 自动安装 VC++ 运行库...
        winget install Microsoft.VCRedist.2015+.x64 --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! equ 0 (
            echo [√] VC++ 运行库安装完成
        ) else (
            echo [!] VC++ 运行库自动安装失败，请手动下载：
            echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
        )
    ) else (
        echo [!] 请手动安装 VC++ 运行库：https://aka.ms/vs/17/release/vc_redist.x64.exe
    )
) else (
    echo [√] VC++ 运行库已安装
)

REM ─────────────────────────────────────────────────────────
REM 2. 检测 pnpm
REM ─────────────────────────────────────────────────────────
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] 未检测到 pnpm，正在自动安装 pnpm@9...
    echo.
    call npm install -g pnpm@9
    if %ERRORLEVEL% neq 0 (
        echo [错误] pnpm 安装失败，请手动执行: npm install -g pnpm@9
        pause
        exit /b 1
    )
    echo [√] pnpm 安装完成
) else (
    for /f "tokens=1" %%a in ('pnpm -v 2^>nul') do set "PNPM_VER=%%a"
    echo [√] pnpm 已安装: v!PNPM_VER!
)

REM ─────────────────────────────────────────────────────────
REM 3. 检测 .env.local，若不存在则从示例文件生成
REM ─────────────────────────────────────────────────────────
if not exist ".env.local" (
    echo.
    echo [!] 未找到 .env.local，正在从 .env.example 生成...
    if exist ".env.example" (
        copy ".env.example" ".env.local" >nul
        echo [√] 已创建 .env.local（使用默认配置）
        echo.
        echo ============================================================
        echo   如需局域网访问，请编辑 .env.local 设置：
        echo     HOSTNAME=0.0.0.0
        echo ============================================================
        echo.
        choice /C YN /M "是否现在编辑 .env.local？(Y=编辑 N=继续启动)"
        if !ERRORLEVEL! equ 1 (
            notepad ".env.local"
            echo 编辑完成后保存关闭，程序将继续启动...
            pause
        )
    ) else (
        echo [错误] .env.example 也不存在，无法生成配置文件
        pause
        exit /b 1
    )
)

REM ─────────────────────────────────────────────────────────
REM 4. 检测是否已构建（dist/server.js 存在则跳过构建）
REM ─────────────────────────────────────────────────────────
set "NEED_BUILD=0"
if not exist "dist\server.js" (
    set "NEED_BUILD=1"
    echo.
    echo [!] 未检测到构建产物，将进行首次构建...
) else (
    REM 检查 node_modules 是否存在
    if not exist "node_modules" (
        set "NEED_BUILD=1"
        echo [!] 未检测到 node_modules，将重新安装依赖并构建...
    ) else (
        echo [√] 已检测到构建产物，直接启动
    )
)

if "%NEED_BUILD%"=="1" (
    echo.
    echo ──────────────────────────────────────────────────────────
    echo   步骤 1/2: 安装依赖 (pnpm install)
    echo ──────────────────────────────────────────────────────────
    call pnpm install
    if %ERRORLEVEL% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [√] 依赖安装完成

    echo.
    echo ──────────────────────────────────────────────────────────
    echo   步骤 2/2: 构建项目 (pnpm build)
    echo ──────────────────────────────────────────────────────────
    call pnpm build
    if %ERRORLEVEL% neq 0 (
        echo [错误] 构建失败
        pause
        exit /b 1
    )
    echo [√] 构建完成
)

REM ─────────────────────────────────────────────────────────
REM 5. 检测端口冲突
REM ─────────────────────────────────────────────────────────
REM 从 .env.local 读取端口，默认 10929
set "APP_PORT=10929"
if exist ".env.local" (
    for /f "tokens=1,2 delims==" %%a in ('findstr /I "^PORT=" ".env.local" 2^>nul') do (
        set "APP_PORT=%%b"
    )
)
echo [i] 检测端口 !APP_PORT! 是否被占用...
netstat -ano | findstr /R ":%APP_PORT% .*LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo [错误] 端口 !APP_PORT! 已被占用！
    echo.
    echo   占用该端口的进程：
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R ":%APP_PORT% .*LISTENING"') do (
        echo     PID: %%p
        for /f "tokens=1" %%n in ('tasklist /FI "PID eq %%p" /NH 2^>nul') do echo     进程: %%n
    )
    echo.
    echo   解决方法：
    echo     1. 编辑 .env.local 修改 PORT 为其他端口（如 10930）
    echo     2. 或关闭占用端口的程序后重新启动
    echo.
    choice /C YN /M "是否仍要继续启动？（Y=继续 N=退出）"
    if !ERRORLEVEL! equ 2 exit /b 1
    echo.
    echo [!] 继续启动，可能会因端口冲突而失败...
    echo.
) else (
    echo [√] 端口 !APP_PORT! 可用
)

REM ─────────────────────────────────────────────────────────
REM 6. 启动服务
REM ─────────────────────────────────────────────────────────
echo.
echo ============================================================
echo   正在启动 Secretest Agent...
echo.
echo   本机访问:  http://localhost:!APP_PORT!
echo   局域网:    http://本机IP:!APP_PORT!  (需设置 HOSTNAME=0.0.0.0)
echo.
echo   按 Ctrl+C 停止服务
echo ============================================================
echo.

call pnpm start

pause
