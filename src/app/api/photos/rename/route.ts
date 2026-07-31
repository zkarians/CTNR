import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { renameGoogleDriveFile } from '@/lib/gdrive';

export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
        }

        const body = await req.json();
        const { photoId, newFilename } = body;

        if (!photoId || !newFilename) {
            return NextResponse.json({ error: '사진 ID와 새로운 파일 이름이 필요합니다.' }, { status: 400 });
        }

        // Validate filename (allow letters, numbers, spaces, korean, basic symbols)
        const sanitizedName = newFilename.replace(/[^a-zA-Z0-9_\-\.가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, '_').trim();
        if (!sanitizedName) {
            return NextResponse.json({ error: '유효하지 않은 파일 이름입니다.' }, { status: 400 });
        }

        const client = await pool.connect();
        try {
            // Find photo
            const res = await client.query(
                `SELECT id, photo_path, cntr_no, gdrive_file_id FROM container_photos WHERE id = $1`,
                [photoId]
            );
            
            if (res.rows.length === 0) {
                return NextResponse.json({ error: '해당 사진을 찾을 수 없습니다.' }, { status: 404 });
            }

            const photo = res.rows[0];
            const oldPath = photo.photo_path; // e.g. CNTRNO/filename.jpg
            const oldExt = path.extname(oldPath);
            const folderPath = path.dirname(oldPath); // e.g. CNTRNO

            // Ensure new name has correct extension
            const finalFilename = sanitizedName.toLowerCase().endsWith(oldExt.toLowerCase()) 
                ? sanitizedName 
                : `${sanitizedName}${oldExt}`;
            
            const newPhotoPath = path.posix.join(folderPath, finalFilename); // CNTRNO/newfilename.jpg

            if (oldPath === newPhotoPath) {
                return NextResponse.json({ success: true, photoPath: oldPath }); // Nothing changed
            }

            // Check if new name already exists in DB for this container
            const dupCheck = await client.query(
                `SELECT id FROM container_photos WHERE photo_path = $1 AND (is_deleted = false OR is_deleted IS NULL)`,
                [newPhotoPath]
            );
            if (dupCheck.rows.length > 0) {
                return NextResponse.json({ error: '동일한 이름의 파일이 이미 존재합니다.' }, { status: 409 });
            }

            // 1. Rename locally if exists
            const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
            const oldLocalPath = path.resolve(uploadsDir, oldPath);
            const newLocalPath = path.resolve(uploadsDir, newPhotoPath);
            
            if (fs.existsSync(oldLocalPath)) {
                fs.renameSync(oldLocalPath, newLocalPath);
            }

            // 2. Rename on GDrive if exists
            if (photo.gdrive_file_id) {
                const gdriveSuccess = await renameGoogleDriveFile(photo.gdrive_file_id, finalFilename);
                if (!gdriveSuccess) {
                    console.warn(`Failed to rename on GDrive: ${photo.gdrive_file_id}`);
                }
            }

            // 3. Update DB
            await client.query(
                `UPDATE container_photos SET photo_path = $1 WHERE id = $2`,
                [newPhotoPath, photoId]
            );

            return NextResponse.json({ success: true, photoPath: newPhotoPath, newFilename: finalFilename });

        } finally {
            client.release();
        }

    } catch (error: any) {
        console.error('Rename Photo Error:', error);
        return NextResponse.json({ error: '파일 이름 변경 중 오류가 발생했습니다.' }, { status: 500 });
    }
}
