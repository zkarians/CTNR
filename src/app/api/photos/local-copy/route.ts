import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';

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
        const { cntrNos: cntrNosParam, targetPath } = body;

        if (!cntrNosParam || !targetPath) {
            return NextResponse.json({ error: '필수 매개변수가 누락되었습니다.' }, { status: 400 });
        }

        const cntrNos = Array.isArray(cntrNosParam) 
            ? cntrNosParam 
            : cntrNosParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);

        if (cntrNos.length === 0) {
            return NextResponse.json({ error: '선택된 컨테이너가 없습니다.' }, { status: 400 });
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
        let photos: { cntr_no: string; photo_path: string }[] = [];
        try {
            const query = `
                SELECT cntr_no, photo_path 
                FROM container_photos 
                WHERE cntr_no = ANY($1)
                  AND (is_deleted IS NULL OR is_deleted = false)
            `;
            const res = await client.query(query, [cntrNos]);
            photos = res.rows;
        } finally {
            client.release();
        }

        if (photos.length === 0) {
            return NextResponse.json({ error: '선택한 컨테이너에 사진이 없습니다.' }, { status: 404 });
        }

        const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
        let copiedCount = 0;
        let failCount = 0;

        // 2. Copy all files to the target path preserving container folder structure
        for (const photo of photos) {
            const relativePath = photo.photo_path; // e.g. "ECMU4970833/filename.jpg"
            const sourceFilePath = path.resolve(uploadsDir, relativePath);

            if (sourceFilePath.startsWith(uploadsDir) && fs.existsSync(sourceFilePath)) {
                // Determine destination directory and filename
                const containerFolder = photo.cntr_no.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
                const destContainerDir = path.join(resolvedTargetDir, containerFolder);
                
                if (!fs.existsSync(destContainerDir)) {
                    fs.mkdirSync(destContainerDir, { recursive: true });
                }

                const filename = path.basename(relativePath);
                const destFilePath = path.join(destContainerDir, filename);

                try {
                    fs.copyFileSync(sourceFilePath, destFilePath);
                    copiedCount++;
                } catch (copyErr) {
                    console.error(`Failed to copy ${sourceFilePath} to ${destFilePath}:`, copyErr);
                    failCount++;
                }
            } else {
                failCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `성공적으로 ${copiedCount}개 파일을 복사했습니다.${failCount > 0 ? ` (실패: ${failCount}개)` : ''}`,
            copiedCount,
            failCount
        });

    } catch (error: any) {
        console.error('Local Copy Error:', error);
        return NextResponse.json({ error: `서버 오류: ${error.message}` }, { status: 500 });
    }
}
