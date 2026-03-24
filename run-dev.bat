@echo off
cd /d "%~dp0"
echo [INFO] Starting CTNR Optimizer on port 4000...
cmd /c "npm.cmd run dev -- -p 4000"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Application failed to start.
    pause
)
