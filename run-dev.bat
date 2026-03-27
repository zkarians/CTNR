@echo off
cd /d "%~dp0"
echo [INFO] Starting CTNR Optimizer on all interfaces (0.0.0.0) on port 4000...
cmd /c "npm.cmd run dev -- -H 0.0.0.0 -p 4000"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Application failed to start.
    pause
)
