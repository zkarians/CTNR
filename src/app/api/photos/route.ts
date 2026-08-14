import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';
// @ts-ignore
import heicConvert from 'heic-convert';
// @ts-ignore
import ExifParser from 'exif-parser';
import sharp from 'sharp';

import { uploadToGoogleDrive, findGoogleDriveFileByName } from '@/lib/gdrive';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const jobIdStr = formData.get('jobId') as string | null;
        const cntrNo = formData.get('cntrNo') as string | null;
        const remark = formData.get('remark') as string | null;
        const emptyBoxesStr = formData.get('emptyBoxes') as string | null;
        const durationMinutesStr = formData.get('durationMinutes') as string | null;
        const durationMinutes = durationMinutesStr && !isNaN(parseInt(durationMinutesStr, 10)) ? parseInt(durationMinutesStr, 10) : 45;
        const photoType = (formData.get('photoType') as string | null) || 'normal';
        const lastModifiedStr = formData.get('lastModified') as string | null;

        if (!file || !jobIdStr || !cntrNo) {
            return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
        }

        const jobId = parseInt(jobIdStr, 10);
        if (isNaN(jobId)) {
            return NextResponse.json({ error: '유효하지 않은 Job ID입니다.' }, { status: 400 });
        }

        const sanitizedCntrNo = cntrNo.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

        // Create container-specific folder inside uploads
        const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
        const containerDir = path.join(/*turbopackIgnore: true*/ uploadsDir, sanitizedCntrNo);
        if (!fs.existsSync(containerDir)) {
            fs.mkdirSync(containerDir, { recursive: true });
        }

        // Save metadata to database and determine name sequentially
        const client = await pool.connect();
        try {
            // Verify Job exists to prevent foreign key violation
            const jobCheck = await client.query(`SELECT id FROM container_jobs WHERE id = $1 LIMIT 1`, [jobId]);
            if (jobCheck.rows.length === 0) {
                return NextResponse.json({ error: '해당 작업(Job ID)이 존재하지 않습니다.' }, { status: 404 });
            }

            // Verify User exists to prevent uploaded_by foreign key violation
            let validUploadedBy: string | null = null;
            if (session.id) {
                const userCheck = await client.query(`SELECT id FROM "User" WHERE id::text = $1 OR username = $1 LIMIT 1`, [session.id]);
                if (userCheck.rows.length > 0) {
                    validUploadedBy = userCheck.rows[0].id;
                }
            }

            // Generate filename based on original uploaded filename to preserve sort order (creation time)

            const originalName = file.name;
            let ext = (path.extname(originalName) || '.jpg').toLowerCase();
            const isHeic = ext === '.heic' || ext === '.heif';

            const bytes = await file.arrayBuffer();
            const inputBuffer = Buffer.from(bytes);
            let buffer: Buffer;

            if (isHeic) {
                ext = '.jpg'; // Save converted JPEG on disk
                try {
                    // Primary: Use high-performance sharp to convert HEIC to JPEG with auto-orientation
                    buffer = await sharp(inputBuffer)
                        .rotate()
                        .jpeg({ quality: 85 })
                        .toBuffer();
                } catch (sharpError) {
                    console.error("Sharp HEIC conversion failed, trying heic-convert fallback:", sharpError);
                    try {
                        const converted = await heicConvert({
                            buffer: inputBuffer,
                            format: 'JPEG',
                            quality: 0.85
                        });
                        buffer = Buffer.from(converted);
                    } catch (convError) {
                        console.error("HEIC Conversion completely failed, saving raw bytes:", convError);
                        buffer = inputBuffer;
                        ext = path.extname(originalName).toLowerCase() || '.heic';
                    }
                }
            } else {
                try {
                    // Auto-rotate standard images (e.g. iPhone JPEGs) based on EXIF orientation
                    buffer = await sharp(inputBuffer)
                        .rotate()
                        .toBuffer();
                } catch (e) {
                    buffer = inputBuffer;
                }
            }

            // Determine Smart Timestamp Naming
            let extractedDate: Date | null = null;

            // 1. Try to extract EXIF DateTimeOriginal
            try {
                const metadata = await sharp(inputBuffer).metadata();
                if (metadata.exif) {
                    const exifStr = metadata.exif.toString('utf8');
                    // Look for standard EXIF format YYYY:MM:DD HH:MM:SS
                    const match = exifStr.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
                    if (match) {
                        extractedDate = new Date(
                            parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
                            parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
                        );
                    }
                }
            } catch (e) {
                // Ignore sharp metadata error
            }

            // 2. Try to use lastModified
            if (!extractedDate && lastModifiedStr) {
                const lm = parseInt(lastModifiedStr, 10);
                if (!isNaN(lm)) {
                    extractedDate = new Date(lm);
                }
            }

            // 3. Fallback to current time
            if (!extractedDate || isNaN(extractedDate.getTime())) {
                extractedDate = new Date();
            }

            // Format date to YYYYMMDD_HHMMSS
            const pad = (n: number) => n.toString().padStart(2, '0');
            let baseName = `${extractedDate.getFullYear()}${pad(extractedDate.getMonth() + 1)}${pad(extractedDate.getDate())}_${pad(extractedDate.getHours())}${pad(extractedDate.getMinutes())}${pad(extractedDate.getSeconds())}`;
            
            let filename = `${baseName}${ext}`;
            let filePath = path.join(/*turbopackIgnore: true*/ containerDir, filename);

            let duplicateCount = 1;
            // Prevent filesystem overwrite by incrementing suffix if file exactly matches
            while (fs.existsSync(filePath)) {
                filename = `${baseName}_${duplicateCount}${ext}`;
                filePath = path.join(/*turbopackIgnore: true*/ containerDir, filename);
                duplicateCount++;
            }

            fs.writeFileSync(filePath, buffer);

            const fileHash = crypto.createHash('md5').update(buffer).digest('hex');

            // Scan other active photos in this container to see if this is a duplicate
            const existingPhotosRes = await client.query(
                `SELECT id, photo_path FROM container_photos WHERE cntr_no = $1 AND (is_deleted = false OR is_deleted IS NULL)`,
                [cntrNo]
            );
            let isDuplicate = false;
            let duplicateOfId: string | null = null;
            for (const row of existingPhotosRes.rows) {
                const existingPath = path.resolve(uploadsDir, row.photo_path);
                if (fs.existsSync(existingPath)) {
                    try {
                        const existingHash = crypto.createHash('md5').update(fs.readFileSync(existingPath)).digest('hex');
                        if (existingHash === fileHash) {
                            isDuplicate = true;
                            duplicateOfId = row.id;
                            break;
                        }
                    } catch (e) {
                        // ignore hashing error
                    }
                }
            }

            const relativeDbPath = `${sanitizedCntrNo}/${filename}`;

            const query = `
                INSERT INTO container_photos (job_id, cntr_no, photo_path, remark, uploaded_by, uploader_username, uploader_name, team_id, work_duration_minutes, photo_type)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, job_id, cntr_no, photo_path, remark, uploaded_at, work_duration_minutes, photo_type
            `;
            const values = [jobId, cntrNo, relativeDbPath, remark || '', validUploadedBy, session.username || '', session.name || '', session.teamId ?? null, durationMinutes, photoType];
            const res = await client.query(query, values);
            
            // Sync durationMinutes & remark to all existing photos for this container
            await client.query(`
                UPDATE container_photos 
                SET work_duration_minutes = $1,
                    remark = COALESCE(NULLIF($2, ''), remark)
                WHERE job_id = $3 AND (cntr_no = $4 OR ($4 = '' AND cntr_no IS NULL)) AND (is_deleted IS NOT TRUE)
            `, [durationMinutes, remark || '', jobId, cntrNo]);

            if (emptyBoxesStr !== null) {
                try {
                    const emptyBoxes: {name: string, qty: number}[] = JSON.parse(emptyBoxesStr);
                    if (emptyBoxes.length > 0) {
                        for (const box of emptyBoxes) {
                            await client.query(`
                                INSERT INTO container_empty_boxes (job_id, cntr_no, box_name, qty, is_worker_edited)
                                VALUES ($1, $2, $3, $4, true)
                                ON CONFLICT (job_id, cntr_no, box_name) DO UPDATE 
                                SET qty = EXCLUDED.qty, is_worker_edited = true, updated_at = CURRENT_TIMESTAMP
                            `, [jobId, cntrNo, box.name, box.qty]);
                        }
                        const boxNames = emptyBoxes.map(b => b.name);
                        await client.query(`
                            DELETE FROM container_empty_boxes 
                            WHERE job_id = $1 AND cntr_no = $2 AND box_name != ALL($3)
                        `, [jobId, cntrNo, boxNames]);
                    } else {
                        await client.query(`
                            DELETE FROM container_empty_boxes 
                            WHERE job_id = $1 AND cntr_no = $2
                        `, [jobId, cntrNo]);
                    }
                } catch (e) {
                    console.error("Failed to parse or save emptyBoxes", e);
                }
            }

            return NextResponse.json({
                success: true,
                photo: res.rows[0],
                isDuplicate,
                duplicateOfId
            });
        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('Photo Upload Error:', error);
        return NextResponse.json({ error: `서버 오류로 인해 업로드에 실패했습니다. (${error?.message || '알 수 없는 오류'})` }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate'); // YYYY-MM-DD
        const endDate = searchParams.get('endDate');     // YYYY-MM-DD
        const userId = searchParams.get('userId');       // UUID
        const teamId = searchParams.get('teamId');       // number
        const showTrash = searchParams.get('showTrash') === 'true';
        const showCompleted = searchParams.get('showCompleted') === 'true';
        const cntrNo = searchParams.get('cntrNo');

        // Auto cleanup expired trash photos
        try {
            const retentionDays = parseInt(process.env.TRASH_RETENTION_DAYS || '15', 10);
            const cleanupClient = await pool.connect();
            try {
                const expiredRes = await cleanupClient.query(`
                    SELECT id, photo_path FROM container_photos 
                    WHERE is_deleted = true AND deleted_at < NOW() - INTERVAL '${retentionDays} days'
                `);
                
                if (expiredRes.rows.length > 0) {
                    const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                    for (const row of expiredRes.rows) {
                        const filePath = path.resolve(uploadsDir, row.photo_path);
                        if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }
                    const expiredIds = expiredRes.rows.map(r => r.id);
                    await cleanupClient.query('DELETE FROM container_photos WHERE id = ANY($1)', [expiredIds]);
                    console.log(`[Auto-Cleanup] Permanently deleted ${expiredIds.length} expired photos from trash.`);
                }
            } finally {
                cleanupClient.release();
            }
        } catch (cleanupErr) {
            console.error('[Auto-Cleanup] Error cleaning up expired photos:', cleanupErr);
        }

        // Build WHERE conditions as a suffix to inject into the inner subquery
        const params: any[] = [];
        let paramIdx = 1;
        let whereSuffix = `WHERE ${showTrash ? 'p.is_deleted = true' : '(p.is_deleted IS NULL OR p.is_deleted = false)'}`;
        
        // 특정 컨테이너 번호(cntrNo)로 검색/조회 시 완료 여부, 날짜, 조 제한 없이 전체 사진 조회 허용
        if (!showTrash && !cntrNo) {
            whereSuffix += ` AND ${showCompleted ? 'p.is_completed = true' : '(p.is_completed IS NULL OR p.is_completed = false)'}`;
        }

        if (startDate && !cntrNo) {
            whereSuffix += ` AND p.uploaded_at AT TIME ZONE 'Asia/Seoul' >= $${paramIdx++}::timestamp`;
            params.push(`${startDate} 13:00:00`);
        }

        if (endDate && !cntrNo) {
            whereSuffix += ` AND p.uploaded_at AT TIME ZONE 'Asia/Seoul' <= ($${paramIdx++}::date + INTERVAL '1 day 12 hours 59 minutes 59.999 seconds')`;
            params.push(endDate);
        }

        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';
        
        let targetTeamId = teamId;
        if (!isAdmin && !targetTeamId && session.teamId) {
            targetTeamId = String(session.teamId);
        }

        if (cntrNo) {
            whereSuffix += ` AND p.cntr_no ILIKE $${paramIdx++}`;
            params.push(`%${cntrNo}%`);
        } else if (targetTeamId) {
            whereSuffix += ` AND p.team_id = $${paramIdx++}`;
            params.push(targetTeamId);
        } else if (userId) {
            whereSuffix += ` AND p.uploaded_by = $${paramIdx++}`;
            params.push(userId);
        }

        const query = `
            SELECT 
                p.id, 
                p.job_id, 
                p.cntr_no, 
                p.photo_path, 
                p.remark, 
                p.uploaded_at, 
                p.uploaded_by, 
                p.team_id,
                p.work_duration_minutes,
                p.is_completed,
                p.photo_type,
                p.completed_at, p.gdrive_file_id, p.gdrive_url,
                t.name as team_name,
                COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), NULLIF(p.uploader_name, ''), '퇴사자') as uploader_name, 
                COALESCE(u.username, p.uploader_username, '') as uploader_username, 
                j.job_name,
                (SELECT transporter FROM container_results WHERE cntr_no = p.cntr_no LIMIT 1) as transporter
            FROM container_photos p
            LEFT JOIN teams t ON p.team_id = t.id
            LEFT JOIN "User" u ON u.id = p.uploaded_by
            LEFT JOIN container_jobs j ON p.job_id = j.id
            ${whereSuffix}
            ORDER BY p.uploaded_at DESC
        `;

        const client = await pool.connect();
        try {
            const res = await client.query(query, params);
            
            // Get local EXIF / file creation times for "file creation date" sorting
            const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
            const photosWithStats = res.rows.map(row => {
                let fileCreatedAt = row.uploaded_at;
                try {
                    const filePath = path.join(/*turbopackIgnore: true*/ uploadsDir, row.photo_path);
                    if (fs.existsSync(filePath)) {
                        let parsedExif = false;
                        try {
                            const fd = fs.openSync(filePath, 'r');
                            const buffer = Buffer.alloc(65536);
                            const bytesRead = fs.readSync(fd, buffer, 0, 65536, 0);
                            fs.closeSync(fd);

                            const parser = ExifParser.create(buffer.slice(0, bytesRead));
                            const result = parser.parse();
                            if (result && result.tags) {
                                const timestamp = result.tags.DateTimeOriginal || result.tags.CreateDate || result.tags.ModifyDate;
                                if (timestamp) {
                                    fileCreatedAt = new Date(timestamp * 1000).toISOString();
                                    parsedExif = true;
                                }
                            }
                        } catch (exifErr) {
                            // Non-JPEG or missing EXIF header
                        }

                        if (!parsedExif) {
                            const stats = fs.statSync(filePath);
                            fileCreatedAt = stats.mtime || stats.birthtime || row.uploaded_at;
                        }
                    }
                } catch (e) {
                    // Ignore error and fallback to database time
                }
                return {
                    ...row,
                    file_created_at: fileCreatedAt
                };
            });

            return NextResponse.json({
                success: true,
                photos: photosWithStats
            });
        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('Fetch Photos Error:', error);
        return NextResponse.json({ error: '서버 오류로 인해 사진 목록 조회에 실패했습니다.' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        const { searchParams } = new URL(req.url);
        const idParam = body.id !== undefined ? String(body.id) : searchParams.get('id');
        const id = idParam ? idParam.trim() : null;

        let ids: string[] | null = null;
        if (Array.isArray(body.ids)) {
            ids = body.ids.map((s: any) => String(s).trim()).filter(Boolean);
        } else {
            const idsParam = searchParams.get('ids');
            ids = idsParam ? idsParam.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
        }

        const cntrNo = body.cntrNo || searchParams.get('cntrNo');
        const startDate = body.startDate || searchParams.get('startDate');
        const endDate = body.endDate || searchParams.get('endDate');
        const userId = body.userId || searchParams.get('userId');
        const permanent = body.permanent === true || searchParams.get('permanent') === 'true';

        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';

        const client = await pool.connect();
        try {
            if (ids && ids.length > 0) {
                if (permanent) {
                    if (!isAdmin) {
                        return NextResponse.json({ error: '영구 삭제 권한이 없습니다. 관리자만 영구 삭제할 수 있습니다.' }, { status: 403 });
                    }
                    const res = await client.query('SELECT photo_path FROM container_photos WHERE id = ANY($1::uuid[])', [ids]);
                    const filePaths = res.rows.map(r => r.photo_path);

                    await client.query('DELETE FROM container_photos WHERE id = ANY($1::uuid[])', [ids]);

                    const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                    let deletedFilesCount = 0;
                    for (const filename of filePaths) {
                        const filePath = path.resolve(uploadsDir, filename);
                        if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            deletedFilesCount++;
                        }
                    }

                    return NextResponse.json({
                        success: true,
                        message: `선택한 사진 ${ids.length}장이 영구 삭제되었습니다.`
                    });
                } else {
                    let targetIds = ids;
                    if (!isAdmin) {
                        const ownerRes = await client.query('SELECT id FROM container_photos WHERE id = ANY($1::uuid[]) AND uploaded_by = $2', [ids, session.id]);
                        targetIds = ownerRes.rows.map(r => r.id);
                        if (targetIds.length === 0) {
                            return NextResponse.json({ error: '삭제 권한이 있는 본인 소유의 사진이 없습니다.' }, { status: 403 });
                        }
                    }
                    const res = await client.query('UPDATE container_photos SET is_deleted = true, deleted_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING id', [targetIds]);
                    return NextResponse.json({
                        success: true,
                        message: `선택한 사진 ${res.rows.length}장이 휴지통으로 이동되었습니다.`
                    });
                }
            } else if (id) {
                // Get the photo to check ownership
                const ownerRes = await client.query('SELECT uploaded_by FROM container_photos WHERE id = $1', [id]);
                if (ownerRes.rows.length === 0) {
                    return NextResponse.json({ error: '사진을 찾을 수 없습니다.' }, { status: 404 });
                }
                const uploadedBy = ownerRes.rows[0].uploaded_by;
                const isOwner = uploadedBy === session.id;

                if (!isAdmin && !isOwner) {
                    return NextResponse.json({ error: '삭제 권한이 없습니다. 본인이 올린 사진이거나 관리자만 삭제할 수 있습니다.' }, { status: 403 });
                }

                if (permanent) {
                    // Physical Hard Delete
                    if (!isAdmin) {
                        return NextResponse.json({ error: '영구 삭제 권한이 없습니다. 관리자만 영구 삭제할 수 있습니다.' }, { status: 403 });
                    }
                    const filename = ownerRes.rows[0].photo_path;
                    const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                    const filePath = path.resolve(uploadsDir, filename);

                    // Prevent directory traversal
                    if (!filePath.startsWith(uploadsDir)) {
                        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
                    }

                    await client.query('DELETE FROM container_photos WHERE id = $1', [id]);

                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }

                    return NextResponse.json({
                        success: true,
                        message: '사진이 영구 삭제되었습니다.'
                    });
                } else {
                    // Soft Delete to Trash
                    const res = await client.query('UPDATE container_photos SET is_deleted = true, deleted_at = NOW() WHERE id = $1 RETURNING id', [id]);
                    if (res.rows.length === 0) {
                        return NextResponse.json({ error: '사진을 찾을 수 없습니다.' }, { status: 404 });
                    }
                    return NextResponse.json({
                        success: true,
                        message: '사진이 휴지통으로 이동되었습니다.'
                    });
                }
            } else if (cntrNo) {
                if (!isAdmin) {
                    return NextResponse.json({ error: '삭제 권한이 없습니다. 관리자만 폴더 전체를 삭제할 수 있습니다.' }, { status: 403 });
                }
                if (permanent) {
                    // Physical Hard Delete
                    const selectQuery = `SELECT photo_path FROM container_photos WHERE cntr_no = $1`;
                    const deleteQuery = `DELETE FROM container_photos WHERE cntr_no = $1`;

                    const res = await client.query(selectQuery, [cntrNo]);
                    const filePaths = res.rows.map(row => row.photo_path);

                    if (filePaths.length === 0) {
                        return NextResponse.json({ error: '해당 컨테이너의 사진이 존재하지 않습니다.' }, { status: 404 });
                    }

                    await client.query(deleteQuery, [cntrNo]);

                    let deletedFilesCount = 0;
                    const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                    for (const filename of filePaths) {
                        const filePath = path.resolve(uploadsDir, filename);
                        if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            deletedFilesCount++;
                        }
                    }

                    const containerFolder = cntrNo.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                    const containerDir = path.join(/*turbopackIgnore: true*/ uploadsDir, containerFolder);
                    if (fs.existsSync(containerDir) && fs.readdirSync(containerDir).length === 0) {
                        fs.rmdirSync(containerDir);
                    }

                    return NextResponse.json({
                        success: true,
                        message: `성공적으로 컨테이너 '${cntrNo}' 폴더의 사진 ${filePaths.length}장을 영구 삭제했습니다.`
                    });
                } else {
                    // Soft Delete to Trash
                    const res = await client.query('UPDATE container_photos SET is_deleted = true, deleted_at = NOW() WHERE cntr_no = $1 RETURNING id', [cntrNo]);
                    if (res.rows.length === 0) {
                        return NextResponse.json({ error: '해당 컨테이너의 사진이 존재하지 않습니다.' }, { status: 404 });
                    }
                    return NextResponse.json({
                        success: true,
                        message: `컨테이너 '${cntrNo}' 폴더의 사진 ${res.rows.length}장이 휴지통으로 이동되었습니다.`
                    });
                }
            } else {
                // Bulk deletion (soft delete only to prevent accidents)
                if (!startDate && !endDate && !userId) {
                    return NextResponse.json({ error: '일괄 삭제 조건(기간 또는 업로더)이 지정되지 않았습니다.' }, { status: 400 });
                }

                let updateQuery = `UPDATE container_photos SET is_deleted = true, deleted_at = NOW() WHERE (is_deleted IS NULL OR is_deleted = false)`;
                const params: any[] = [];
                let paramIdx = 1;

                if (startDate) {
                    updateQuery += ` AND uploaded_at AT TIME ZONE 'Asia/Seoul' >= $${paramIdx}::timestamp`;
                    params.push(`${startDate} 13:00:00`);
                    paramIdx++;
                }

                if (endDate) {
                    updateQuery += ` AND uploaded_at AT TIME ZONE 'Asia/Seoul' <= ($${paramIdx}::date + INTERVAL '1 day 12 hours 59 minutes 59.999 seconds')`;
                    params.push(endDate);
                    paramIdx++;
                }

                if (userId) {
                    updateQuery += ` AND uploaded_by = $${paramIdx}`;
                    params.push(userId);
                    paramIdx++;
                }

                const res = await client.query(updateQuery, params);
                return NextResponse.json({
                    success: true,
                    message: `성공적으로 ${res.rowCount}장의 사진을 휴지통으로 이동시켰습니다.`
                });
            }
        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('Delete Photo Error:', error);
        return NextResponse.json({ error: '서버 오류로 인해 사진 삭제에 실패했습니다.' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        const { searchParams } = new URL(req.url);
        const idParam = body.id !== undefined ? String(body.id) : searchParams.get('id');
        const id = idParam ? idParam.trim() : null;

        let ids: string[] | null = null;
        if (Array.isArray(body.ids)) {
            ids = body.ids.map((s: any) => String(s).trim()).filter(Boolean);
        } else {
            const idsParam = searchParams.get('ids');
            ids = idsParam ? idsParam.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
        }

        const cntrNo = body.cntrNo || searchParams.get('cntrNo');
        const cntrNosParam: string[] | null = Array.isArray(body.cntrNos) ? body.cntrNos.map((s: any) => String(s).trim()).filter(Boolean) : null;
        const completeParam = body.complete !== undefined ? body.complete : searchParams.get('complete');
        const isCompleteAction = completeParam !== null && completeParam !== undefined;
        const completeVal = completeParam === true || completeParam === 'true';
        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';

        const action = body.action || searchParams.get('action');
        const isUploadGDriveAction = action === 'upload_gdrive';
        const isRotateAction = action === 'rotate';
        const isMoveContainerAction = action === 'move_container';

        // Only admins or normal users with complete/move/gdrive actions
        if (!isCompleteAction && !isUploadGDriveAction && !isMoveContainerAction && !isRotateAction && !isAdmin) {
            return NextResponse.json({ error: '복구 권한이 없습니다. 관리자만 복구할 수 있습니다.' }, { status: 403 });
        }

        const client = await pool.connect();
        let clientReleased = false;
        const releaseClient = () => {
            if (!clientReleased) {
                clientReleased = true;
                try {
                    client.release();
                } catch {
                    // ignore double release
                }
            }
        };

        try {
if (isRotateAction) {
                if (!ids || ids.length === 0) {
                    return NextResponse.json({ error: '회전할 사진 ID가 제공되지 않았습니다.' }, { status: 400 });
                }
                const degrees = Number(body.degrees) || 90;

                let targetIds = ids;
                if (!isAdmin) {
                    const ownerRes = await client.query('SELECT id FROM container_photos WHERE id = ANY($1::uuid[]) AND uploaded_by = $2', [ids, session.id]);
                    targetIds = ownerRes.rows.map((r: any) => r.id);
                    if (targetIds.length === 0) {
                        return NextResponse.json({ error: '회전 권한이 있는 본인 소유의 사진이 없습니다.' }, { status: 403 });
                    }
                }

                const res = await client.query('SELECT id, photo_path, gdrive_file_id FROM container_photos WHERE id = ANY($1::uuid[])', [targetIds]);
                
                const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                let rotatedCount = 0;
                let skippedCount = 0;

                for (const row of res.rows) {
                    // Skip if backed up to GDrive (local file is likely deleted)
                    if (row.gdrive_file_id) {
                        skippedCount++;
                        continue;
                    }

                    const localPath = path.resolve(uploadsDir, row.photo_path);
                    if (fs.existsSync(localPath)) {
                        try {
                            const buffer = await sharp(localPath).rotate(degrees).toBuffer();
                            fs.writeFileSync(localPath, buffer);
                            rotatedCount++;
                        } catch (err) {
                            console.error(`[Rotate Error] Failed to rotate ${row.photo_path}:`, err);
                            skippedCount++;
                        }
                    } else {
                        skippedCount++;
                    }
                }

                // Add random query param to photo_path to bust browser cache
                // But wait, the file path in DB shouldn't change, we just need to append a query param in the frontend.
                // However, updating updated_at will allow frontend to know it changed. We don't have updated_at column?
                // We can just update uploaded_at to NOW() or add a dummy update to trigger something. But for now, we just return success.
                // It's better to update a timestamp or just return success and let frontend append a query param like ?t=Date.now()

                return NextResponse.json({
                    success: true,
                    rotatedCount,
                    skippedCount,
                    message: `${rotatedCount}장의 사진을 회전했습니다.` + (skippedCount > 0 ? ` (${skippedCount}장 건너뜀)` : '')
                });
            }

            if (isMoveContainerAction) {
                const targetCntrNo = (body.targetCntrNo || body.newCntrNo || '').trim().toUpperCase();
                if (!targetCntrNo) {
                    releaseClient();
                    return NextResponse.json({ error: '이동할 목표 컨테이너 번호를 입력해 주세요.' }, { status: 400 });
                }
                if (!ids || ids.length === 0) {
                    releaseClient();
                    return NextResponse.json({ error: '이동할 사진이 선택되지 않았습니다.' }, { status: 400 });
                }

                // Fetch photos to move
                const pRes = await client.query(
                    `SELECT id, photo_path, cntr_no FROM container_photos WHERE id = ANY($1::uuid[]) AND (is_deleted IS NOT TRUE)`,
                    [ids]
                );
                const targetPhotos = pRes.rows;

                if (targetPhotos.length === 0) {
                    releaseClient();
                    return NextResponse.json({ error: '이동할 대상 사진을 찾을 수 없습니다.' }, { status: 404 });
                }

                const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                const targetDir = path.resolve(uploadsDir, targetCntrNo);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                let movedCount = 0;
                for (const photo of targetPhotos) {
                    const oldLocalPath = path.resolve(uploadsDir, photo.photo_path);
                    const filename = path.basename(photo.photo_path);
                    const newRelativePath = `${targetCntrNo}/${filename}`;
                    const newLocalPath = path.resolve(uploadsDir, newRelativePath);

                    // Move physical file on disk if exists
                    if (fs.existsSync(oldLocalPath)) {
                        try {
                            fs.renameSync(oldLocalPath, newLocalPath);
                        } catch (err) {
                            console.warn(`[Move File Failover] fs.renameSync failed, falling back to copy+unlink for ${filename}:`, err);
                            fs.copyFileSync(oldLocalPath, newLocalPath);
                            fs.unlinkSync(oldLocalPath);
                        }
                    }

                    // Update DB record
                    await client.query(
                        `UPDATE container_photos SET cntr_no = $1, photo_path = $2 WHERE id = $3`,
                        [targetCntrNo, newRelativePath, photo.id]
                    );
                    movedCount++;
                }

                releaseClient();
                return NextResponse.json({
                    success: true,
                    message: `사진 ${movedCount}장이 컨테이너 '${targetCntrNo}'(으)로 이동되었습니다.`
                });
            }

            if (isUploadGDriveAction) {
                let targetPhotos: any[] = [];
                if (ids && ids.length > 0) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE id = ANY($1::uuid[]) AND (is_deleted IS NOT TRUE) ORDER BY cntr_no ASC, photo_path ASC`, [ids]);
                    targetPhotos = pRes.rows;
                } else if (cntrNosParam && cntrNosParam.length > 0) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE cntr_no = ANY($1::text[]) AND (is_deleted IS NOT TRUE) ORDER BY cntr_no ASC, photo_path ASC`, [cntrNosParam]);
                    targetPhotos = pRes.rows;
                } else if (cntrNo) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE cntr_no = $1 AND (is_deleted IS NOT TRUE) ORDER BY photo_path ASC`, [cntrNo]);
                    targetPhotos = pRes.rows;
                } else if (id) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE id = $1 AND (is_deleted IS NOT TRUE)`, [id]);
                    targetPhotos = pRes.rows;
                }

                if (targetPhotos.length === 0) {
                    releaseClient();
                    return NextResponse.json({ error: '업로드 및 정리할 대상 사진이 없습니다.' }, { status: 400 });
                }

                // Release client back to pool early so long streaming loops use pool.query safely
                releaseClient();

                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    async start(controller) {
                        const sendEvent = (data: any) => {
                            try {
                                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
                            } catch {
                                // Ignore controller enqueue errors if client disconnected
                            }
                        };

                        const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                        let uploadedCount = 0;
                        let skippedCount = 0;
                        let cleanedCount = 0;
                        let freedBytes = 0;
                        const total = targetPhotos.length;

                        const alreadyDoneCount = targetPhotos.filter(p => !!p.gdrive_file_id).length;
                        sendEvent({ type: 'start', total, alreadyDoneCount });

                        try {
                            for (let i = 0; i < total; i++) {
                                const photo = targetPhotos[i];
                                const localPath = path.resolve(uploadsDir, photo.photo_path);
                                const filename = path.basename(photo.photo_path);

                                let fileId = photo.gdrive_file_id;
                                let gdriveUrl = photo.gdrive_url;

                                // If DB has no fileId and local file is missing, check if it already exists on Google Drive!
                                if (!fileId && !fs.existsSync(localPath)) {
                                    const foundGDrive = await findGoogleDriveFileByName(filename);
                                    if (foundGDrive) {
                                        fileId = foundGDrive.fileId;
                                        gdriveUrl = foundGDrive.gdriveUrl;
                                        await pool.query(
                                            `UPDATE container_photos SET gdrive_file_id = $1, gdrive_url = $2 WHERE id = $3`,
                                            [fileId, gdriveUrl, photo.id]
                                        );
                                        console.log(`[GDrive Auto-Recovered] Restored gdrive_file_id for ${filename}: ${fileId}`);
                                    }
                                }

                                if (!fileId && fs.existsSync(localPath)) {
                                    try {
                                        sendEvent({ 
                                            type: 'progress', 
                                            current: i + 1, 
                                            total, 
                                            percent: Math.round(((i + 1) / total) * 100), 
                                            currentFile: filename, 
                                            status: 'UPLOADING',
                                            uploadedCount,
                                            skippedCount,
                                            cleanedCount,
                                            freedMB: (freedBytes / (1024 * 1024)).toFixed(1)
                                        });

                                        // Auto-retry up to 3 times for transient network glitches
                                        let gRes: any = null;
                                        let lastErr: any = null;
                                        for (let attempt = 1; attempt <= 3; attempt++) {
                                            try {
                                                gRes = await uploadToGoogleDrive(localPath, filename);
                                                break;
                                            } catch (retryErr: any) {
                                                lastErr = retryErr;
                                                console.warn(`[GDrive Retry ${attempt}/3] ${filename}:`, retryErr?.message || retryErr);
                                                if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
                                            }
                                        }

                                        if (!gRes) throw lastErr || new Error("Google Drive upload failed after 3 retries");

                                        fileId = gRes.fileId;
                                        gdriveUrl = gRes.gdriveUrl;

                                        await pool.query(
                                            `UPDATE container_photos SET gdrive_file_id = $1, gdrive_url = $2 WHERE id = $3`,
                                            [fileId, gdriveUrl, photo.id]
                                        );
                                        uploadedCount++;
                                    } catch (err: any) {
                                        console.error(`[GDrive Sync Error] ${filename}:`, err);
                                        sendEvent({ type: 'error', filename, error: err?.message || String(err) });
                                    }
                                } else if (fileId) {
                                    skippedCount++;
                                }

                                if (fileId && fs.existsSync(localPath)) {
                                    try {
                                        const stat = fs.statSync(localPath);
                                        freedBytes += stat.size;
                                        fs.unlinkSync(localPath);
                                        cleanedCount++;
                                    } catch (unlinkErr) {
                                        console.error(`[Local Cleanup Error] ${filename}:`, unlinkErr);
                                    }
                                }

                                const freedMB = (freedBytes / (1024 * 1024)).toFixed(1);
                                sendEvent({ 
                                    type: 'progress', 
                                    current: i + 1, 
                                    total, 
                                    percent: Math.round(((i + 1) / total) * 100), 
                                    currentFile: filename, 
                                    status: 'DONE',
                                    uploadedCount,
                                    skippedCount,
                                    cleanedCount,
                                    freedMB 
                                });
                            }

                            const finalFreedMB = (freedBytes / (1024 * 1024)).toFixed(1);
                            sendEvent({
                                type: 'done',
                                total,
                                uploadedCount,
                                skippedCount,
                                cleanedCount,
                                freedMB: finalFreedMB,
                                message: `🎉 총 ${total}장 백업 및 정리 작업 완료!\n(신규 백업 ${uploadedCount}장 / 기존 보관 스킵 ${skippedCount}장 / 로컬 디스크 ${finalFreedMB}MB 공간 확보)`
                            });
                        } catch (err: any) {
                            sendEvent({ type: 'fatal_error', error: err?.message || String(err) });
                        } finally {
                            releaseClient();
                            try {
                                controller.close();
                            } catch {
                                // ignore
                            }
                        }
                    }
                });

                return new Response(stream, {
                    headers: {
                        'Content-Type': 'application/x-ndjson; charset=utf-8',
                        'Cache-Control': 'no-cache, no-transform',
                        'X-Content-Type-Options': 'nosniff'
                    }
                });
            }

        if (isCompleteAction) {
                const completedAt = completeVal ? new Date() : null;
                
                // Fetch target photos
                let targetPhotos: any[] = [];
                if (ids && ids.length > 0) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE id = ANY($1::uuid[]) AND (is_deleted IS NOT TRUE)`, [ids]);
                    targetPhotos = pRes.rows;
                } else if (cntrNosParam && cntrNosParam.length > 0) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE cntr_no = ANY($1::text[]) AND (is_deleted IS NOT TRUE)`, [cntrNosParam]);
                    targetPhotos = pRes.rows;
                } else if (cntrNo) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE cntr_no = $1 AND (is_deleted IS NOT TRUE)`, [cntrNo]);
                    targetPhotos = pRes.rows;
                } else if (id) {
                    const pRes = await client.query(`SELECT id, photo_path, cntr_no, gdrive_file_id, gdrive_url FROM container_photos WHERE id = $1 AND (is_deleted IS NOT TRUE)`, [id]);
                    targetPhotos = pRes.rows;
                }

                // Update is_completed status
                if (ids && ids.length > 0) {
                    await client.query('UPDATE container_photos SET is_completed = $1, completed_at = $2 WHERE id = ANY($3::uuid[])', [completeVal, completedAt, ids]);
                } else if (cntrNosParam && cntrNosParam.length > 0) {
                    await client.query('UPDATE container_photos SET is_completed = $1, completed_at = $2 WHERE cntr_no = ANY($3::text[])', [completeVal, completedAt, cntrNosParam]);
                } else if (cntrNo) {
                    await client.query('UPDATE container_photos SET is_completed = $1, completed_at = $2 WHERE cntr_no = $3', [completeVal, completedAt, cntrNo]);
                } else if (id) {
                    await client.query('UPDATE container_photos SET is_completed = $1, completed_at = $2 WHERE id = $3', [completeVal, completedAt, id]);
                }

                return NextResponse.json({
                    success: true,
                    message: completeVal 
                        ? `선택한 컨테이너/사진이 완료 상태로 변경되었습니다.`
                        : `선택한 컨테이너/사진이 진행 중 상태로 변경되었습니다.`
                });
            } else {
                // Restore deleted files from trash
                if (ids && ids.length > 0) {
                    await client.query('UPDATE container_photos SET is_deleted = false, deleted_at = NULL WHERE id = ANY($1::uuid[])', [ids]);
                    return NextResponse.json({ success: true, message: `선택한 사진 ${ids.length}장이 복구되었습니다.` });
                } else if (cntrNosParam && cntrNosParam.length > 0) {
                    await client.query('UPDATE container_photos SET is_deleted = false, deleted_at = NULL WHERE cntr_no = ANY($1::text[])', [cntrNosParam]);
                    return NextResponse.json({ success: true, message: `선택한 컨테이너 ${cntrNosParam.length}개의 사진이 복구되었습니다.` });
                } else if (id) {
                    await client.query('UPDATE container_photos SET is_deleted = false, deleted_at = NULL WHERE id = $1', [id]);
                    return NextResponse.json({ success: true, message: '사진이 복구되었습니다.' });
                } else if (cntrNo) {
                    await client.query('UPDATE container_photos SET is_deleted = false, deleted_at = NULL WHERE cntr_no = $1', [cntrNo]);
                    return NextResponse.json({ success: true, message: `컨테이너 '${cntrNo}' 폴더의 모든 사진이 복구되었습니다.` });
                } else {
                    return NextResponse.json({ error: '복구할 대상이 지정되지 않았습니다.' }, { status: 400 });
                }
            }
        } finally {
            releaseClient();
        }
    } catch (error: any) {
        console.error('PATCH Photo Error:', error);
        return NextResponse.json({ error: `서버 오류: ${error.message || '상태 변경에 실패했습니다.'}` }, { status: 500 });
    }
}

export const PUT = PATCH;
