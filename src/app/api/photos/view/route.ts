import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pool } from '@/lib/db';
import { downloadFromGoogleDrive, findGoogleDriveFileByName } from '@/lib/gdrive';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        // Route Handler에서는 req.cookies로 직접 읽어야 함
        // (getSession()은 "use server" 컨텍스트 전용이라 Route Handler에서 쿠키를 못 읽음)
        const sessionCookie = req.cookies.get('ctnr_session')?.value;
        if (!sessionCookie) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const rawFilename = searchParams.get('filename');
        const isDownloadMode = searchParams.get('download') === '1';

        if (!rawFilename) {
            return new NextResponse('Filename is required', { status: 400 });
        }

        const filename = rawFilename.split('?')[0];

        // Prevent directory traversal by resolving the path and checking prefix
        const uploadsDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
        const filePath = path.resolve(uploadsDir, filename);

        const relPath = path.relative(uploadsDir, filePath);
        if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(filePath)) {
            // Fallback 1: Fetch from Google Drive via OAuth API
            try {
                let gdriveFileId: string | null = null;
                let gdriveUrl: string | null = null;

                const gRes = await pool.query('SELECT gdrive_url, gdrive_file_id FROM container_photos WHERE photo_path = $1 AND (is_deleted IS NOT TRUE) LIMIT 1', [filename]);
                if (gRes.rows.length > 0) {
                    gdriveFileId = gRes.rows[0].gdrive_file_id || null;
                    gdriveUrl = gRes.rows[0].gdrive_url || null;
                }

                // If DB has no gdrive_file_id, check Google Drive by filename
                if (!gdriveFileId) {
                    const foundGDrive = await findGoogleDriveFileByName(filename);
                    if (foundGDrive) {
                        gdriveFileId = foundGDrive.fileId;
                        gdriveUrl = foundGDrive.gdriveUrl;
                    }
                }

                if (gdriveFileId) {
                    try {
                        const gdriveBuffer = await downloadFromGoogleDrive(gdriveFileId);
                        if (gdriveBuffer && gdriveBuffer.length > 0) {
                            // Cache locally so subsequent requests are served instantly from disk
                            try {
                                const dir = path.dirname(filePath);
                                if (!fs.existsSync(dir)) {
                                    fs.mkdirSync(dir, { recursive: true });
                                }
                                fs.writeFileSync(filePath, gdriveBuffer);
                                console.log(`[Cache] Successfully downloaded and cached GDrive photo locally at: ${filePath}`);
                            } catch (cacheError) {
                                console.error('Failed to cache GDrive photo locally:', cacheError);
                            }

                            const headers: Record<string, string> = {
                                'Content-Type': 'image/jpeg',
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                            };
                            if (isDownloadMode) {
                                headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(filename))}"`;
                            }

                            return new NextResponse(gdriveBuffer as any, { headers });
                        }
                    } catch (err) {
                        console.warn('[GDrive OAuth Stream Error]', err);
                    }
                }
            } catch (gErr) {
                console.warn('[GDrive Fallback Warning]', gErr);
            }

            // Fallback 2: Attempt to fetch from remote server if not present locally
            const remoteHosts = [
                'http://idlezero.iptime.org:4000',
                'http://ungdong.iptime.org:4000',
                'http://ungdong.iptime.org',
                'http://idlezero.iptime.org'
            ];

            let remoteBuffer: Buffer | null = null;
            let fetchedContentType = '';

            const cookieHeader = req.headers.get('cookie') || '';

            for (const host of remoteHosts) {
                try {
                    const remoteUrl = `${host}/api/photos/view?filename=${encodeURIComponent(filename)}`;
                    const res = await fetch(remoteUrl, {
                        headers: {
                            'Cookie': cookieHeader
                        },
                        redirect: 'manual', // Prevent following redirects to Google Login HTML pages
                        signal: AbortSignal.timeout(3000) // 3 second timeout per attempt
                    });

                    if (res.ok) {
                        const arrayBuffer = await res.arrayBuffer();
                        remoteBuffer = Buffer.from(arrayBuffer);
                        fetchedContentType = res.headers.get('content-type') || 'image/jpeg';
                        
                        // Strict validation: Must be an image
                        if (!fetchedContentType.toLowerCase().includes('image')) {
                            remoteBuffer = null;
                            continue;
                        }

                        // Strict validation: Check magic bytes for JPEG or PNG
                        if (remoteBuffer.length > 3) {
                            const hex = remoteBuffer.subarray(0, 3).toString('hex').toUpperCase();
                            const isJpg = filename.toLowerCase().endsWith('.jpg') || filename.toLowerCase().endsWith('.jpeg');
                            const isPng = filename.toLowerCase().endsWith('.png');
                            
                            if ((isJpg && hex !== 'FFD8FF') || (isPng && hex !== '89504E')) {
                                console.warn(`[Cache Warning] Remote server returned invalid image data (Hex: ${hex}) for ${filename}. Skipping cache.`);
                                remoteBuffer = null;
                                continue;
                            }
                        }

                        // Cache it locally so subsequent requests are served instantly from disk
                        try {
                            const dir = path.dirname(filePath);
                            if (!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            fs.writeFileSync(filePath, remoteBuffer);
                            console.log(`[Cache] Successfully downloaded and cached photo locally at: ${filePath}`);
                        } catch (cacheError) {
                            console.error('Failed to cache remote photo locally:', cacheError);
                        }
                        break;
                    }
                } catch (err) {
                    // Fail silently and try the next host
                }
            }

            if (remoteBuffer) {
                return new NextResponse(remoteBuffer as any, {
                    headers: {
                        'Content-Type': fetchedContentType,
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                    },
                });
            }

            return new NextResponse('File not found', { status: 404 });
        }

        const fileBuffer = fs.readFileSync(filePath);
        
        let contentType = 'image/jpeg';
        if (filePath.toLowerCase().endsWith('.png')) contentType = 'image/png';
        else if (filePath.toLowerCase().endsWith('.webp')) contentType = 'image/webp';
        else if (filePath.toLowerCase().endsWith('.gif')) contentType = 'image/gif';

        const headers: Record<string, string> = {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        };
        if (isDownloadMode) {
            headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`;
        }

        return new NextResponse(fileBuffer, { headers });

    } catch (error) {
        console.error('View Photo Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
