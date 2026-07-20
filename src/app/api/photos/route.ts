import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
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

        // Create uploads folder if it doesn't exist
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
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
            const sanitizedCntrNo = cntrNo.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

            // Determine if the uploaded file is in HEIC/HEIF format
            const isHeic = ext === '.heic' || ext === '.heif';
            if (isHeic) {
                ext = '.jpg'; // Save as JPEG on disk
            }

            let seqNum = existingCount + 1;
            let filename = `${dateStr}_${sanitizedCntrNo}_${seqNum.toString().padStart(2, '0')}${ext}`;
            let filePath = path.join(uploadsDir, filename);

            // Prevent filesystem overwrite by incrementing sequence if file already exists
            while (fs.existsSync(filePath)) {
                seqNum++;
                filename = `${dateStr}_${sanitizedCntrNo}_${seqNum.toString().padStart(2, '0')}${ext}`;
                filePath = path.join(uploadsDir, filename);
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

            const query = `
                INSERT INTO container_photos (job_id, cntr_no, photo_path, remark, uploaded_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, job_id, cntr_no, photo_path, remark, uploaded_at
            `;
            const values = [jobId, cntrNo, filename, remark || '', session.id];
            const res = await client.query(query, values);
            
            return NextResponse.json({
                success: true,
                photo: res.rows[0]
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

        let query = `
            SELECT 
                p.id, 
                p.job_id, 
                p.cntr_no, 
                p.photo_path, 
                p.remark, 
                p.uploaded_at, 
                p.uploaded_by, 
                u.name as uploader_name, 
                u.username as uploader_username, 
                j.job_name
            FROM container_photos p
            LEFT JOIN "User" u ON p.uploaded_by = u.id
            LEFT JOIN container_jobs j ON p.job_id = j.id
            WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIdx = 1;

        if (startDate) {
            query += ` AND p.uploaded_at >= $${paramIdx++}`;
            params.push(new Date(startDate + 'T00:00:00.000Z'));
        }

        if (endDate) {
            query += ` AND p.uploaded_at <= $${paramIdx++}`;
            params.push(new Date(endDate + 'T23:59:59.999Z'));
        }

        let targetUserId = userId;
        if (session.role !== 'admin') {
            targetUserId = session.id;
        }

        if (targetUserId) {
            query += ` AND p.uploaded_by = $${paramIdx++}`;
            params.push(targetUserId);
        }

        query += ` ORDER BY p.uploaded_at DESC`;

        const client = await pool.connect();
        try {
            const res = await client.query(query, params);
            return NextResponse.json({
                success: true,
                photos: res.rows
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

        // Only admin is allowed to delete photos
        if (session.role !== 'admin') {
            return NextResponse.json({ error: '삭제 권한이 없습니다. 관리자만 삭제할 수 있습니다.' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const userId = searchParams.get('userId');

        const client = await pool.connect();
        try {
            if (id) {
                // Fetch photo path to delete from disk
                const res = await client.query('SELECT photo_path FROM container_photos WHERE id = $1', [id]);
                if (res.rows.length === 0) {
                    return NextResponse.json({ error: '사진을 찾을 수 없습니다.' }, { status: 404 });
                }

                const filename = res.rows[0].photo_path;
                const filePath = path.join(process.cwd(), 'uploads', path.basename(filename));

                // Delete from database
                await client.query('DELETE FROM container_photos WHERE id = $1', [id]);

                // Delete from filesystem if it exists
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }

                return NextResponse.json({
                    success: true,
                    message: '사진이 성공적으로 삭제되었습니다.'
                });
            } else {
                // Bulk deletion based on search filters
                if (!startDate && !endDate && !userId) {
                    return NextResponse.json({ error: '일괄 삭제 조건(기간 또는 업로더)이 지정되지 않았습니다.' }, { status: 400 });
                }

                let selectQuery = `SELECT photo_path FROM container_photos WHERE 1=1`;
                let deleteQuery = `DELETE FROM container_photos WHERE 1=1`;
                const params: any[] = [];
                let paramIdx = 1;

                if (startDate) {
                    selectQuery += ` AND uploaded_at >= $${paramIdx}`;
                    deleteQuery += ` AND uploaded_at >= $${paramIdx}`;
                    params.push(new Date(startDate + 'T00:00:00.000Z'));
                    paramIdx++;
                }

                if (endDate) {
                    selectQuery += ` AND uploaded_at <= $${paramIdx}`;
                    deleteQuery += ` AND uploaded_at <= $${paramIdx}`;
                    params.push(new Date(endDate + 'T23:59:59.999Z'));
                    paramIdx++;
                }

                if (userId) {
                    selectQuery += ` AND uploaded_by = $${paramIdx}`;
                    deleteQuery += ` AND uploaded_by = $${paramIdx}`;
                    params.push(userId);
                    paramIdx++;
                }

                // 1. Fetch file paths
                const res = await client.query(selectQuery, params);
                const filePaths = res.rows.map(row => row.photo_path);

                if (filePaths.length === 0) {
                    return NextResponse.json({ error: '해당 조건으로 삭제할 사진이 없습니다.' }, { status: 404 });
                }

                // 2. Delete database records
                await client.query(deleteQuery, params);

                // 3. Delete files from disk
                let deletedFilesCount = 0;
                for (const filename of filePaths) {
                    const filePath = path.join(process.cwd(), 'uploads', path.basename(filename));
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        deletedFilesCount++;
                    }
                }

                return NextResponse.json({
                    success: true,
                    message: `성공적으로 ${filePaths.length}장의 사진 정보를 DB에서 지우고, ${deletedFilesCount}개의 이미지 파일을 일괄 삭제했습니다.`
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
