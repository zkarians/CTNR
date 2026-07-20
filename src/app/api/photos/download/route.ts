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
        const cntrNosParam = searchParams.get('cntrNos'); // comma-separated container numbers
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const userId = searchParams.get('userId');

        if (!cntrNosParam) {
            return new NextResponse('No containers specified', { status: 400 });
        }

        const cntrNos = cntrNosParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        if (cntrNos.length === 0) {
            return new NextResponse('No containers specified', { status: 400 });
        }

        // 1. Fetch photo paths from the database for the selected containers and filters
        const client = await pool.connect();
        let photos: { cntr_no: string; photo_path: string }[] = [];
        try {
            let query = `
                SELECT cntr_no, photo_path 
                FROM container_photos 
                WHERE cntr_no = ANY($1)
                  AND (is_deleted IS NULL OR is_deleted = false)
            `;
            const params: (string | Date | string[])[] = [cntrNos];
            let paramIdx = 2;

            if (startDate) {
                query += ` AND uploaded_at >= $${paramIdx++}`;
                params.push(new Date(startDate + 'T00:00:00.000Z'));
            }
            if (endDate) {
                query += ` AND uploaded_at <= $${paramIdx++}`;
                params.push(new Date(endDate + 'T23:59:59.999Z'));
            }
            if (userId) {
                query += ` AND uploaded_by = $${paramIdx++}`;
                params.push(userId);
            }

            const res = await client.query(query, params);
            photos = res.rows;
        } finally {
            client.release();
        }

        if (photos.length === 0) {
            return new NextResponse('No photos found for selected containers', { status: 404 });
        }

        const uploadsDir = path.join(process.cwd(), 'uploads');

        // 2. Build ZIP using JSZip (pure JS, no native streams needed)
        const zip = new JSZip();

        for (const photo of photos) {
            const relativePath = photo.photo_path;
            const fullPath = path.resolve(uploadsDir, relativePath);

            // Security check: ensure filePath is inside uploads directory
            if (fullPath.startsWith(uploadsDir) && fs.existsSync(fullPath)) {
                const fileBuffer = fs.readFileSync(fullPath);
                zip.file(relativePath, fileBuffer);
            }
        }

        // 3. Generate zip as Node.js Buffer
        const zipBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
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
