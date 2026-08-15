
function getLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getWorkDateString(d: Date = new Date()): string {
    const workDate = new Date(d);
    if (workDate.getHours() < 13) {
        workDate.setDate(workDate.getDate() - 1);
    }
    return getLocalDateString(workDate);
}

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getGoogleDriveMd5Batch } from '@/lib/gdrive';

function getFileMd5(filePath: string): string | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(fileBuffer).digest('hex');
    } catch (e) {
        console.error(`Error hashing file ${filePath}:`, e);
        return null;
    }
}

// GET /api/photos/duplicates?cntrNo=...
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const cntrNo = searchParams.get('cntrNo');
        const workDate = searchParams.get('workDate');
        if (!cntrNo) {
            return NextResponse.json({ error: '컨테이너 번호(cntrNo)가 누락되었습니다.' }, { status: 400 });
        }

        const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

        // Fetch all active photos for this container number
        const dbRes = await pool.query(
            `SELECT p.id, p.photo_path, p.uploaded_at, p.cntr_no, p.remark, p.gdrive_file_id
             FROM container_photos p
             WHERE p.cntr_no = $1 AND (p.is_deleted = false OR p.is_deleted IS NULL)
             ORDER BY p.uploaded_at ASC`,
            [cntrNo]
        );

        const photos = dbRes.rows.filter(photo => {
            if (!workDate) return true;
            return getWorkDateString(new Date(photo.uploaded_at)) === workDate;
        });
        
        const hashMap: { [hash: string]: typeof photos } = {};
        const missingLocalPhotos: typeof photos = [];

        for (const photo of photos) {
            const filePath = path.resolve(uploadsDir, photo.photo_path);
            const hash = getFileMd5(filePath);
            if (hash) {
                if (!hashMap[hash]) hashMap[hash] = [];
                hashMap[hash].push(photo);
            } else if (photo.gdrive_file_id) {
                missingLocalPhotos.push(photo);
            }
        }
        
        if (missingLocalPhotos.length > 0) {
            const fileIds = missingLocalPhotos.map(p => p.gdrive_file_id);
            const gdriveMd5Map = await getGoogleDriveMd5Batch(fileIds);
            
            for (const photo of missingLocalPhotos) {
                const hash = gdriveMd5Map[photo.gdrive_file_id];
                if (hash) {
                    if (!hashMap[hash]) hashMap[hash] = [];
                    hashMap[hash].push(photo);
                }
            }
        }

        const duplicateGroups: any[] = [];
        let duplicatesCount = 0;

        for (const [hash, list] of Object.entries(hashMap)) {
            if (list.length > 1) {
                // First uploaded is the original, rest are duplicates
                const original = list[0];
                const duplicates = list.slice(1);
                duplicatesCount += duplicates.length;

                duplicateGroups.push({
                    hash,
                    originalId: original.id,
                    originalPath: original.photo_path,
                    duplicatePhotoIds: duplicates.map(d => d.id),
                    duplicates
                });
            }
        }

        return NextResponse.json({
            success: true,
            duplicatesCount,
            duplicateGroups
        });

    } catch (error: any) {
        console.error('GET Duplicates Error:', error);
        return NextResponse.json({ error: '서버 오류로 인해 중복 사진 검사에 실패했습니다.' }, { status: 500 });
    }
}

// POST /api/photos/duplicates/cleanup
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const singleCntrNo = searchParams.get('cntrNo');

        let foldersToClean: { cntrNo: string; workDate?: string | null }[] = [];

        // Try reading body for bulk action
        try {
            const body = await req.json();
            if (body && Array.isArray(body.folders)) {
                foldersToClean = body.folders;
            } else if (body && Array.isArray(body.cntrNos)) {
                foldersToClean = body.cntrNos.map((c: string) => ({ cntrNo: String(c).trim() }));
            }
        } catch (e) {
            // No body or invalid JSON, fall back to query param
        }

        if (foldersToClean.length === 0 && singleCntrNo) {
            const workDate = searchParams.get('workDate');
            foldersToClean = [{ cntrNo: singleCntrNo.trim(), workDate }];
        }

        if (foldersToClean.length === 0) {
            return NextResponse.json({ error: '중복 정리를 진행할 컨테이너 폴더가 지정되지 않았습니다.' }, { status: 400 });
        }

        const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
        const duplicateIdsToTrash: string[] = [];

        const client = await pool.connect();
        try {
            for (const folder of foldersToClean) {
                // Fetch active photos sorted by upload time
                const dbRes = await client.query(
                    `SELECT p.id, p.photo_path, p.uploaded_at, p.gdrive_file_id
                     FROM container_photos p
                     WHERE p.cntr_no = $1 AND (p.is_deleted = false OR p.is_deleted IS NULL)
                     ORDER BY p.uploaded_at ASC`,
                    [folder.cntrNo]
                );

                const photos = dbRes.rows.filter(photo => {
                    if (!folder.workDate) return true;
                    return getWorkDateString(new Date(photo.uploaded_at)) === folder.workDate;
                });
                const hashMap: { [hash: string]: string[] } = {};
                const missingLocalPhotos: typeof photos = [];

                for (const photo of photos) {
                    const filePath = path.resolve(uploadsDir, photo.photo_path);
                    const hash = getFileMd5(filePath);
                    if (hash) {
                        if (!hashMap[hash]) hashMap[hash] = [];
                        hashMap[hash].push(photo.id);
                    } else if (photo.gdrive_file_id) {
                        missingLocalPhotos.push(photo);
                    }
                }
                
                if (missingLocalPhotos.length > 0) {
                    const fileIds = missingLocalPhotos.map(p => p.gdrive_file_id);
                    const gdriveMd5Map = await getGoogleDriveMd5Batch(fileIds);
                    
                    for (const photo of missingLocalPhotos) {
                        const hash = gdriveMd5Map[photo.gdrive_file_id];
                        if (hash) {
                            if (!hashMap[hash]) hashMap[hash] = [];
                            hashMap[hash].push(photo.id);
                        }
                    }
                }

                // Collect duplicate photo IDs (keep first, trash the rest)
                for (const [_, ids] of Object.entries(hashMap)) {
                    if (ids.length > 1) {
                        duplicateIdsToTrash.push(...ids.slice(1));
                    }
                }
            }

            // Perform batch soft-delete if any duplicates found
            if (duplicateIdsToTrash.length > 0) {
                await client.query(
                    `UPDATE container_photos 
                     SET is_deleted = true, deleted_at = NOW() 
                     WHERE id = ANY($1::uuid[])`,
                    [duplicateIdsToTrash]
                );
            }

            return NextResponse.json({
                success: true,
                cleanedCount: duplicateIdsToTrash.length,
                message: `성공적으로 ${duplicateIdsToTrash.length}개의 중복 사진을 휴지통으로 이동했습니다.`
            });

        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('POST Cleanup Duplicates Error:', error);
        return NextResponse.json({ error: '서버 오류로 인해 중복 사진 정리에 실패했습니다.' }, { status: 500 });
    }
}
