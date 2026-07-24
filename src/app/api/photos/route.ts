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
        const durationMinutesStr = formData.get('durationMinutes') as string | null;
        const durationMinutes = durationMinutesStr && !isNaN(parseInt(durationMinutesStr, 10)) ? parseInt(durationMinutesStr, 10) : 45;

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
        const containerDir = path.join(uploadsDir, sanitizedCntrNo);
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

            // Count photos uploaded today for this container number to determine sequence
            const countRes = await client.query(
                `SELECT COUNT(*) as count FROM container_photos WHERE cntr_no = $1 AND uploaded_at::date = CURRENT_DATE`,
                [cntrNo]
            );
            const existingCount = parseInt(countRes.rows[0].count, 10);

            // Generate filename in KST: YYYYMMDD_CNTRNO_SEQ.ext
            const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
            const year = kstDate.getFullYear();
            const month = String(kstDate.getMonth() + 1).padStart(2, '0');
            const day = String(kstDate.getDate()).padStart(2, '0');
            const dateStr = `${year}${month}${day}`;

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

            let seqNum = existingCount + 1;
            let filename = `${dateStr}_${sanitizedCntrNo}_${seqNum.toString().padStart(2, '0')}${ext}`;
            let filePath = path.join(containerDir, filename);

            // Prevent filesystem overwrite by incrementing sequence if file already exists
            while (fs.existsSync(filePath)) {
                seqNum++;
                filename = `${dateStr}_${sanitizedCntrNo}_${seqNum.toString().padStart(2, '0')}${ext}`;
                filePath = path.join(containerDir, filename);
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
                INSERT INTO container_photos (job_id, cntr_no, photo_path, remark, uploaded_by, team_id, work_duration_minutes)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, job_id, cntr_no, photo_path, remark, uploaded_at, work_duration_minutes
            `;
            const values = [jobId, cntrNo, relativeDbPath, remark || '', validUploadedBy, session.teamId ?? null, durationMinutes];
            const res = await client.query(query, values);
            
            // Sync durationMinutes & remark to all existing photos for this container
            await client.query(`
                UPDATE container_photos 
                SET work_duration_minutes = $1,
                    remark = COALESCE(NULLIF($2, ''), remark)
                WHERE job_id = $3 AND (cntr_no = $4 OR ($4 = '' AND cntr_no IS NULL)) AND (is_deleted IS NOT TRUE)
            `, [durationMinutes, remark || '', jobId, cntrNo]);

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
        
        if (!showTrash) {
            whereSuffix += ` AND ${showCompleted ? 'p.is_completed = true' : '(p.is_completed IS NULL OR p.is_completed = false)'}`;
        }

        if (startDate) {
            whereSuffix += ` AND p.uploaded_at AT TIME ZONE 'Asia/Seoul' >= $${paramIdx++}::timestamp`;
            params.push(`${startDate} 19:00:00`);
        }

        if (endDate) {
            whereSuffix += ` AND p.uploaded_at AT TIME ZONE 'Asia/Seoul' <= ($${paramIdx++}::date + INTERVAL '1 day 18 hours 59 minutes 59.999 seconds')`;
            params.push(endDate);
        }

        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';
        
        let targetTeamId = teamId;
        if (!isAdmin && !targetTeamId && session.teamId) {
            targetTeamId = String(session.teamId);
        }

        if (targetTeamId) {
            whereSuffix += ` AND p.team_id = $${paramIdx++}`;
            params.push(targetTeamId);
        } else if (userId) {
            whereSuffix += ` AND p.uploaded_by = $${paramIdx++}`;
            params.push(userId);
        }

        if (cntrNo) {
            whereSuffix += ` AND p.cntr_no ILIKE $${paramIdx++}`;
            params.push(`%${cntrNo}%`);
        }

        // Wrap with subquery: inner DISTINCT ON deduplicates rows from 1:N join,
        // outer ORDER BY applies final sort by uploaded_at DESC
        const query = `
            SELECT * FROM (
                SELECT DISTINCT ON (p.id)
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
                    p.completed_at, p.gdrive_file_id, p.gdrive_url,
                    t.name as team_name,
                    COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), '퇴사자') as uploader_name, 
                    COALESCE(u.username, '') as uploader_username, 
                    j.job_name,
                    r.transporter
                FROM container_photos p
                LEFT JOIN teams t ON p.team_id = t.id
                LEFT JOIN "User" u ON p.uploaded_by = u.id
                LEFT JOIN container_jobs j ON p.job_id = j.id
                LEFT JOIN container_results r ON r.job_id = p.job_id AND r.cntr_no = p.cntr_no
                ${whereSuffix}
                ORDER BY p.id
            ) sub
            ORDER BY sub.uploaded_at DESC
        `;

        const client = await pool.connect();
        try {
            const res = await client.query(query, params);
            
            // Get local EXIF / file creation times for "file creation date" sorting
            const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
            const photosWithStats = res.rows.map(row => {
                let fileCreatedAt = row.uploaded_at;
                try {
                    const filePath = path.join(uploadsDir, row.photo_path);
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
                    const containerDir = path.join(uploadsDir, containerFolder);
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
                    params.push(`${startDate} 19:00:00`);
                    paramIdx++;
                }

                if (endDate) {
                    updateQuery += ` AND uploaded_at AT TIME ZONE 'Asia/Seoul' <= ($${paramIdx}::date + INTERVAL '1 day 18 hours 59 minutes 59.999 seconds')`;
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

        // Only admins can restore deleted files from trash.
        if (!isCompleteAction && !isUploadGDriveAction && !isAdmin) {
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

                // If completing, upload to Google Drive, verify, and clean up local disk space
                if (completeVal && targetPhotos.length > 0) {
                    const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
                    
                    // Asynchronously transfer to Google Drive & delete local files
                    (async () => {
                        for (const photo of targetPhotos) {
                            const localPath = path.resolve(uploadsDir, photo.photo_path);
                            const filename = path.basename(photo.photo_path);

                            try {
                                let fileId = photo.gdrive_file_id;
                                let gdriveUrl = photo.gdrive_url;

                                // 1. Upload to Google Drive if not uploaded yet and local file exists
                                if (!fileId && fs.existsSync(localPath)) {
                                    const gRes = await uploadToGoogleDrive(localPath, filename);
                                    fileId = gRes.fileId;
                                    gdriveUrl = gRes.gdriveUrl;

                                    await pool.query(
                                        `UPDATE container_photos SET gdrive_file_id = $1, gdrive_url = $2 WHERE id = $3`,
                                        [fileId, gdriveUrl, photo.id]
                                    );
                                    console.log(`[GDrive Completion Transfer] Photo ${filename} uploaded to Google Drive. File ID: ${fileId}`);
                                }

                                // 2. Verification & Local Cleanup: Delete local file once Google Drive backup is confirmed!
                                if (fileId && fs.existsSync(localPath)) {
                                    fs.unlinkSync(localPath);
                                    console.log(`[Local Disk Cleanup] Verified GDrive backup for ${filename}. Local file deleted, freed disk space!`);
                                }
                            } catch (err) {
                                console.error(`[GDrive Completion Transfer Error] Failed for ${filename}:`, err);
                            }
                        }
                    })();
                }

                return NextResponse.json({
                    success: true,
                    message: completeVal 
                        ? `선택한 컨테이너/사진이 완료로 변경되었습니다. 구글 드라이브로 백업되고 로컬 디스크 용량이 정리됩니다.`
                        : `선택한 컨테이너/사진이 진행 중으로 변경되었습니다.`
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
