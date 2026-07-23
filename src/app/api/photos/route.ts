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

import { uploadToGoogleDrive } from '@/lib/gdrive';

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
            const createdPhotoId = res.rows[0].id;
            
            // Background upload to Google Drive
            uploadToGoogleDrive(filePath, filename)
                .then(gRes => {
                    pool.query(
                        `UPDATE container_photos SET gdrive_file_id = $1, gdrive_url = $2 WHERE id = $3`,
                        [gRes.fileId, gRes.gdriveUrl, createdPhotoId]
                    ).catch(e => console.warn("GDrive DB update error:", e));
                    console.log(`[Google Drive] Photo ${filename} uploaded to Google Drive. File ID: ${gRes.fileId}`);
                })
                .catch(err => {
                    console.warn(`[Google Drive] Background upload warning for ${filename}:`, err);
                });
            
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
                    p.completed_at,
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

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const idsParam = searchParams.get('ids');
        const cntrNo = searchParams.get('cntrNo');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const userId = searchParams.get('userId');
        const permanent = searchParams.get('permanent') === 'true';

        const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean) : null;

        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';

        const client = await pool.connect();
        try {
            if (ids && ids.length > 0) {
                if (permanent) {
                    if (!isAdmin) {
                        return NextResponse.json({ error: '영구 삭제 권한이 없습니다. 관리자만 영구 삭제할 수 있습니다.' }, { status: 403 });
                    }
                    const res = await client.query('SELECT photo_path FROM container_photos WHERE id = ANY($1)', [ids]);
                    const filePaths = res.rows.map(r => r.photo_path);

                    await client.query('DELETE FROM container_photos WHERE id = ANY($1)', [ids]);

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
                        const ownerRes = await client.query('SELECT id FROM container_photos WHERE id = ANY($1) AND uploaded_by = $2', [ids, session.id]);
                        targetIds = ownerRes.rows.map(r => r.id);
                        if (targetIds.length === 0) {
                            return NextResponse.json({ error: '삭제 권한이 있는 본인 소유의 사진이 없습니다.' }, { status: 403 });
                        }
                    }
                    const res = await client.query('UPDATE container_photos SET is_deleted = true, deleted_at = NOW() WHERE id = ANY($1) RETURNING id', [targetIds]);
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

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const idsParam = searchParams.get('ids');
        const cntrNo = searchParams.get('cntrNo');
        const complete = searchParams.get('complete');

        const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean) : null;
        const isCompleteAction = complete !== null;
        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';

        // Only admins can restore deleted files from trash.
        // But anyone logged in can toggle the "completed" status of a container folder.
        if (!isCompleteAction && !isAdmin) {
            return NextResponse.json({ error: '복구 권한이 없습니다. 관리자만 복구할 수 있습니다.' }, { status: 403 });
        }

        const client = await pool.connect();
        try {
            if (isCompleteAction) {
                const completeVal = complete === 'true';
                const completedAt = completeVal ? new Date() : null;
                
                if (ids && ids.length > 0) {
                    await client.query(
                        'UPDATE container_photos SET is_completed = $1, completed_at = $2 WHERE id = ANY($3)',
                        [completeVal, completedAt, ids]
                    );
                    return NextResponse.json({
                        success: true,
                        message: `선택한 사진 ${ids.length}장의 작업이 ${completeVal ? '완료' : '진행 중'}으로 변경되었습니다.`
                    });
                } else if (cntrNo) {
                    await client.query(
                        'UPDATE container_photos SET is_completed = $1, completed_at = $2 WHERE cntr_no = $3',
                        [completeVal, completedAt, cntrNo]
                    );
                    return NextResponse.json({
                        success: true,
                        message: `컨테이너 '${cntrNo}' 폴더의 작업이 ${completeVal ? '완료' : '진행 중'}으로 변경되었습니다.`
                    });
                } else if (id) {
                    await client.query(
                        'UPDATE container_photos SET is_completed = $1, completed_at = $2 WHERE id = $3',
                        [completeVal, completedAt, id]
                    );
                    return NextResponse.json({
                        success: true,
                        message: `사진의 작업이 ${completeVal ? '완료' : '진행 중'}으로 변경되었습니다.`
                    });
                } else {
                    return NextResponse.json({ error: '상태 변경할 대상이 지정되지 않았습니다.' }, { status: 400 });
                }
            } else {
                // Restore deleted files from trash
                if (ids && ids.length > 0) {
                    await client.query('UPDATE container_photos SET is_deleted = false, deleted_at = NULL WHERE id = ANY($1)', [ids]);
                    return NextResponse.json({ success: true, message: `선택한 사진 ${ids.length}장이 복구되었습니다.` });
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
            client.release();
        }
    } catch (error: any) {
        console.error('PATCH Photo Error:', error);
        return NextResponse.json({ error: '서버 오류로 인해 상태 변경에 실패했습니다.' }, { status: 500 });
    }
}
