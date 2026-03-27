@echo off
title CTNR Optimizer Server
setlocal enabledelayedexpansion

:: Get the computer's IP address
set "IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /r /c:"IPv4 Address" /c:"IPv4 ּ"') do (
    set "IP=%%a"
    set "IP=!IP: =!"
)

echo ======================================================
echo    CTNR Optimizer Server Launcher
echo ======================================================
echo.
echo [INFO] Local Access:   http://localhost:4000
echo [INFO] Network Access: http://%IP%:4000
echo.
echo ------------------------------------------------------
echo [1] Start Development Server (Hot Reload enabled)
echo [2] Build and Start Production Server (Faster, Stable)
echo ------------------------------------------------------
echo.

set /p choice="Select mode (1/2, default: 1): "

if "%choice%"=="2" (
    echo [INFO] Building application...
    call npm.cmd run build
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Build failed.
        pause
        exit /b !ERRORLEVEL!
    )
    echo [INFO] Starting Production Server...
    call npm.cmd run start -- -H 0.0.0.0 -p 4000
) else (
    echo [INFO] Starting Development Server...
    call npm.cmd run dev -- -H 0.0.0.0 -p 4000
)

if !ERRORLEVEL! neq 0 (
    echo [ERROR] Application failed to start.
    pause
)
