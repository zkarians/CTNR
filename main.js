const { app, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let tray = null;
let serverProcess = null;

// Only allow single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Someone tried to run a second instance, we should focus our window/tray.
    });
}

function startServer(mode) {
    if (serverProcess) {
        return; // Already running
    }
    
    // Determine command based on mode
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = mode === 'dev' ? ['run', 'dev:clean'] : ['start'];
    
    const isPackaged = app.isPackaged;
    
    // Find the actual project root where package.json lives
    // Since the .exe can be moved anywhere (like Desktop), we explicitly target the project paths.
    let appPath = __dirname;
    const possiblePaths = [
        'C:\\Program Files (x86)\\CTNR',
        'C:\\Users\\Administrator\\Desktop\\CTNR'
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'package.json'))) {
            appPath = p;
            break;
        }
    }

    const outLog = fs.openSync(path.join(appPath, 'server.log'), 'a');
    
    serverProcess = spawn(command, args, {
        cwd: appPath,
        stdio: ['ignore', outLog, outLog], // write stdout and stderr to server.log
        windowsHide: true,
        shell: true, // Fix for Windows EINVAL
        detached: false
    });

    serverProcess.on('exit', (code) => {
        serverProcess = null;
        updateTrayMenu();
    });
    
    updateTrayMenu();
}

function stopServer() {
    if (serverProcess) {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { windowsHide: true });
        } else {
            serverProcess.kill();
        }
        serverProcess = null;
    }
    updateTrayMenu();
}

function updateTrayMenu() {
    if (!tray) return;

    const isRunning = serverProcess !== null;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: isRunning ? '🟢 서버 상태: 켜짐 (Port 4000)' : '🔴 서버 상태: 꺼짐',
            enabled: false
        },
        { type: 'separator' },
        {
            label: '서버 켜기',
            enabled: !isRunning,
            click: () => startServer('dev')
        },
        {
            label: '서버 끄기',
            enabled: isRunning,
            click: () => stopServer()
        },
        { type: 'separator' },
        {
            label: '웹 브라우저로 열기',
            click: () => {
                shell.openExternal('http://localhost:4000');
            }
        },
        { type: 'separator' },
        {
            label: '완전히 종료하기',
            click: () => {
                stopServer();
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip(isRunning ? 'CTNR Server (Running)' : 'CTNR Server (Stopped)');
}

app.on('ready', () => {
    // 1. Kill any existing zombie node processes to prevent EADDRINUSE
    try {
        const { execSync } = require('child_process');
        execSync('taskkill /f /im node.exe', { windowsHide: true, stdio: 'ignore' });
    } catch (e) {
        // Ignore errors if no node process was found
    }

    let icon;
    try {
        // Read file into buffer to avoid ASAR path issues on Windows Tray
        // We use the existing Next.js public icon which is a valid PNG
        const iconPath = path.join(__dirname, 'public', 'icon-192.png');
        if (fs.existsSync(iconPath)) {
            const iconBuffer = fs.readFileSync(iconPath);
            icon = nativeImage.createFromBuffer(iconBuffer);
            
            // Resize if it's too big for Tray, though Tray usually scales it, 
            // 32x32 is safer for Windows
            icon = icon.resize({ width: 32, height: 32 });
        }
        
        if (!icon || icon.isEmpty()) {
            icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAADFJREFUOE9j/M+A+c9AjBhVMAyqYcAwMBrBQCQYh/aC4f+DkUlgNEIIMBqBgBkaQSAAB25P4UqL5JAAAAAASUVORK5CYII=');
        }
    } catch (e) {
        icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAADFJREFUOE9j/M+A+c9AjBhVMAyqYcAwMBrBQCQYh/aC4f+DkUlgNEIIMBqBgBkaQSAAB25P4UqL5JAAAAAASUVORK5CYII=');
    }
    
    tray = new Tray(icon);
    tray.setToolTip('CTNR Server Optimizer');
    
    // Auto start the server immediately when the app opens
    startServer('dev');
    
    updateTrayMenu();
});

// Hide from dock on macOS
if (app.dock) {
    app.dock.hide();
}

app.on('window-all-closed', () => {
    // Do nothing, we want to stay running in tray
});
