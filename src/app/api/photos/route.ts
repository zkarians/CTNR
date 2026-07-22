import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';
// @ts-ignore
import heicConvert from 'heic-convert';

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

            // Determine if the uploaded file is in HEIC/HEIF format
            const isHeic = ext === '.heic' || ext === '.heif';
            if (isHeic) {
                ext = '.jpg'; // Save as JPEG on disk
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

            // Convert file to buffer and write to disk (converting HEIC to JPEG if needed)
            const bytes = await file.arrayBuffer();
            let buffer: Buffer;

            if (isHeic) {
                try {
                    const converted = await heicConvert({
                        buffer: Buffer.from(bytes),
                        format: 'JPEG',
                        quality: 0.85
                    });
                    buffer = Buffer.from(converted);
                } catch (convError) {
                    console.error("HEIC Conversion failed, saving raw bytes instead:", convError);
                    buffer = Buffer.from(bytes);
                }
            } else {
                buffer = Buffer.from(bytes);
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
                INSERT INTO container_photos (job_id, cntr_no, photo_path, remark, uploaded_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, job_id, cntr_no, photo_path, remark, uploaded_at
            `;
            const values = [jobId, cntrNo, relativeDbPath, remark || '', session.id];
            const res = await client.query(query, values);
            
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
        return NextResponse.json({ error: '서버 오류로 인해 업로드에 실패했습니다.' }, { status: 500 });
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
            params.push(`${startDate} 00:00:00`);
        }

        if (endDate) {
            whereSuffix += ` AND p.uploaded_at AT TIME ZONE 'Asia/Seoul' <= $${paramIdx++}::timestamp`;
            params.push(`${endDate} 23:59:59.999`);
        }

        let targetUserId = userId;
        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';
        if (!isAdmin) {
            targetUserId = session.id;
        }

        if (targetUserId) {
            whereSuffix += ` AND p.uploaded_by = $${paramIdx++}`;
            params.push(targetUserId);
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
                    p.is_completed,
                    p.completed_at,
                    u.name as uploader_name, 
                    u.username as uploader_username, 
                    j.job_name,
                    r.transporter
                FROM container_photos p
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
            
            // Get local file creation/modification times for "file creation date" sorting
            const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
            const photosWithStats = res.rows.map(row => {
                let fileCreatedAt = row.uploaded_at;
                try {
                    const filePath = path.join(uploadsDir, row.photo_path);
                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        fileCreatedAt = stats.mtime || stats.birthtime || row.uploaded_at;
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
                    updateQuery += ` AND uploaded_at >= $${paramIdx}`;
                    params.push(new Date(startDate + 'T00:00:00.000Z'));
                    paramIdx++;
                }

                if (endDate) {
                    updateQuery += ` AND uploaded_at <= $${paramIdx}`;
                    params.push(new Date(endDate + 'T23:59:59.999Z'));
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
                
                if (cntrNo) {
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
