import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Only ADMIN/MANAGER can download bulk zip
        const sessionRole = session.role?.toUpperCase();
        const isAdmin = sessionRole === 'ADMIN' || sessionRole === 'MANAGER';
        if (!isAdmin) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const idsParam = searchParams.get('ids');
        const cntrNosParam = searchParams.get('cntrNos'); // comma-separated container numbers
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const userId = searchParams.get('userId');

        if (!cntrNosParam && !idsParam) {
            return new NextResponse('No containers or IDs specified', { status: 400 });
        }

        const client = await pool.connect();
        let photos: { cntr_no: string; photo_path: string }[] = [];
        try {
            if (idsParam) {
                const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
                const res = await client.query(
                    `SELECT cntr_no, photo_path 
                     FROM container_photos 
                     WHERE id = ANY($1) AND (is_deleted IS NULL OR is_deleted = false)`,
                    [ids]
                );
                photos = res.rows;
            } else {
                const cntrNos = cntrNosParam!.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                let query = `
                    SELECT cntr_no, photo_path 
                    FROM container_photos 
                    WHERE cntr_no = ANY($1)
                      AND (is_deleted IS NULL OR is_deleted = false)
                `;
                const params: (string | Date | string[])[] = [cntrNos];
                let paramIdx = 2;

                if (startDate) {
                    query += ` AND uploaded_at AT TIME ZONE 'Asia/Seoul' >= ${paramIdx++}::timestamp`;
                    params.push(`${startDate} 19:00:00`);
                }
                if (endDate) {
                    query += ` AND uploaded_at AT TIME ZONE 'Asia/Seoul' <= (${paramIdx++}::date + INTERVAL '1 day 18 hours 59 minutes 59.999 seconds')`;
                    params.push(endDate);
                }
                if (userId) {
                    query += ` AND uploaded_by = ${paramIdx++}`;
                    params.push(userId);
                }

                const res = await client.query(query, params);
                photos = res.rows;
            }
        } finally {
            client.release();
        }

        if (photos.length === 0) {
            return new NextResponse('No photos found for selected containers', { status: 404 });
        }

        const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

        // 2. Build ZIP using JSZip (pure JS, no native streams needed)
        const zip = new JSZip();

        // Read all files concurrently for speed
        await Promise.all(
            photos.map(async (photo) => {
                const relativePath = photo.photo_path;
                const fullPath = path.resolve(uploadsDir, relativePath);

                // Security check: ensure filePath is inside uploads directory
                if (fullPath.startsWith(uploadsDir) && fs.existsSync(fullPath)) {
                    const fileBuffer = await fs.promises.readFile(fullPath);
                    zip.file(relativePath, fileBuffer);
                }
            })
        );

        // 3. Generate zip as Node.js Buffer
        // JPEG files are already compressed - use STORE (no re-compression) for maximum speed
        const zipBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'STORE'
        });

        // 4. Return the completed buffer as a ZIP response
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `container_photos_${todayStr}.zip`;

        return new NextResponse(new Uint8Array(zipBuffer), {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(zipBuffer.length),
                'Cache-Control': 'no-cache'
            }
        });

    } catch (error) {
        console.error('Zip Download Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
