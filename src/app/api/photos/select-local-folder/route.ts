import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';
        if (!isAdmin) {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        // Run the powershell script to show folder picker
        const scriptPath = path.resolve(process.cwd(), 'scratch', 'select_folder.ps1');

        const scriptContent = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$FolderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
$FolderBrowser.Description = "Select Destination Folder"
$FolderBrowser.ShowNewFolderButton = $true
$Result = $FolderBrowser.ShowDialog()
if ($Result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $FolderBrowser.SelectedPath
} else {
    Write-Output "CANCELLED"
}`;
        const scratchDir = path.dirname(scriptPath);
        if (!fs.existsSync(scratchDir)) {
            fs.mkdirSync(scratchDir, { recursive: true });
        }
        fs.writeFileSync(scriptPath, scriptContent, 'utf8');

        return new Promise<NextResponse>((resolve) => {
            // chcp 65001 forces UTF-8 codepage in the Windows console before launching PowerShell
            const cmd = `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
            exec(cmd, { encoding: 'buffer' }, (error, stdoutBuf, stderrBuf) => {
                if (error) {
                    console.error('PowerShell folder dialog error:', error);
                    resolve(NextResponse.json({ error: `폴더 선택 중 오류가 발생했습니다: ${error.message}` }, { status: 500 }));
                    return;
                }

                // Explicitly decode the stdout buffer as UTF-8 to handle Korean paths
                const result = stdoutBuf.toString('utf8').trim();
                if (result === 'CANCELLED' || !result) {
                    resolve(NextResponse.json({ success: true, cancelled: true }));
                } else {
                    resolve(NextResponse.json({ success: true, path: result }));
                }
            });
        });

    } catch (error: any) {
        console.error('Select Folder Route Error:', error);
        return NextResponse.json({ error: `서버 오류: ${error.message}` }, { status: 500 });
    }
}
