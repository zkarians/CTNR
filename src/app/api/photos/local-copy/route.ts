import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { downloadFromGoogleDrive, findGoogleDriveFileByName } from '@/lib/gdrive';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        // Only ADMIN/MANAGER can copy local files
        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';
        if (!isAdmin) {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        const body = await req.json();
        const { cntrNos: cntrNosParam, ids: idsParam, targetPath, conflictAction = 'overwrite', autoTeamSubfolder = true, isDirectPhotoCopy = false } = body;

        if ((!cntrNosParam && !idsParam) || !targetPath) {
            return NextResponse.json({ error: '필수 매개변수가 누락되었습니다.' }, { status: 400 });
        }

        // Resolve local target directory
        const resolvedTargetDir = path.resolve(targetPath);
        if (!fs.existsSync(resolvedTargetDir)) {
            try {
                fs.mkdirSync(resolvedTargetDir, { recursive: true });
            } catch (dirErr: any) {
                return NextResponse.json({ error: `대상 폴더를 생성할 수 없습니다: ${dirErr.message}` }, { status: 400 });
            }
        }

        // 1. Fetch photo paths from the database for the selected containers
        const client = await pool.connect();
        let photos: { cntr_no: string; photo_path: string; gdrive_file_id?: string; gdrive_url?: string; team_name?: string }[] = [];
        try {
            if (idsParam) {
                const ids = (Array.isArray(idsParam) ? idsParam : String(idsParam).split(',')).map((s: any) => String(s).trim()).filter(Boolean);
                const res = await client.query(
                    `SELECT cntr_no, photo_path, gdrive_file_id, gdrive_url, team_name 
                     FROM container_photos 
                     WHERE id = ANY($1) AND (is_deleted IS NULL OR is_deleted = false)`,
                    [ids]
                );
                photos = res.rows;
            } else {
                const cntrNos = (Array.isArray(cntrNosParam) 
                    ? cntrNosParam 
                    : cntrNosParam.split(','))
                    .map((s: any) => String(s).trim().toUpperCase())
                    .filter(Boolean);

                if (cntrNos.length === 0) {
                    return NextResponse.json({ error: '선택된 컨테이너가 없습니다.' }, { status: 400 });
                }

                const query = `
                    SELECT cntr_no, photo_path, gdrive_file_id, gdrive_url, team_name 
                    FROM container_photos 
                    WHERE UPPER(TRIM(cntr_no)) = ANY($1)
                      AND (is_deleted IS NULL OR is_deleted = false)
                `;
                const res = await client.query(query, [cntrNos]);
                photos = res.rows;
            }
        } finally {
            client.release();
        }

        if (photos.length === 0) {
            return NextResponse.json({ error: '선택한 컨테이너에 사진이 없습니다.' }, { status: 404 });
        }

        const uploadsDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
        const totalPhotos = photos.length;

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const sendEvent = (obj: any) => {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
                    } catch (err) {
                        // Controller might be closed
                    }
                };

                // Send start event immediately so client knows total count
                sendEvent({ type: 'start', total: totalPhotos });

                let copiedCount = 0;
                let skippedCount = 0;
                let failCount = 0;
                let processed = 0;

                for (const photo of photos) {
                    if (req.signal.aborted) {
                        console.log("Local copy operation aborted by user client.");
                        sendEvent({ type: 'aborted', copiedCount, skippedCount, failCount, total: totalPhotos });
                        try { controller.close(); } catch (e) {}
                        return;
                    }

                    const relativePath = photo.photo_path;
                    const sourceFilePath = path.resolve(uploadsDir, relativePath);
                    const filename = path.basename(relativePath);

                    let sourceBuffer: Buffer | null = null;
                    const relPath = path.relative(uploadsDir, sourceFilePath);
                    const isSafe = !relPath.startsWith('..') && !path.isAbsolute(relPath);

                    if (isSafe && fs.existsSync(sourceFilePath)) {
                        try {
                            sourceBuffer = fs.readFileSync(sourceFilePath);
                        } catch (e) {}
                    } else {
                        // Fetch from Google Drive if local file is missing
                        try {
                            let gdriveFileId = photo.gdrive_file_id;
                            let gdriveUrl = photo.gdrive_url;

                            if (!gdriveFileId) {
                                const foundGDrive = await findGoogleDriveFileByName(filename);
                                if (foundGDrive) {
                                    gdriveFileId = foundGDrive.fileId;
                                    gdriveUrl = foundGDrive.gdriveUrl;
                                }
                            }

                            const fetchUrl = gdriveUrl || (gdriveFileId ? `https://lh3.googleusercontent.com/d/${gdriveFileId}` : null);
                            if (fetchUrl) {
                                try {
                                    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(5000) });
                                    if (res.ok) {
                                        sourceBuffer = Buffer.from(await res.arrayBuffer());
                                    }
                                } catch (e) {}
                            }

                            if (!sourceBuffer && gdriveFileId) {
                                try {
                                    sourceBuffer = await downloadFromGoogleDrive(gdriveFileId);
                                } catch (e) {}
                            }

                            if (sourceBuffer) {
                                // Cache locally for future speed
                                try {
                                    const dir = path.dirname(sourceFilePath);
                                    if (!fs.existsSync(dir)) {
                                        fs.mkdirSync(dir, { recursive: true });
                                    }
                                    fs.writeFileSync(sourceFilePath, sourceBuffer);
                                } catch (e) {}
                            }
                        } catch (gErr) {
                            console.warn(`[Local Copy GDrive Fetch Error] ${filename}:`, gErr);
                        }
                    }

                    if (sourceBuffer) {
                        const rawTeamName = (photo.team_name || '').trim();
                        let cleanTeam = '기타조';
                        if (rawTeamName.includes('1조')) cleanTeam = '1조';
                        else if (rawTeamName.includes('2조')) cleanTeam = '2조';
                        else if (rawTeamName.includes('3조')) cleanTeam = '3조';
                        else if (rawTeamName.includes('4조')) cleanTeam = '4조';
                        else if (rawTeamName.includes('5조')) cleanTeam = '5조';
                        else if (rawTeamName) cleanTeam = rawTeamName.split('(')[0].trim() || rawTeamName;

                        let baseDir = resolvedTargetDir;
                        if (autoTeamSubfolder) {
                            const baseName = path.basename(baseDir);
                            if (/^[1-9]조/.test(baseName) || baseName.endsWith('조')) {
                                baseDir = path.dirname(baseDir);
                            }
                        }

                        const containerFolder = photo.cntr_no.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                        let destContainerDir = resolvedTargetDir;

                        if (isDirectPhotoCopy) {
                            destContainerDir = resolvedTargetDir;
                        } else if (autoTeamSubfolder) {
                            destContainerDir = path.join(baseDir, cleanTeam, containerFolder);
                        } else {
                            destContainerDir = path.join(resolvedTargetDir, containerFolder);
                        }
                        
                        if (!fs.existsSync(destContainerDir)) {
                            fs.mkdirSync(destContainerDir, { recursive: true });
                        }

                        const destFilePath = path.join(destContainerDir, filename);

                        if (fs.existsSync(destFilePath) && conflictAction === 'skip') {
                            skippedCount++;
                        } else {
                            const tmpFilePath = `${destFilePath}.${Date.now()}_${Math.random().toString(36).substring(2, 7)}.tmp`;
                            try {
                                fs.writeFileSync(tmpFilePath, sourceBuffer);
                                fs.renameSync(tmpFilePath, destFilePath);
                                copiedCount++;
                            } catch (copyErr) {
                                console.error(`Failed to safely copy ${sourceFilePath}:`, copyErr);
                                if (fs.existsSync(tmpFilePath)) {
                                    try { fs.unlinkSync(tmpFilePath); } catch (cleanErr) {}
                                }
                                failCount++;
                            }
                        }
                    } else {
                        failCount++;
                    }

                    processed++;
                    const percent = Math.round((processed / totalPhotos) * 100);

                    sendEvent({
                        type: 'progress',
                        current: processed,
                        total: totalPhotos,
                        percent,
                        currentFile: filename,
                        copiedCount,
                        skippedCount,
                        failCount
                    });
                }

                let resultMsg = `성공적으로 ${copiedCount}개 파일을 복사했습니다.`;
                if (skippedCount > 0) resultMsg += ` (중복 생략: ${skippedCount}개)`;
                if (failCount > 0) resultMsg += ` (실패: ${failCount}개)`;

                sendEvent({
                    type: 'done',
                    success: true,
                    message: resultMsg,
                    copiedCount,
                    skippedCount,
                    failCount,
                    total: totalPhotos
                });
                try { controller.close(); } catch (e) {}
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (error: any) {
        console.error('Local Copy Error:', error);
        return NextResponse.json({ error: `서버 오류: ${error.message}` }, { status: 500 });
    }
}
